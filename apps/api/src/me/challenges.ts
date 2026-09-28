import type { Context, Hono } from "hono";
import { createHash } from "node:crypto";
import {
  challengeCreateRequestSchema,
  challengeJoinRequestSchema,
  uuidSchema,
  type ChallengeBody,
  type SimId,
} from "@egemed/contracts";
import { ausculta } from "@egemed/assessment-bank";
import { duelBadgeIds, duelStatsFrom, type DuelOutcomeRow } from "@egemed/gami-catalogs";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { toIstanbulIso } from "../admin/users";
import type { AuthDeps } from "../auth/routes";
import type { GamificationRepo } from "./gamification";
import type { LearnRepo } from "./learn";
import {
  CHALLENGE_PER_CASE_MS,
  CHALLENGE_TOTAL_MS,
  newSessionRow,
  sessionBody,
  type SimSessionRepo,
  type SimSessionRow,
} from "./simSessions";

/**
 * Meydan Okuma (ADR-010, kabul 27 Eylül 2026): eşzamansız, süreli düello.
 * - Davet 6 haneli kodla; kod yalnız sha256 özeti olarak saklanır, 24 saat geçerli, tek rakip.
 * - Kullanıcı arama/liste yok (KVKK); ad yalnız düellonun iki tarafına görünür.
 * - Öğretim üyesi ve ziyaretçi katılamaz; kişi kendi davetine katılamaz; aynı kurum + sim erişimi şart.
 * - Öğrenme kilidi (27 Eyl 2026): ilgili simin öğrenme modu tamamlanmadan ne oluşturma
 *   ne katılma; ihlal `forbidden` + `learn_required` (403).
 * - En fazla 3 açık davet; 24 saatte en fazla 10 düello oluşturma.
 * - İki tarafa aynı vakalar aynı sırayla ve aynı seçenek sırasıyla (tohum) verilir; süreyi sunucu ölçer.
 * - Düello denemesi `challenge` modunda yazılır: yarım XP, liderliğe/aylık ödüle girmez.
 */

export const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
export const CHALLENGE_MAX_OPEN = 3;
export const CHALLENGE_DAILY_MAX = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_SIMS: readonly SimId[] = ["ausculta"];

export type ChallengeStatus = "open" | "accepted" | "finished" | "expired";

/** Düello sonucu: beraberlikte kazanan yoktur (`winner` null değil "draw"). */
export type ChallengeWinner = "inviter" | "opponent" | "draw";

export interface ChallengeRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly inviterId: string;
  readonly opponentId: string | null;
  readonly codeHash: string;
  readonly caseIds: readonly string[];
  readonly shuffleSeed: number;
  readonly status: ChallengeStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly acceptedAt: number | null;
  /** İki taraf da bitirdiyse sonuç; sonuçlanmamışsa null. */
  readonly winner: ChallengeWinner | null;
  /** İki taraf da bitirdiğinde yazılan bitiş anı. */
  readonly finishedAt: number | null;
}

export interface ChallengeRepo {
  create(record: ChallengeRecord): Promise<void>;
  get(id: string): Promise<ChallengeRecord | null>;
  /** Açık ve süresi geçmemiş davet (kod özetiyle). */
  findOpenByCodeHash(codeHash: string, at: number): Promise<ChallengeRecord | null>;
  /** Yalnız açık ve rakipsizse kabul eder (yarış koşuluna karşı koşullu güncelleme). */
  accept(id: string, opponentId: string, at: number): Promise<boolean>;
  /** İki taraf da bitirince sonucu ve bitiş anını yazar (T221 düello rozetleri). */
  finish(id: string, winner: ChallengeWinner, at: number): Promise<void>;
  countOpenByInviter(userId: string, at: number): Promise<number>;
  countCreatedSince(userId: string, since: number): Promise<number>;
  listForUser(userId: string, limit: number): Promise<readonly ChallengeRecord[]>;
  /** Kullanıcının o simdeki sonuçlanmış düelloları (rozet istatistiği; T221). */
  listDuelOutcomes(simId: SimId, userId: string): Promise<readonly DuelOutcomeRow[]>;
}

export interface ChallengeDeps {
  readonly auth: AuthDeps;
  readonly challenges: ChallengeRepo;
  /** Öğrenme kilidi (27 Eyl 2026): ilgili simin tamamlama kaydı yoksa düello yok. */
  readonly learn: LearnRepo;
  readonly sessions: SimSessionRepo;
  readonly random: () => number;
  readonly newId: () => string;
}

export function hashChallengeCode(code: string): string {
  return createHash("sha256").update(`egemed-challenge:${code}`, "utf8").digest("hex");
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function effectiveStatus(record: ChallengeRecord, at: number): ChallengeStatus {
  return record.status === "open" && at > record.expiresAt ? "expired" : record.status;
}

/** Düello sonucu: önce puan, eşitlikte kısa süre; ikisi de eşitse berabere. */
function decideWinner(inviter: { score: number; durationMs: number }, opponent: { score: number; durationMs: number }): "inviter" | "opponent" | "draw" {
  if (inviter.score !== opponent.score) return inviter.score > opponent.score ? "inviter" : "opponent";
  if (inviter.durationMs !== opponent.durationMs) return inviter.durationMs < opponent.durationMs ? "inviter" : "opponent";
  return "draw";
}

/** Oturumun düello puanı/süresi; oturum yoksa ya da bitmemişse sıfır. */
function duelScore(session: SimSessionRow | undefined): { readonly score: number; readonly durationMs: number } {
  return {
    score: session?.state.total ?? 0,
    durationMs: session === undefined || session.finishedAt === null ? 0 : session.finishedAt - session.startedAt,
  };
}

export function registerChallengeRoutes(app: Hono<AppEnv>, deps: ChallengeDeps, now: () => number): void {
  async function displayName(userId: string): Promise<string> {
    const context = await deps.auth.users.getMeContext(userId);
    return context?.displayName ?? "Silinmiş kullanıcı";
  }

  /** Öğrenme kilidi: simin tamamlama kaydı yoksa meydan okuma yok (27 Eyl 2026). */
  async function learnCompleted(userId: string, simId: SimId): Promise<boolean> {
    return (await deps.learn.list(userId)).some((record) => record.simId === simId);
  }

  function learnRequired(c: Context<AppEnv>) {
    return jsonError(c, "forbidden", { issues: [{ code: "learn_required" }] });
  }

  async function body(record: ChallengeRecord, viewerId: string, at: number, code: string | null = null): Promise<ChallengeBody> {
    const status = effectiveStatus(record, at);
    const sessions = await deps.sessions.listByChallenge(record.id);
    const sessionOf = (userId: string | null): SimSessionRow | undefined =>
      userId === null ? undefined : sessions.find((session) => session.userId === userId);
    const results = [
      { role: "inviter" as const, userId: record.inviterId, session: sessionOf(record.inviterId) },
      ...(record.opponentId === null ? [] : [{ role: "opponent" as const, userId: record.opponentId, session: sessionOf(record.opponentId) }]),
    ];
    const bothDone = results.length === 2 && results.every((entry) => entry.session?.status === "finished");
    const participants = await Promise.all(
      results.map(async (entry) => ({
        role: entry.role,
        displayName: await displayName(entry.userId),
        isMe: entry.userId === viewerId,
        finished: entry.session?.status === "finished",
        score: bothDone ? duelScore(entry.session).score : null,
        durationMs: bothDone ? duelScore(entry.session).durationMs : null,
      })),
    );
    const winner = bothDone ? decideWinner(duelScore(results[0]?.session), duelScore(results[1]?.session)) : null;
    return {
      challengeId: record.id,
      simId: record.simId,
      status: bothDone ? "finished" : status,
      code: code !== null && status === "open" && viewerId === record.inviterId ? code : null,
      caseCount: record.caseIds.length,
      perCaseLimitMs: CHALLENGE_PER_CASE_MS,
      totalLimitMs: CHALLENGE_TOTAL_MS,
      expiresAt: toIstanbulIso(record.expiresAt),
      participants,
      winner,
      mySessionId: sessionOf(viewerId)?.id ?? null,
    };
  }

  /** Görüntüleyen düellonun tarafı değilse 404 (varlık sızdırılmaz). */
  async function loadOwn(c: Context<AppEnv>): Promise<{ readonly record: ChallengeRecord } | { readonly error: ReturnType<typeof jsonError> }> {
    const id = uuidSchema.safeParse(c.req.param("challengeId"));
    if (!id.success) return { error: jsonError(c, "not_found") };
    const record = await deps.challenges.get(id.data);
    const me = c.get("meActor").userId;
    if (record === null || (record.inviterId !== me && record.opponentId !== me)) return { error: jsonError(c, "not_found") };
    return { record };
  }

  app.post("/me/challenges", async (c) => {
    const actor = c.get("meActor");
    if (!actor.gamified) return jsonError(c, "role_not_permitted");
    const parsed = challengeCreateRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    if (!CHALLENGE_SIMS.includes(parsed.data.simId)) return jsonError(c, "not_found");
    if (!actor.simAccess.includes(parsed.data.simId)) return jsonError(c, "forbidden");
    // Öğrenme kilidi: ilgili simin öğrenme modu tamamlanmadan düello oluşturulamaz.
    if (!(await learnCompleted(actor.userId, parsed.data.simId))) return learnRequired(c);
    const at = now();
    if ((await deps.challenges.countOpenByInviter(actor.userId, at)) >= CHALLENGE_MAX_OPEN) {
      return jsonError(c, "conflict", { issues: [{ code: "too_many_open_challenges" }] });
    }
    if ((await deps.challenges.countCreatedSince(actor.userId, at - DAY_MS)) >= CHALLENGE_DAILY_MAX) return jsonError(c, "rate_limited");
    let code = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = String(Math.floor(deps.random() * 1_000_000)).padStart(6, "0");
      if ((await deps.challenges.findOpenByCodeHash(hashChallengeCode(candidate), at)) === null) {
        code = candidate;
        break;
      }
    }
    if (code === "") return jsonError(c, "conflict", { issues: [{ code: "code_space_busy" }] });
    const record: ChallengeRecord = {
      id: deps.newId(),
      institutionId: actor.institutionId,
      simId: parsed.data.simId,
      inviterId: actor.userId,
      opponentId: null,
      codeHash: hashChallengeCode(code),
      caseIds: ausculta.selectCaseIds("challenge", deps.random),
      shuffleSeed: Math.floor(deps.random() * 2 ** 31),
      status: "open",
      createdAt: at,
      expiresAt: at + CHALLENGE_TTL_MS,
      acceptedAt: null,
      winner: null,
      finishedAt: null,
    };
    await deps.challenges.create(record);
    return c.json({ data: await body(record, actor.userId, at, code) }, 201);
  });

  app.post("/me/challenges/join", async (c) => {
    const actor = c.get("meActor");
    if (!actor.gamified) return jsonError(c, "role_not_permitted");
    const parsed = challengeJoinRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const at = now();
    const record = await deps.challenges.findOpenByCodeHash(hashChallengeCode(parsed.data.code), at);
    // Başka kurumun daveti de "bulunamadı" (varlık sızdırılmaz).
    if (record === null || record.institutionId !== actor.institutionId) return jsonError(c, "not_found");
    if (record.inviterId === actor.userId) return jsonError(c, "conflict", { issues: [{ code: "own_challenge" }] });
    if (!actor.simAccess.includes(record.simId)) return jsonError(c, "forbidden");
    // Öğrenme kilidi: davetin simi için tamamlama kaydı yoksa katılınamaz.
    if (!(await learnCompleted(actor.userId, record.simId))) return learnRequired(c);
    if (!(await deps.challenges.accept(record.id, actor.userId, at))) return jsonError(c, "conflict", { issues: [{ code: "challenge_taken" }] });
    const accepted = await deps.challenges.get(record.id);
    return c.json({ data: await body(accepted ?? record, actor.userId, at) });
  });

  app.get("/me/challenges", async (c) => {
    const actor = c.get("meActor");
    const at = now();
    const records = await deps.challenges.listForUser(actor.userId, 20);
    return c.json({ data: await Promise.all(records.map((record) => body(record, actor.userId, at))) });
  });

  app.get("/me/challenges/:challengeId", async (c) => {
    const loaded = await loadOwn(c);
    if ("error" in loaded) return loaded.error;
    return c.json({ data: await body(loaded.record, c.get("meActor").userId, now()) });
  });

  /** Düello oturumu: davet eden hemen, rakip kabulden sonra; kişi başı tek oturum (tekrar çağrı aynısını döner). */
  app.post("/me/challenges/:challengeId/session", async (c) => {
    const loaded = await loadOwn(c);
    if ("error" in loaded) return loaded.error;
    const { record } = loaded;
    const actor = c.get("meActor");
    if (!actor.gamified) return jsonError(c, "role_not_permitted");
    const at = now();
    const status = effectiveStatus(record, at);
    const isInviter = record.inviterId === actor.userId;
    if (status === "expired" && !(isInviter && record.opponentId !== null)) return jsonError(c, "conflict", { issues: [{ code: "challenge_expired" }] });
    if (!isInviter && status !== "accepted" && status !== "finished") return jsonError(c, "conflict", { issues: [{ code: "challenge_not_accepted" }] });
    const existing = (await deps.sessions.listByChallenge(record.id)).find((session) => session.userId === actor.userId);
    if (existing !== undefined) {
      if (existing.status !== "open") return jsonError(c, "conflict", { issues: [{ code: "challenge_already_played" }] });
      return c.json({ data: sessionBody(existing) });
    }
    const row = newSessionRow({
      id: deps.newId(),
      userId: actor.userId,
      institutionId: actor.institutionId,
      simId: record.simId,
      mode: "challenge",
      caseIds: record.caseIds,
      at,
      challengeId: record.id,
      shuffleSeed: record.shuffleSeed,
    });
    await deps.sessions.create(row);
    return c.json({ data: sessionBody(row) }, 201);
  });
}

/**
 * Sim oturumu bitince: iki taraf da bitirdiyse düello `finished` olur; kazanan,
 * bitiş anı ve düello rozetleri (T221) yazılır. Rozet yazımı oturum kaydını
 * geri almaz: hata yutulur, sonraki bitişte yeniden değerlendirilir.
 */
export function challengeFinishedHook(
  deps: Pick<ChallengeDeps, "challenges" | "sessions"> & { readonly gamification: GamificationRepo },
) {
  return async (row: SimSessionRow): Promise<void> => {
    if (row.challengeId === null) return;
    const record = await deps.challenges.get(row.challengeId);
    if (record === null || record.opponentId === null) return;
    const sessions = await deps.sessions.listByChallenge(record.id);
    const inviter = sessions.find((session) => session.userId === record.inviterId);
    const opponent = sessions.find((session) => session.userId === record.opponentId);
    if (inviter?.status !== "finished" || opponent?.status !== "finished") return;
    const at = row.finishedAt ?? opponent.finishedAt ?? inviter.finishedAt;
    if (at === null) return;
    const winner = decideWinner(duelScore(inviter), duelScore(opponent));
    if (record.status !== "finished") await deps.challenges.finish(record.id, winner, at);
    try {
      await awardDuelBadges(deps.challenges, deps.gamification, record, at);
    } catch {
      // Rozet yazımı düello sonucunu geri almaz.
    }
  };
}

/**
 * ADR-010/T221: düello sonuçlarından — deneme özetlerinden DEĞİL — her iki
 * tarafın o simdeki düello rozetleri değerlendirilir ve idempotent yazılır
 * (`sim_id` düellonun simi). Kazanılanlar kümesi `on conflict do nothing` ile
 * yazılır; aynı sonuç tekrar işlense de rozet çoğaltmaz.
 */
async function awardDuelBadges(
  challenges: ChallengeRepo,
  gamification: GamificationRepo,
  record: ChallengeRecord,
  at: number,
): Promise<void> {
  const now = new Date(at);
  for (const userId of [record.inviterId, record.opponentId]) {
    if (userId === null) continue;
    const rows = await challenges.listDuelOutcomes(record.simId, userId);
    const badgeKeys = duelBadgeIds(duelStatsFrom(rows, userId), now);
    if (badgeKeys.length > 0) {
      await gamification.awardBadges({ userId, simId: record.simId, badgeKeys, at });
    }
  }
}

// --- Depolar -------------------------------------------------------------------

export interface ChallengeDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface PgChallengeRow {
  readonly id: string;
  readonly institution_id: string;
  readonly sim_id: SimId;
  readonly inviter_id: string;
  readonly opponent_id: string | null;
  readonly code_hash: string;
  readonly case_ids: readonly string[];
  readonly shuffle_seed: string | number;
  readonly status: ChallengeStatus;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly accepted_at: Date | null;
  readonly winner_id: string | null;
  readonly finished_at: Date | null;
}

const COLUMNS = "id, institution_id, sim_id, inviter_id, opponent_id, code_hash, case_ids, shuffle_seed, status, created_at, expires_at, accepted_at, winner_id, finished_at";

function fromRow(row: PgChallengeRow): ChallengeRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    simId: row.sim_id,
    inviterId: row.inviter_id,
    opponentId: row.opponent_id,
    codeHash: row.code_hash,
    caseIds: [...row.case_ids],
    shuffleSeed: Number(row.shuffle_seed),
    status: row.status,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    acceptedAt: row.accepted_at === null ? null : row.accepted_at.getTime(),
    winner:
      row.finished_at === null || row.opponent_id === null
        ? null
        : row.winner_id === null
          ? "draw"
          : row.winner_id === row.inviter_id
            ? "inviter"
            : "opponent",
    finishedAt: row.finished_at === null ? null : row.finished_at.getTime(),
  };
}

export function createPgChallengeRepo(db: ChallengeDb): ChallengeRepo {
  return {
    async create(record) {
      await db.query(
        `insert into challenges (id, institution_id, sim_id, inviter_id, opponent_id, code_hash, case_ids, shuffle_seed, status, created_at, expires_at)
         values ($1, $2, $3, $4, null, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.institutionId,
          record.simId,
          record.inviterId,
          record.codeHash,
          record.caseIds,
          record.shuffleSeed,
          record.status,
          new Date(record.createdAt),
          new Date(record.expiresAt),
        ],
      );
    },
    async get(id) {
      const result = await db.query(`select ${COLUMNS} from challenges where id = $1`, [id]);
      const row = result.rows[0] as PgChallengeRow | undefined;
      return row === undefined ? null : fromRow(row);
    },
    async findOpenByCodeHash(codeHash, at) {
      const result = await db.query(
        `select ${COLUMNS} from challenges where code_hash = $1 and status = 'open' and expires_at > $2 order by created_at desc limit 1`,
        [codeHash, new Date(at)],
      );
      const row = result.rows[0] as PgChallengeRow | undefined;
      return row === undefined ? null : fromRow(row);
    },
    async accept(id, opponentId, at) {
      const result = await db.query(
        "update challenges set opponent_id = $2, status = 'accepted', accepted_at = $3 where id = $1 and status = 'open' and opponent_id is null returning id",
        [id, opponentId, new Date(at)],
      );
      return result.rows.length === 1;
    },
    async finish(id, winner, at) {
      await db.query(
        `update challenges
         set status = 'finished',
             winner_id = case when $2 = 'draw' then null when $2 = 'inviter' then inviter_id else opponent_id end,
             finished_at = $3
         where id = $1`,
        [id, winner, new Date(at)],
      );
    },
    async countOpenByInviter(userId, at) {
      const result = await db.query("select count(*)::int as n from challenges where inviter_id = $1 and status = 'open' and expires_at > $2", [
        userId,
        new Date(at),
      ]);
      return Number((result.rows[0] as { readonly n?: unknown } | undefined)?.n ?? 0);
    },
    async countCreatedSince(userId, since) {
      const result = await db.query("select count(*)::int as n from challenges where inviter_id = $1 and created_at > $2", [userId, new Date(since)]);
      return Number((result.rows[0] as { readonly n?: unknown } | undefined)?.n ?? 0);
    },
    async listForUser(userId, limit) {
      const result = await db.query(
        `select ${COLUMNS} from challenges where inviter_id = $1 or opponent_id = $1 order by created_at desc limit $2`,
        [userId, limit],
      );
      return (result.rows as readonly PgChallengeRow[]).map(fromRow);
    },
    async listDuelOutcomes(simId, userId) {
      const result = await db.query(
        `select inviter_id, opponent_id, winner_id, finished_at from challenges
         where sim_id = $1 and status = 'finished' and finished_at is not null and (inviter_id = $2 or opponent_id = $2)`,
        [simId, userId],
      );
      return (result.rows as readonly Pick<PgChallengeRow, "inviter_id" | "opponent_id" | "winner_id" | "finished_at">[]).map(
        (row): DuelOutcomeRow => ({
          inviterId: row.inviter_id,
          opponentId: row.opponent_id,
          winner: row.finished_at === null || row.opponent_id === null ? null : row.winner_id === null ? "draw" : row.winner_id === row.inviter_id ? "inviter" : "opponent",
          finishedAt: row.finished_at === null ? null : row.finished_at.getTime(),
        }),
      );
    },
  };
}

export function createMemoryChallengeRepo(): ChallengeRepo & { readonly records: Map<string, ChallengeRecord> } {
  const records = new Map<string, ChallengeRecord>();
  return {
    records,
    async create(record) {
      records.set(record.id, { ...record });
    },
    async get(id) {
      const record = records.get(id);
      return record === undefined ? null : { ...record };
    },
    async findOpenByCodeHash(codeHash, at) {
      return [...records.values()].find((record) => record.codeHash === codeHash && record.status === "open" && record.expiresAt > at) ?? null;
    },
    async accept(id, opponentId, at) {
      const record = records.get(id);
      if (record === undefined || record.status !== "open" || record.opponentId !== null) return false;
      records.set(id, { ...record, opponentId, status: "accepted", acceptedAt: at });
      return true;
    },
    async finish(id, winner, at) {
      const record = records.get(id);
      if (record !== undefined) records.set(id, { ...record, status: "finished", winner, finishedAt: at });
    },
    async countOpenByInviter(userId, at) {
      return [...records.values()].filter((record) => record.inviterId === userId && record.status === "open" && record.expiresAt > at).length;
    },
    async countCreatedSince(userId, since) {
      return [...records.values()].filter((record) => record.inviterId === userId && record.createdAt > since).length;
    },
    async listForUser(userId, limit) {
      return [...records.values()]
        .filter((record) => record.inviterId === userId || record.opponentId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    async listDuelOutcomes(simId, userId) {
      return [...records.values()]
        .filter(
          (record) =>
            record.simId === simId &&
            record.status === "finished" &&
            (record.inviterId === userId || record.opponentId === userId),
        )
        .map((record): DuelOutcomeRow => ({
          inviterId: record.inviterId,
          opponentId: record.opponentId,
          winner: record.finishedAt === null || record.opponentId === null ? null : record.winner,
          finishedAt: record.finishedAt,
        }));
    },
  };
}

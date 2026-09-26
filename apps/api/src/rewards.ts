import type { Context, Hono } from "hono";
import {
  SIM_IDS,
  gamiSimIdParamSchema,
  rewardMonthSchema,
  rewardUpsertRequestSchema,
  type RewardBody,
  type RewardUpsertRequest,
  type RewardWinnerBody,
  type SimId,
} from "@egemed/contracts";
import { monthKeyTr } from "@egemed/gamification-core";
import { jsonError, validationDetails, type AppEnv } from "./http";
import { insertAdminAudit, toIstanbulIso, type AdminDeps } from "./admin/users";
import type { GamificationRepo } from "./me/gamification";

/**
 * Aylık ödüller (depo sahibi kararı, 26 Eylül 2026): admin panelinden sim × ay
 * başına yönetilir. Ödül sim kapsamlıdır (ADR-006). Kazananlar ay kapandıktan
 * sonra admin "kesinleştir" dediğinde o ayın sim sıralamasından anlık görüntü
 * olarak yazılır; yalnız uygunluk koşullarını sağlayan öğrenciler seçilir
 * (öğretim üyesi zaten sıralamada yoktur, T171).
 */

export interface RewardWinnerRecord {
  readonly rank: number;
  readonly displayName: string;
  readonly score: number;
}

export interface RewardRecord {
  readonly simId: SimId;
  readonly month: string;
  readonly title: string;
  readonly description: string;
  readonly sponsor: string;
  readonly winnersCount: number;
  readonly cohorts: readonly number[];
  readonly minAssessments: number;
  readonly requirePublicName: boolean;
  readonly terms: readonly string[];
  readonly finalizedAt: number | null;
  readonly updatedAt: number;
  readonly winners: readonly RewardWinnerRecord[];
}

export interface RewardUpsertInput extends RewardUpsertRequest {
  readonly institutionId: string;
  readonly simId: SimId;
  readonly month: string;
  readonly actorUserId: string;
  readonly at: number;
}

export type RewardWriteOutcome = "ok" | "not_found" | "finalized";

export interface RewardsRepo {
  /** Kurumun ödülleri; en yeni ay önce. `simId` verilirse yalnız o sim. */
  list(institutionId: string, simId?: SimId): Promise<readonly RewardRecord[]>;
  get(institutionId: string, simId: SimId, month: string): Promise<RewardRecord | null>;
  /** Kesinleşmiş ödül değiştirilemez (`finalized`). */
  upsert(input: RewardUpsertInput): Promise<{ readonly outcome: "ok" | "finalized"; readonly reward: RewardRecord | null }>;
  remove(institutionId: string, simId: SimId, month: string): Promise<RewardWriteOutcome>;
  finalize(
    institutionId: string,
    simId: SimId,
    month: string,
    winners: readonly RewardWinnerRecord[],
    at: number,
  ): Promise<RewardWriteOutcome>;
}

/** Türkiye 2016'dan beri sabit UTC+3'tür; ayın son milisaniyesi (İstanbul). */
export function monthEndTr(month: string): number {
  const [year, monthNo] = month.split("-").map(Number) as [number, number];
  return Date.UTC(year, monthNo, 1) - 3 * 60 * 60 * 1000 - 1;
}

function rewardBody(record: RewardRecord, month = record.month): RewardBody {
  return {
    simId: record.simId,
    month,
    title: record.title,
    description: record.description,
    sponsor: record.sponsor,
    winnersCount: record.winnersCount,
    eligibility: {
      cohorts: [...record.cohorts],
      minAssessments: record.minAssessments,
      requirePublicName: record.requirePublicName,
    },
    terms: [...record.terms],
    // Önceki ayın yapılandırması bu ay için geçerli sayılıyorsa bu ay henüz kesinleşmemiştir.
    finalizedAt: month === record.month && record.finalizedAt !== null ? toIstanbulIso(record.finalizedAt) : null,
    updatedAt: toIstanbulIso(record.updatedAt),
  };
}

function winnerBodies(record: RewardRecord): RewardWinnerBody[] {
  return record.winners.map((winner) => ({
    month: record.month,
    rank: winner.rank,
    displayName: winner.displayName,
    score: winner.score,
    // Kazanan anlık görüntüsü kullanıcı kimliği tutmaz (yalnız ad ve puan).
    isMe: false,
  }));
}

/**
 * İçinde bulunulan ayın ödülü: tam ay yoksa önceki son yapılandırma aynı koşullarla
 * bu ay için geçerlidir (`@egemed/gamification-core` `monthlyRewardFor` ile aynı kural).
 */
function currentReward(records: readonly RewardRecord[], month: string): RewardBody | null {
  const source =
    records.find((record) => record.month === month) ??
    [...records].filter((record) => record.month < month).sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  return source === undefined ? null : rewardBody(source, month);
}

function previousMonth(month: string): string {
  const [year, monthNo] = month.split("-").map(Number) as [number, number];
  return monthNo === 1 ? `${year - 1}-12` : `${year}-${String(monthNo - 1).padStart(2, "0")}`;
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export interface RewardsDeps {
  readonly admin: AdminDeps;
  readonly gamification: GamificationRepo;
  readonly rewards: RewardsRepo;
}

/** `/admin/*` ara katmanı (csrf + requireAdmin) önceden bağlanmış olmalıdır. */
export function registerAdminRewardRoutes(app: Hono<AppEnv>, deps: RewardsDeps, now: () => number): void {
  const parsePath = (c: Context<AppEnv>) => {
    const sim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    const month = rewardMonthSchema.safeParse(c.req.param("month"));
    return sim.success && month.success ? { simId: sim.data, month: month.data } : null;
  };

  app.get("/admin/rewards", async (c) => {
    const sim = c.req.query("simId");
    let simId: SimId | undefined;
    if (sim !== undefined) {
      const parsed = gamiSimIdParamSchema.safeParse(sim);
      if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
      simId = parsed.data;
    }
    const records = await deps.rewards.list(c.get("adminActor").institutionId, simId);
    return c.json({ data: records.map((record) => ({ ...rewardBody(record), winners: winnerBodies(record) })) });
  });

  app.put("/admin/rewards/:simId/:month", async (c) => {
    const path = parsePath(c);
    if (path === null) return jsonError(c, "not_found");
    const parsed = rewardUpsertRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const actor = c.get("adminActor");
    const at = now();
    const result = await deps.rewards.upsert({
      ...parsed.data,
      institutionId: actor.institutionId,
      simId: path.simId,
      month: path.month,
      actorUserId: actor.userId,
      at,
    });
    if (result.outcome === "finalized" || result.reward === null) return jsonError(c, "conflict");
    await insertAdminAudit(deps.admin, c, at, {
      action: "reward.upsert",
      targetType: "monthly_reward",
      targetId: `${path.simId}:${path.month}`,
      summaryAfter: { title: parsed.data.title, winnersCount: String(parsed.data.winnersCount) },
    });
    return c.json({ data: { ...rewardBody(result.reward), winners: winnerBodies(result.reward) } });
  });

  app.delete("/admin/rewards/:simId/:month", async (c) => {
    const path = parsePath(c);
    if (path === null) return jsonError(c, "not_found");
    const actor = c.get("adminActor");
    const outcome = await deps.rewards.remove(actor.institutionId, path.simId, path.month);
    if (outcome === "not_found") return jsonError(c, "not_found");
    if (outcome === "finalized") return jsonError(c, "conflict");
    await insertAdminAudit(deps.admin, c, now(), {
      action: "reward.delete",
      targetType: "monthly_reward",
      targetId: `${path.simId}:${path.month}`,
      summaryAfter: { deleted: "true" },
    });
    return c.body(null, 204);
  });

  /** Ay kapandıktan sonra kazananları o ayın sıralamasından kesinleştirir (tek sefer). */
  app.post("/admin/rewards/:simId/:month/finalize", async (c) => {
    const path = parsePath(c);
    if (path === null) return jsonError(c, "not_found");
    const actor = c.get("adminActor");
    const at = now();
    if (path.month >= monthKeyTr(new Date(at))) {
      return jsonError(c, "validation_failed", { issues: [{ code: "month_not_closed", path: ["month"] }] });
    }
    const reward = await deps.rewards.get(actor.institutionId, path.simId, path.month);
    if (reward === null) return jsonError(c, "not_found");
    if (reward.finalizedAt !== null) return jsonError(c, "conflict");
    const board = await deps.gamification.getLeaderboard({
      userId: actor.userId,
      institutionId: actor.institutionId,
      simId: path.simId,
      period: "month",
      cohort: "all",
      page: 1,
      pageSize: 1000,
      at: monthEndTr(path.month),
    });
    const winners = board.rows
      .filter(
        (row) =>
          row.periodScore !== null &&
          row.attemptsCount >= reward.minAssessments &&
          (!reward.requirePublicName || row.isPublic) &&
          row.cohort !== null &&
          reward.cohorts.includes(row.cohort),
      )
      .slice(0, reward.winnersCount)
      .map((row, index): RewardWinnerRecord => ({
        rank: index + 1,
        displayName: row.displayName,
        score: Math.round((row.periodScore ?? 0) * 100) / 100,
      }));
    const outcome = await deps.rewards.finalize(actor.institutionId, path.simId, path.month, winners, at);
    if (outcome === "not_found") return jsonError(c, "not_found");
    if (outcome === "finalized") return jsonError(c, "conflict");
    await insertAdminAudit(deps.admin, c, at, {
      action: "reward.finalize",
      targetType: "monthly_reward",
      targetId: `${path.simId}:${path.month}`,
      summaryAfter: { winners: String(winners.length) },
    });
    const saved = await deps.rewards.get(actor.institutionId, path.simId, path.month);
    return c.json({ data: saved === null ? null : { ...rewardBody(saved), winners: winnerBodies(saved) } });
  });
}

/** `/me/*` ara katmanı (csrf + oturum, `meActor`) önceden bağlanmış olmalıdır. */
export function registerMeRewardRoutes(app: Hono<AppEnv>, deps: Pick<RewardsDeps, "rewards">, now: () => number): void {
  app.get("/me/rewards", async (c) => {
    const actor = c.get("meActor");
    const month = monthKeyTr(new Date(now()));
    const last = previousMonth(month);
    const records = await deps.rewards.list(actor.institutionId);
    // Her sim ayrı blok; birleşik puan veya simler arası sıralama üretilmez (ADR-006).
    const sims = SIM_IDS.filter((simId) => actor.simAccess.includes(simId)).map((simId) => {
      const own = records.filter((record) => record.simId === simId);
      const lastRecord = own.find((record) => record.month === last && record.finalizedAt !== null);
      return {
        simId,
        current: currentReward(own, month),
        lastMonthWinners: lastRecord === undefined ? [] : winnerBodies(lastRecord),
      };
    });
    return c.json({ data: { sims } });
  });

  app.get("/me/rewards/:simId", async (c) => {
    const parsed = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!parsed.success) return jsonError(c, "not_found");
    const actor = c.get("meActor");
    if (!actor.simAccess.includes(parsed.data)) return jsonError(c, "forbidden");
    const month = monthKeyTr(new Date(now()));
    const own = await deps.rewards.list(actor.institutionId, parsed.data);
    const winners = own
      .filter((record) => record.month < month && record.finalizedAt !== null)
      .slice(0, 6)
      .flatMap(winnerBodies);
    return c.json({ data: { current: currentReward(own, month), winners } });
  });
}

// --- Depolar -------------------------------------------------------------------

interface PgRewardRow {
  readonly id: string;
  readonly sim_id: SimId;
  readonly month: string;
  readonly title: string;
  readonly description: string;
  readonly sponsor: string;
  readonly winners_count: number;
  readonly cohorts: readonly number[];
  readonly min_assessments: number;
  readonly require_public_name: boolean;
  readonly terms: readonly string[];
  readonly finalized_at: Date | null;
  readonly updated_at: Date;
}

interface PgWinnerRow {
  readonly reward_id: string;
  readonly rank: number;
  readonly display_name: string;
  readonly score: string | number;
}

export interface RewardsDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[]; readonly rowCount?: number | null }>;
}

const REWARD_COLUMNS =
  "id, sim_id, month, title, description, sponsor, winners_count, cohorts, min_assessments, require_public_name, terms, finalized_at, updated_at";

export function createPgRewardsRepo(db: RewardsDb): RewardsRepo {
  const hydrate = async (rows: readonly PgRewardRow[]): Promise<RewardRecord[]> => {
    if (rows.length === 0) return [];
    const winners = (await db.query(
      "select reward_id, rank, display_name, score from reward_winners where reward_id = any($1::uuid[]) order by rank",
      [rows.map((row) => row.id)],
    )).rows as readonly PgWinnerRow[];
    return rows.map((row) => ({
      simId: row.sim_id,
      month: row.month,
      title: row.title,
      description: row.description,
      sponsor: row.sponsor,
      winnersCount: row.winners_count,
      cohorts: [...row.cohorts],
      minAssessments: row.min_assessments,
      requirePublicName: row.require_public_name,
      terms: [...row.terms],
      finalizedAt: row.finalized_at === null ? null : row.finalized_at.getTime(),
      updatedAt: row.updated_at.getTime(),
      winners: winners
        .filter((winner) => winner.reward_id === row.id)
        .map((winner) => ({ rank: winner.rank, displayName: winner.display_name, score: Number(winner.score) })),
    }));
  };
  const one = async (institutionId: string, simId: SimId, month: string): Promise<PgRewardRow | null> => {
    const result = await db.query(
      `select ${REWARD_COLUMNS} from monthly_rewards where institution_id = $1 and sim_id = $2 and month = $3`,
      [institutionId, simId, month],
    );
    return (result.rows[0] as PgRewardRow | undefined) ?? null;
  };
  return {
    async list(institutionId, simId) {
      const result = await db.query(
        `select ${REWARD_COLUMNS} from monthly_rewards where institution_id = $1 and ($2::text is null or sim_id = $2) order by month desc, sim_id`,
        [institutionId, simId ?? null],
      );
      return hydrate(result.rows as readonly PgRewardRow[]);
    },
    async get(institutionId, simId, month) {
      const row = await one(institutionId, simId, month);
      return row === null ? null : ((await hydrate([row]))[0] ?? null);
    },
    async upsert(input) {
      const existing = await one(input.institutionId, input.simId, input.month);
      if (existing !== null && existing.finalized_at !== null) return { outcome: "finalized", reward: null };
      const result = await db.query(
        `insert into monthly_rewards (institution_id, sim_id, month, title, description, sponsor, winners_count, cohorts,
           min_assessments, require_public_name, terms, created_at, updated_at, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)
         on conflict (institution_id, sim_id, month) do update set
           title = excluded.title, description = excluded.description, sponsor = excluded.sponsor,
           winners_count = excluded.winners_count, cohorts = excluded.cohorts,
           min_assessments = excluded.min_assessments, require_public_name = excluded.require_public_name,
           terms = excluded.terms, updated_at = excluded.updated_at, updated_by = excluded.updated_by
         where monthly_rewards.finalized_at is null
         returning ${REWARD_COLUMNS}`,
        [
          input.institutionId,
          input.simId,
          input.month,
          input.title,
          input.description,
          input.sponsor,
          input.winnersCount,
          input.eligibility.cohorts,
          input.eligibility.minAssessments,
          input.eligibility.requirePublicName,
          input.terms,
          new Date(input.at),
          input.actorUserId,
        ],
      );
      const row = result.rows[0] as PgRewardRow | undefined;
      if (row === undefined) return { outcome: "finalized", reward: null };
      return { outcome: "ok", reward: (await hydrate([row]))[0] ?? null };
    },
    async remove(institutionId, simId, month) {
      const existing = await one(institutionId, simId, month);
      if (existing === null) return "not_found";
      if (existing.finalized_at !== null) return "finalized";
      await db.query("delete from monthly_rewards where id = $1 and finalized_at is null", [existing.id]);
      return "ok";
    },
    async finalize(institutionId, simId, month, winners, at) {
      const existing = await one(institutionId, simId, month);
      if (existing === null) return "not_found";
      const claimed = await db.query(
        "update monthly_rewards set finalized_at = $2, updated_at = $2 where id = $1 and finalized_at is null returning id",
        [existing.id, new Date(at)],
      );
      if (claimed.rows.length === 0) return "finalized";
      for (const winner of winners) {
        await db.query("insert into reward_winners (reward_id, rank, display_name, score) values ($1, $2, $3, $4)", [
          existing.id,
          winner.rank,
          winner.displayName,
          winner.score,
        ]);
      }
      return "ok";
    },
  };
}

/** Testler ve DB'siz geliştirme için bellek deposu. */
export function createMemoryRewardsRepo(): RewardsRepo {
  const records = new Map<string, RewardRecord & { readonly institutionId: string }>();
  const key = (institutionId: string, simId: SimId, month: string) => `${institutionId}|${simId}|${month}`;
  const strip = (record: RewardRecord & { readonly institutionId: string }): RewardRecord => ({
    simId: record.simId,
    month: record.month,
    title: record.title,
    description: record.description,
    sponsor: record.sponsor,
    winnersCount: record.winnersCount,
    cohorts: record.cohorts,
    minAssessments: record.minAssessments,
    requirePublicName: record.requirePublicName,
    terms: record.terms,
    finalizedAt: record.finalizedAt,
    updatedAt: record.updatedAt,
    winners: record.winners,
  });
  return {
    async list(institutionId, simId) {
      return [...records.values()]
        .filter((record) => record.institutionId === institutionId && (simId === undefined || record.simId === simId))
        .sort((a, b) => (a.month === b.month ? a.simId.localeCompare(b.simId) : a.month < b.month ? 1 : -1))
        .map(strip);
    },
    async get(institutionId, simId, month) {
      const record = records.get(key(institutionId, simId, month));
      return record === undefined ? null : strip(record);
    },
    async upsert(input) {
      const k = key(input.institutionId, input.simId, input.month);
      const existing = records.get(k);
      if (existing !== undefined && existing.finalizedAt !== null) return { outcome: "finalized", reward: null };
      const record = {
        institutionId: input.institutionId,
        simId: input.simId,
        month: input.month,
        title: input.title,
        description: input.description,
        sponsor: input.sponsor,
        winnersCount: input.winnersCount,
        cohorts: [...input.eligibility.cohorts],
        minAssessments: input.eligibility.minAssessments,
        requirePublicName: input.eligibility.requirePublicName,
        terms: [...input.terms],
        finalizedAt: null,
        updatedAt: input.at,
        winners: [],
      };
      records.set(k, record);
      return { outcome: "ok", reward: strip(record) };
    },
    async remove(institutionId, simId, month) {
      const k = key(institutionId, simId, month);
      const existing = records.get(k);
      if (existing === undefined) return "not_found";
      if (existing.finalizedAt !== null) return "finalized";
      records.delete(k);
      return "ok";
    },
    async finalize(institutionId, simId, month, winners, at) {
      const k = key(institutionId, simId, month);
      const existing = records.get(k);
      if (existing === undefined) return "not_found";
      if (existing.finalizedAt !== null) return "finalized";
      records.set(k, { ...existing, finalizedAt: at, updatedAt: at, winners: [...winners] });
      return "ok";
    },
  };
}

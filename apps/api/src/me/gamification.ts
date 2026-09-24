import type { Context, Hono, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  SIM_IDS,
  attemptWriteRequestSchema,
  gamiLeaderboardQuerySchema,
  gamiSimIdParamSchema,
  type GamiCohortFilter,
  type GamiPeriod,
  type SimId,
} from "@egemed/contracts";
import type { Period } from "@egemed/gamification-core";
import {
  buildLeaderboardRows,
  paginateRows,
  toLeaderboardRowResponses,
  type LeaderboardAttemptSeed,
  type LeaderboardPeerSeed,
} from "./leaderboard";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { csrfGuard, type AuthDeps } from "../auth/routes";
import { SESSION_COOKIE, createSessionService } from "../auth/session";
import { toIstanbulIso } from "../admin/users";

/**
 * T67 — `/me/gamification*` (E3 §d, §c): oturum sahibinin KENDİ oyunlaştırma
 * verisi. Kimlik yalnız sunucu tarafı oturumdan çözülür; yol, sorgu veya gövde
 * parametresiyle başkasının kimliği istenemez. `GET /me/gamification` üç simin
 * AYRI özetlerini döner (ADR-006/007: birleşik veya türetilmiş tek puan yok);
 * bilinmeyen sim 404'tür. `POST /me/gamification/:simId/attempts` gövdesi
 * `.strict()` kodlu özettir (ham yanıt/serbest metin reddedilir) ve istemcinin
 * ürettiği `id` ile idempotenttir: aynı gövde tekrarı yeni satır yazmaz, aynı
 * `id` farklı gövdeyle veya aynı `attemptNo` başka `id` ile gelirse 409
 * `conflict` döner. Tüm sorgular parametrelidir; `Date.now()` kullanılmaz.
 *
 * Veri yolu notu: XP/seviye/seri/rozet değerleri `gami_*` tablolarından okunur
 * (kurallar `gamification-core` kararıdır; bu modül kural üretmez). Haftalık
 * hedefin `currentXp` değeri, hafta içinde biten denemelerin kodlu özetindeki
 * `xp` kodunun toplamıdır; `targetXp` veri yolunun politika varsayılanıdır
 * (E3 §d örneğiyle aynı: 300). Profil satırı olmayan kullanıcı için özet
 * sıfırlanır (xp 0, seviye 1); liderlik sıralamasında yer almayan kullanıcı
 * `rank = total + 1` ile raporlanır.
 */

/** Haftalık XP hedefi; oyunlaştırma kuralları `gamification-core` kararıdır. */
export const WEEKLY_XP_TARGET = 300;
const BADGE_LIMIT = 10;
const ATTEMPT_LIMIT = 20;

/** Türkiye sabit ofseti: 2016'dan beri UTC+3 (DST yok). */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Enjekte edilen anın içinde bulunduğu haftanın Pazartesi 00:00 (UTC+3) anı. */
export function startOfWeekTr(at: number): number {
  const wallClock = new Date(at + TR_OFFSET_MS);
  const dayOfWeek = wallClock.getUTCDay(); // 0 = Pazar
  const deltaToMonday = (dayOfWeek + 6) % 7;
  return (
    Date.UTC(
      wallClock.getUTCFullYear(),
      wallClock.getUTCMonth(),
      wallClock.getUTCDate() - deltaToMonday,
    ) - TR_OFFSET_MS
  );
}

export interface GamiStreakRecord {
  readonly current: number;
  readonly best: number;
  readonly lastDate: string | null;
}

export interface GamiBadgeRecord {
  readonly key: string;
  readonly awardedAt: number;
}

/** Özet içindeki deneme satırı: sözleşmedeki dar alan kümesi (E3 §d). */
export interface GamiAttemptSummaryRecord {
  readonly attemptNo: number;
  readonly finishedAt: number;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly passed: boolean | null;
}

export interface GamiSimSummaryRecord {
  readonly simId: SimId;
  readonly xp: number;
  readonly level: number;
  readonly streak: GamiStreakRecord;
  readonly weeklyGoal: { readonly targetXp: number; readonly currentXp: number };
  readonly badges: readonly GamiBadgeRecord[];
  readonly leaderboard: { readonly rank: number; readonly total: number };
  readonly attempts: readonly GamiAttemptSummaryRecord[];
}

export interface GamiSummaryQuery {
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  /** Hafta penceresi ve sıralama bağlamı enjekte saatten türetilir. */
  readonly at: number;
}

export interface GamiLeaderboardQuery {
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly period: GamiPeriod;
  readonly cohort: GamiCohortFilter;
  readonly page: number;
  readonly pageSize: number;
  readonly at: number;
}

export interface GamiLeaderboardRecord {
  readonly period: GamiPeriod;
  readonly cohort: GamiCohortFilter;
  readonly generatedAt: number;
  readonly rows: ReturnType<typeof toLeaderboardRowResponses>;
  readonly total: number;
}

export interface GamiAttemptInput {
  /** İstemci üretir; anahtar budur ve yazma idempotenttir. */
  readonly id: string;
  readonly userId: string;
  readonly simId: SimId;
  readonly attemptNo: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly passed: boolean | null;
  readonly summary: Readonly<Record<string, number>>;
  readonly createdAt: number;
}

export interface GamiAttemptRecord {
  readonly id: string;
  readonly simId: SimId;
  readonly attemptNo: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly passed: boolean | null;
  readonly summary: Readonly<Record<string, number>>;
}

export type GamiAttemptWriteResult =
  | { readonly kind: "created"; readonly attempt: GamiAttemptRecord }
  | { readonly kind: "existing"; readonly attempt: GamiAttemptRecord }
  | { readonly kind: "conflict" }
  /** Şema `maxScore = 0` kabul eder ama `gami_attempts` check kısıtı pozitif ister. */
  | { readonly kind: "invalid" };

export interface GamificationRepo {
  getSummary(query: GamiSummaryQuery): Promise<GamiSimSummaryRecord>;
  getLeaderboard(query: GamiLeaderboardQuery): Promise<GamiLeaderboardRecord>;
  writeAttempt(input: GamiAttemptInput): Promise<GamiAttemptWriteResult>;
}

/** Havuzun depo katmanına görünen dar yüzeyi; `db.ts` çıktısı bunu karşılar. */
export interface GamiDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface GamiProfileRow {
  readonly xp: number | null;
  readonly level: number | null;
  readonly streak_current: number | null;
  readonly streak_best: number | null;
  readonly streak_last_date: string | null;
  readonly total: number;
  readonly user_rank: number | null;
}

interface GamiAttemptRow {
  readonly id: string;
  readonly sim_id: string;
  readonly attempt_no: number;
  readonly started_at: Date;
  readonly finished_at: Date;
  readonly score: number | null;
  readonly max_score: number | null;
  readonly passed: boolean | null;
  readonly summary: unknown;
}

interface GamiAttemptSummaryRow {
  readonly attempt_no: number;
  readonly finished_at: Date;
  readonly score: number | null;
  readonly max_score: number | null;
  readonly passed: boolean | null;
}

function toAttemptRecord(row: GamiAttemptRow): GamiAttemptRecord {
  return {
    id: row.id,
    simId: row.sim_id as SimId,
    attemptNo: row.attempt_no,
    startedAt: row.started_at.getTime(),
    finishedAt: row.finished_at.getTime(),
    score: row.score,
    maxScore: row.max_score,
    passed: row.passed,
    summary: row.summary as Readonly<Record<string, number>>,
  };
}

function toAttemptSummaryRecord(row: GamiAttemptSummaryRow): GamiAttemptSummaryRecord {
  return {
    attemptNo: row.attempt_no,
    finishedAt: row.finished_at.getTime(),
    score: row.score,
    maxScore: row.max_score,
    passed: row.passed,
  };
}

export function createPgGamificationRepo(db: GamiDb): GamificationRepo {
  return {
    async getSummary(query) {
      // Profil yoksa bile kurum+sim liderlik toplamı dönmelidir; bu yüzden
      // profil satırı `left join` ile okunur.
      const profileResult = await db.query(
        `with board as (select count(*)::int as total, max(case when l.user_id = $1 then l.rank end)::int as user_rank from gami_leaderboard l where l.institution_id = $2 and l.sim_id = $3)
         select p.xp, p.level, p.streak_current, p.streak_best, p.streak_last_date::text as streak_last_date, board.total, board.user_rank
         from board left join gami_profiles p on p.user_id = $1 and p.sim_id = $3`,
        [query.userId, query.institutionId, query.simId],
      );
      const [badgeResult, attemptResult, weeklyResult] = await Promise.all([
        db.query(
          "select badge_key, awarded_at from gami_badges where user_id = $1 and sim_id = $2 order by awarded_at desc, badge_key asc limit $3",
          [query.userId, query.simId, BADGE_LIMIT],
        ),
        db.query(
          "select attempt_no, finished_at, score, max_score, passed from gami_attempts where user_id = $1 and sim_id = $2 order by attempt_no desc limit $3",
          [query.userId, query.simId, ATTEMPT_LIMIT],
        ),
        // Haftalık XP: hafta içinde biten denemelerin kodlu özetindeki `xp` kodu.
        db.query(
          `select coalesce(sum(case when jsonb_typeof(a.summary -> 'xp') = 'number' and (a.summary ->> 'xp') ~ '^-?[0-9]{1,9}$' then (a.summary ->> 'xp')::int else 0 end), 0)::int as current_xp from gami_attempts a where a.user_id = $1 and a.sim_id = $2 and a.finished_at >= $3`,
          [query.userId, query.simId, new Date(startOfWeekTr(query.at))],
        ),
      ]);

      const profile = profileResult.rows[0] as GamiProfileRow | undefined;
      const weeklyRow = weeklyResult.rows[0] as { readonly current_xp?: unknown } | undefined;
      const total = profile?.total ?? 0;
      const rank = profile?.user_rank ?? total + 1;
      return {
        simId: query.simId,
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 1,
        streak: {
          current: profile?.streak_current ?? 0,
          best: profile?.streak_best ?? 0,
          lastDate: profile?.streak_last_date ?? null,
        },
        weeklyGoal: {
          targetXp: WEEKLY_XP_TARGET,
          currentXp: typeof weeklyRow?.current_xp === "number" ? weeklyRow.current_xp : 0,
        },
        badges: badgeResult.rows.map((row) => {
          const badge = row as { readonly badge_key: string; readonly awarded_at: Date };
          return { key: badge.badge_key, awardedAt: badge.awarded_at.getTime() };
        }),
        leaderboard: { rank, total },
        attempts: attemptResult.rows.map((row) => toAttemptSummaryRecord(row as GamiAttemptSummaryRow)),
      };
    },

    async writeAttempt(input) {
      // Şema `maxScore = 0`a izin verir; DB check kısıtı pozitif ister. İsteği
      // 500 yerine doğrulama hatası olarak raporlamak için burada yakalanır.
      if (input.maxScore === 0) return { kind: "invalid" };
      try {
        const inserted = await db.query(
          "insert into gami_attempts (id, user_id, sim_id, attempt_no, started_at, finished_at, score, max_score, passed, summary, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) on conflict (id) do nothing returning id, sim_id, attempt_no, started_at, finished_at, score, max_score, passed, summary",
          [
            input.id,
            input.userId,
            input.simId,
            input.attemptNo,
            new Date(input.startedAt),
            new Date(input.finishedAt),
            input.score,
            input.maxScore,
            input.passed,
            JSON.stringify(input.summary),
            new Date(input.createdAt),
          ],
        );
        const row = inserted.rows[0] as GamiAttemptRow | undefined;
        if (row !== undefined) return { kind: "created", attempt: toAttemptRecord(row) };
      } catch (error) {
        if (isCheckViolation(error)) return { kind: "invalid" };
        if (!isUniqueViolation(error)) throw error;
      }
      // `id` zaten var (idempotent tekrar) ya da `attemptNo` başka istemci
      // kimliğiyle çakıştı; ikisi ayrı sonuç doğurur.
      const existing = await db.query(
        "select id, sim_id, attempt_no, started_at, finished_at, score, max_score, passed, summary from gami_attempts where id = $1 and user_id = $2",
        [input.id, input.userId],
      );
      const row = existing.rows[0] as GamiAttemptRow | undefined;
      if (row === undefined) return { kind: "conflict" };
      const attempt = toAttemptRecord(row);
      return sameAttempt(attempt, input) ? { kind: "existing", attempt } : { kind: "conflict" };
    },

    async getLeaderboard(query) {
      const rows = await db.query(
        `select u.id as user_id, u.display_name, unit.code as unit_code, p.xp, p.level,
                a.finished_at, a.score
         from gami_profiles p
         join users u on u.id = p.user_id
         left join units unit on unit.id = u.unit_id and unit.deleted_at is null
         left join gami_attempts a on a.user_id = p.user_id and a.sim_id = p.sim_id
         where u.institution_id = $1 and p.sim_id = $2 and u.status = 'active' and u.deleted_at is null`,
        [query.institutionId, query.simId],
      );
      return assembleLeaderboardRecord(query, rows.rows as readonly PgLeaderboardSourceRow[]);
    },
  };
}

interface PgLeaderboardSourceRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly unit_code: string | null;
  readonly xp: number;
  readonly level: number;
  readonly finished_at: Date | null;
  readonly score: number | null;
}

function assembleLeaderboardRecord(
  query: GamiLeaderboardQuery,
  rows: readonly PgLeaderboardSourceRow[],
): GamiLeaderboardRecord {
  const peers = new Map<string, LeaderboardPeerSeed>();
  const profiles = new Map<string, { readonly xp: number; readonly level: number }>();
  const attempts: LeaderboardAttemptSeed[] = [];

  for (const row of rows) {
    if (!peers.has(row.user_id)) {
      peers.set(row.user_id, {
        userId: row.user_id,
        displayName: row.display_name,
        unitCode: row.unit_code,
        public: true,
      });
      profiles.set(row.user_id, { xp: row.xp, level: row.level });
    }
    if (row.finished_at !== null) {
      attempts.push({
        userId: row.user_id,
        simId: query.simId,
        finishedAt: row.finished_at.getTime(),
        score: row.score,
      });
    }
  }

  const ranked = buildLeaderboardRows({
    viewerUserId: query.userId,
    peers: [...peers.values()],
    profiles,
    attempts,
    simId: query.simId,
    period: query.period as Period,
    cohort: query.cohort,
    at: query.at,
  });
  const page = paginateRows(ranked, query.page, query.pageSize);
  return {
    period: query.period,
    cohort: query.cohort,
    generatedAt: query.at,
    rows: toLeaderboardRowResponses(page.rows, query.userId),
    total: page.total,
  };
}

interface PgErrorLike {
  readonly code?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as PgErrorLike).code === "23505";
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as PgErrorLike).code === "23514";
}

/** Kodlu özet karşılaştırması anahtar sırasından bağımsızdır. */
function canonicalSummary(summary: Readonly<Record<string, number>>): string {
  return JSON.stringify(
    Object.keys(summary)
      .sort()
      .map((key) => [key, summary[key]]),
  );
}

function sameAttempt(attempt: GamiAttemptRecord, input: GamiAttemptInput): boolean {
  return (
    attempt.attemptNo === input.attemptNo &&
    attempt.startedAt === input.startedAt &&
    attempt.finishedAt === input.finishedAt &&
    attempt.score === input.score &&
    attempt.maxScore === input.maxScore &&
    attempt.passed === input.passed &&
    canonicalSummary(attempt.summary) === canonicalSummary(input.summary)
  );
}

/** Bellek deposu tohumu; testler sentetik özet kaydeder. */
export interface MemoryGamiProfileSeed {
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly xp?: number;
  readonly level?: number;
  readonly streak?: GamiStreakRecord;
  readonly updatedAt?: number;
  readonly displayName?: string;
  readonly unitCode?: string | null;
  readonly public?: boolean;
}

export interface MemoryGamiBadgeSeed {
  readonly userId: string;
  readonly simId: SimId;
  readonly key: string;
  readonly awardedAt: number;
}

export interface MemoryGamiAttemptSeed {
  readonly id: string;
  readonly userId: string;
  readonly simId: SimId;
  readonly attemptNo: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly score?: number | null;
  readonly maxScore?: number | null;
  readonly passed?: boolean | null;
  readonly summary: Readonly<Record<string, number>>;
}

export interface MemoryGamificationSeed {
  readonly profiles?: readonly MemoryGamiProfileSeed[];
  readonly badges?: readonly MemoryGamiBadgeSeed[];
  readonly attempts?: readonly MemoryGamiAttemptSeed[];
}

export interface MemoryGamiProfileState {
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  xp: number;
  level: number;
  streak: GamiStreakRecord;
  updatedAt: number;
  displayName: string;
  unitCode: string | null;
  public: boolean;
}

export interface MemoryGamiAttemptState {
  readonly id: string;
  readonly userId: string;
  readonly simId: SimId;
  readonly attemptNo: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly passed: boolean | null;
  readonly summary: Readonly<Record<string, number>>;
}

/** Testlerin durum okuduğu bellek deposu (DB gerekmez). */
export interface MemoryGamificationStore {
  readonly repo: GamificationRepo;
  readonly profiles: Map<string, MemoryGamiProfileState>;
  readonly attempts: Map<string, MemoryGamiAttemptState>;
  readonly badges: MemoryGamiBadgeState[];
}

export interface MemoryGamiBadgeState {
  readonly userId: string;
  readonly simId: SimId;
  readonly key: string;
  readonly awardedAt: number;
}

function profileKey(userId: string, simId: SimId): string {
  return `${userId}:${simId}`;
}

export function createMemoryGamificationRepo(
  seed: MemoryGamificationSeed = {},
): MemoryGamificationStore {
  const profiles = new Map<string, MemoryGamiProfileState>();
  const attempts = new Map<string, MemoryGamiAttemptState>();
  const badges: MemoryGamiBadgeState[] = [];

  for (const profile of seed.profiles ?? []) {
    profiles.set(profileKey(profile.userId, profile.simId), {
      userId: profile.userId,
      institutionId: profile.institutionId,
      simId: profile.simId,
      xp: profile.xp ?? 0,
      level: profile.level ?? 1,
      streak: {
        current: profile.streak?.current ?? 0,
        best: profile.streak?.best ?? 0,
        lastDate: profile.streak?.lastDate ?? null,
      },
      updatedAt: profile.updatedAt ?? 0,
      displayName: profile.displayName ?? "Örnek Öğrenci",
      unitCode: profile.unitCode ?? null,
      public: profile.public ?? true,
    });
  }
  for (const badge of seed.badges ?? []) badges.push({ ...badge });
  for (const attempt of seed.attempts ?? []) {
    attempts.set(attempt.id, {
      id: attempt.id,
      userId: attempt.userId,
      simId: attempt.simId,
      attemptNo: attempt.attemptNo,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      score: attempt.score ?? null,
      maxScore: attempt.maxScore ?? null,
      passed: attempt.passed ?? null,
      summary: { ...attempt.summary },
    });
  }

  function weeklyXp(userId: string, simId: SimId, at: number): number {
    const weekStart = startOfWeekTr(at);
    let total = 0;
    for (const attempt of attempts.values()) {
      if (attempt.userId !== userId || attempt.simId !== simId) continue;
      if (attempt.finishedAt < weekStart) continue;
      total += attempt.summary["xp"] ?? 0;
    }
    return total;
  }

  const repo: GamificationRepo = {
    async getSummary(query) {
      const profile = profiles.get(profileKey(query.userId, query.simId));
      const peers = [...profiles.values()]
        .filter(
          (candidate) =>
            candidate.institutionId === query.institutionId && candidate.simId === query.simId,
        )
        .sort((a, b) => b.xp - a.xp || a.updatedAt - b.updatedAt);
      const position = peers.findIndex(
        (candidate) => candidate.userId === query.userId,
      );
      const total = peers.length;
      const rank = position === -1 ? total + 1 : position + 1;

      const userBadges = badges
        .filter((badge) => badge.userId === query.userId && badge.simId === query.simId)
        .sort((a, b) => b.awardedAt - a.awardedAt || a.key.localeCompare(b.key))
        .slice(0, BADGE_LIMIT)
        .map((badge) => ({ key: badge.key, awardedAt: badge.awardedAt }));

      const userAttempts = [...attempts.values()]
        .filter((attempt) => attempt.userId === query.userId && attempt.simId === query.simId)
        .sort((a, b) => b.attemptNo - a.attemptNo)
        .slice(0, ATTEMPT_LIMIT)
        .map((attempt) => ({
          attemptNo: attempt.attemptNo,
          finishedAt: attempt.finishedAt,
          score: attempt.score,
          maxScore: attempt.maxScore,
          passed: attempt.passed,
        }));

      return {
        simId: query.simId,
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 1,
        streak: profile === undefined
          ? { current: 0, best: 0, lastDate: null }
          : { ...profile.streak },
        weeklyGoal: {
          targetXp: WEEKLY_XP_TARGET,
          currentXp: weeklyXp(query.userId, query.simId, query.at),
        },
        badges: userBadges,
        leaderboard: { rank, total },
        attempts: userAttempts,
      };
    },

    async writeAttempt(input) {
      if (input.maxScore === 0) return { kind: "invalid" };
      const attempt: GamiAttemptRecord = {
        id: input.id,
        simId: input.simId,
        attemptNo: input.attemptNo,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        score: input.score,
        maxScore: input.maxScore,
        passed: input.passed,
        summary: { ...input.summary },
      };
      const byId = attempts.get(input.id);
      if (byId !== undefined) {
        return sameAttempt(byId, input)
          ? { kind: "existing", attempt }
          : { kind: "conflict" };
      }
      for (const candidate of attempts.values()) {
        if (
          candidate.userId === input.userId &&
          candidate.simId === input.simId &&
          candidate.attemptNo === input.attemptNo
        ) {
          return { kind: "conflict" };
        }
      }
      attempts.set(input.id, {
        id: input.id,
        userId: input.userId,
        simId: input.simId,
        attemptNo: input.attemptNo,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        score: input.score,
        maxScore: input.maxScore,
        passed: input.passed,
        summary: { ...input.summary },
      });
      return { kind: "created", attempt };
    },

    async getLeaderboard(query) {
      const peers = [...profiles.values()]
        .filter(
          (profile) =>
            profile.institutionId === query.institutionId && profile.simId === query.simId,
        )
        .map(
          (profile): LeaderboardPeerSeed => ({
            userId: profile.userId,
            displayName: profile.displayName,
            unitCode: profile.unitCode,
            public: profile.public,
          }),
        );
      const profileMap = new Map(
        peers.map((peer) => {
          const profile = profiles.get(profileKey(peer.userId, query.simId));
          return [peer.userId, { xp: profile?.xp ?? 0, level: profile?.level ?? 1 }];
        }),
      );
      const attemptSeeds: LeaderboardAttemptSeed[] = [...attempts.values()]
        .filter((attempt) => attempt.simId === query.simId)
        .map((attempt) => ({
          userId: attempt.userId,
          simId: attempt.simId,
          finishedAt: attempt.finishedAt,
          score: attempt.score,
        }));
      const ranked = buildLeaderboardRows({
        viewerUserId: query.userId,
        peers,
        profiles: profileMap,
        attempts: attemptSeeds,
        simId: query.simId,
        period: query.period as Period,
        cohort: query.cohort,
        at: query.at,
      });
      const page = paginateRows(ranked, query.page, query.pageSize);
      return {
        period: query.period,
        cohort: query.cohort,
        generatedAt: query.at,
        rows: toLeaderboardRowResponses(page.rows, query.userId),
        total: page.total,
      };
    },
  };

  return { repo, profiles, attempts, badges };
}

export interface MeGamificationDeps {
  readonly auth: AuthDeps;
  readonly gamification: GamificationRepo;
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

/** Özet gövdesi: sözleşmedeki dar alan kümesi; zamanlar ofsetli ISO 8601'dir. */
function summaryBody(summary: GamiSimSummaryRecord) {
  return {
    simId: summary.simId,
    xp: summary.xp,
    level: summary.level,
    streak: {
      current: summary.streak.current,
      best: summary.streak.best,
      lastDate: summary.streak.lastDate,
    },
    weeklyGoal: {
      targetXp: summary.weeklyGoal.targetXp,
      currentXp: summary.weeklyGoal.currentXp,
    },
    badges: summary.badges.map((badge) => ({
      key: badge.key,
      awardedAt: toIstanbulIso(badge.awardedAt),
    })),
    leaderboard: { rank: summary.leaderboard.rank, total: summary.leaderboard.total },
    attempts: summary.attempts.map((attempt) => ({
      attemptNo: attempt.attemptNo,
      finishedAt: toIstanbulIso(attempt.finishedAt),
      score: attempt.score,
      maxScore: attempt.maxScore,
      passed: attempt.passed,
    })),
  };
}

function attemptBody(attempt: GamiAttemptRecord) {
  return {
    id: attempt.id,
    simId: attempt.simId,
    attemptNo: attempt.attemptNo,
    startedAt: toIstanbulIso(attempt.startedAt),
    finishedAt: toIstanbulIso(attempt.finishedAt),
    score: attempt.score,
    maxScore: attempt.maxScore,
    passed: attempt.passed,
    summary: attempt.summary,
  };
}

function leaderboardBody(record: GamiLeaderboardRecord) {
  return {
    period: record.period,
    cohort: record.cohort,
    generatedAt: toIstanbulIso(record.generatedAt),
    isDemo: false,
    rows: record.rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      isMe: row.isMe,
      isPublic: row.isPublic,
      cohort: row.cohort,
      periodScore: row.periodScore,
      attemptsCount: row.attemptsCount,
      reachedAt: row.reachedAt === null ? null : toIstanbulIso(new Date(row.reachedAt).getTime()),
      totalXp: row.totalXp,
      level: row.level,
      rank: row.rank,
    })),
  };
}

function isScoreIssue(error: { readonly issues: readonly { readonly message: string }[] }): boolean {
  return error.issues.some((issue) => issue.message === "score_exceeds_max");
}

export function registerMeGamificationRoutes(
  app: Hono<AppEnv>,
  deps: MeGamificationDeps,
  now: () => number,
): void {
  const sessions = createSessionService({
    sessions: deps.auth.sessions,
    now,
    idleMs: deps.auth.sessionIdleMs,
    absoluteMs: deps.auth.sessionAbsoluteMs,
  });

  const requireSelf: MiddlewareHandler<AppEnv> = async (c, next) => {
    const outcome = await sessions.verify(getCookie(c, SESSION_COOKIE));
    if (!outcome.ok) {
      return jsonError(c, outcome.reason === "expired" ? "session_expired" : "unauthorized");
    }
    const context = await deps.auth.users.getMeContext(outcome.session.userId);
    if (context === null || context.status !== "active" || context.roles.length === 0) {
      await sessions.revoke(getCookie(c, SESSION_COOKIE));
      return jsonError(c, "unauthorized");
    }
    c.set("meActor", { userId: context.id, institutionId: context.institution.id });
    return next();
  };

  // `/me/*` çerezle korunur: mutasyonlar double-submit CSRF ister (T63 kuralı);
  // kimlik her istekte sunucuda yeniden doğrulanır.
  app.use("/me/*", csrfGuard, requireSelf);

  app.get("/me/gamification", async (c) => {
    const actor = c.get("meActor");
    const at = now();
    // Üç simin özeti AYRI tutulur; birleştirme veya toplam puan üretilmez.
    const summaries = await Promise.all(
      SIM_IDS.map((simId) =>
        deps.gamification.getSummary({
          userId: actor.userId,
          institutionId: actor.institutionId,
          simId,
          at,
        }),
      ),
    );
    return c.json({ data: { sims: summaries.map(summaryBody) } });
  });

  app.get("/me/gamification/:simId/leaderboard", async (c) => {
    const parsedSim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!parsedSim.success) return jsonError(c, "not_found");
    const parsedQuery = gamiLeaderboardQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) return jsonError(c, "invalid_request", validationDetails(parsedQuery.error));
    const actor = c.get("meActor");
    const board = await deps.gamification.getLeaderboard({
      userId: actor.userId,
      institutionId: actor.institutionId,
      simId: parsedSim.data,
      period: parsedQuery.data.period,
      cohort: parsedQuery.data.cohort,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
      at: now(),
    });
    return c.json({
      data: leaderboardBody(board),
      meta: { page: parsedQuery.data.page, pageSize: parsedQuery.data.pageSize, total: board.total },
    });
  });

  app.get("/me/gamification/:simId", async (c) => {
    const parsed = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!parsed.success) return jsonError(c, "not_found");
    const actor = c.get("meActor");
    const summary = await deps.gamification.getSummary({
      userId: actor.userId,
      institutionId: actor.institutionId,
      simId: parsed.data,
      at: now(),
    });
    return c.json({ data: summaryBody(summary) });
  });

  app.post("/me/gamification/:simId/attempts", async (c) => {
    const parsedSim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!parsedSim.success) return jsonError(c, "not_found");
    const parsed = attemptWriteRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return isScoreIssue(parsed.error)
        ? jsonError(c, "validation_failed", { issues: [{ code: "score_exceeds_max", path: ["score"] }] })
        : jsonError(c, "invalid_request", validationDetails(parsed.error));
    }
    const actor = c.get("meActor");
    const result = await deps.gamification.writeAttempt({
      id: parsed.data.id,
      // Kimlik yalnız oturumdan gelir; gövdedeki hiçbir alan kullanıcıyı seçemez.
      userId: actor.userId,
      simId: parsedSim.data,
      attemptNo: parsed.data.attemptNo,
      startedAt: new Date(parsed.data.startedAt).getTime(),
      finishedAt: new Date(parsed.data.finishedAt).getTime(),
      score: parsed.data.score ?? null,
      maxScore: parsed.data.maxScore ?? null,
      passed: parsed.data.passed ?? null,
      summary: parsed.data.summary,
      createdAt: now(),
    });
    if (result.kind === "conflict") return jsonError(c, "conflict");
    if (result.kind === "invalid") {
      return jsonError(c, "validation_failed", {
        issues: [{ code: "max_score_positive", path: ["maxScore"] }],
      });
    }
    return c.json({ data: attemptBody(result.attempt) }, result.kind === "created" ? 201 : 200);
  });
}

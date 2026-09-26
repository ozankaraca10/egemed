import type { Context, Hono, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  isGamificationEligible,
  SIM_IDS,
  attemptWriteRequestSchema,
  gamiLeaderboardQuerySchema,
  gamiSimIdParamSchema,
  mePreferencesSchema,
  type GamiCohortFilter,
  type GamiPeriod,
  type SimId,
} from "@egemed/contracts";
import { SIM_BADGE_EVALUATORS, opacaDayIndex } from "@egemed/gami-catalogs";
import { DEFAULT_RULES, assessmentXp, practiceXp, type Period } from "@egemed/gamification-core";
import {
  buildLeaderboardRows,
  paginateRows,
  toLeaderboardRowResponses,
  type LeaderboardAttemptSeed,
  type LeaderboardPeerSeed,
} from "./leaderboard";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { csrfGuard, type AuthDeps } from "../auth/routes";
import { createLoginRateLimiter } from "../auth/rate-limit";
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
/** Özet yanıtındaki rozet sayısı; katalog boyutunun üstünde tutulur (ADR-008: tam liste). */
const BADGE_LIMIT = 100;
const ATTEMPT_LIMIT = 20;

/** Türkiye sabit ofseti: 2016'dan beri UTC+3 (DST yok). */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Anın Türkiye takvim günü (`YYYY-MM-DD`); seri bu günlerle sayılır. */
export function trDate(at: number): string {
  return new Date(at + TR_OFFSET_MS).toISOString().slice(0, 10);
}

export type GamiAttemptMode = "practice" | "assessment";

/**
 * API-05: deneme XP'si sunucuda, üç simde ortak `DEFAULT_RULES.xp` ile
 * hesaplanır; istemcinin özetindeki `xp` kodu yetkili değildir.
 */
export function serverAttemptXp(input: {
  readonly mode: GamiAttemptMode;
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly passed: boolean | null;
}): number {
  const percent =
    input.score !== null && input.maxScore !== null && input.maxScore > 0
      ? Math.round((input.score * 100) / input.maxScore)
      : 0;
  return input.mode === "assessment"
    ? assessmentXp({ caseCount: input.caseCount, score: percent }, DEFAULT_RULES)
    : practiceXp({ caseCount: input.caseCount, hintsUsed: input.hintsUsed, mastery: input.passed === true }, DEFAULT_RULES);
}

/**
 * `levelForXp`in kapalı biçimi: düzey k'nin başlangıcı `unit·k(k−1)/2`.
 * SQL güncellemesi aynı formülü kullanır; test ikisinin eşitliğini doğrular.
 */
export function levelForXpClosedForm(xp: number, unitXp = DEFAULT_RULES.level.unitXp): number {
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / unitXp)) / 2));
}

/** Artımlı seri: aynı gün değişmez, ertesi gün +1, geç gelen eski gün etkisiz, boşluk 1'e döner. */
export function nextStreak(previous: GamiStreakRecord, day: string): GamiStreakRecord {
  const last = previous.lastDate;
  let current: number;
  if (last === null) current = 1;
  else if (day === last || day < last) current = previous.current;
  else current = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`) === 86_400_000 ? previous.current + 1 : 1;
  return {
    best: Math.max(previous.best, current),
    current,
    lastDate: last === null || day > last ? day : last,
  };
}

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
  readonly institutionId: string;
  readonly mode: GamiAttemptMode;
  readonly caseCount: number;
  readonly hintsUsed: number;
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

export interface GamiPreferences {
  readonly leaderboardVisible: boolean;
}

export interface GamificationRepo {
  getSummary(query: GamiSummaryQuery): Promise<GamiSimSummaryRecord>;
  getLeaderboard(query: GamiLeaderboardQuery): Promise<GamiLeaderboardRecord>;
  writeAttempt(input: GamiAttemptInput): Promise<GamiAttemptWriteResult>;
  getPreferences(userId: string): Promise<GamiPreferences>;
  setPreferences(userId: string, preferences: GamiPreferences, at: number): Promise<GamiPreferences>;
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
        // Haftalık XP: hafta içinde biten denemelerin sunucu XP'si (API-05).
        db.query(
          "select coalesce(sum(a.xp), 0)::int as current_xp from gami_attempts a where a.user_id = $1 and a.sim_id = $2 and a.finished_at >= $3",
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
        // API-05: deneme ve profil (XP, düzey, seri) tek ifadede yazılır; deneme
        // zaten varsa (idempotent tekrar) profil CTE'si satır üretmez.
        const inserted = await db.query(
          `with ins as (
             insert into gami_attempts (id, user_id, sim_id, attempt_no, started_at, finished_at, score, max_score, passed, summary, created_at, mode, case_count, hints_used, xp)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
             on conflict (id) do nothing
             returning id, sim_id, attempt_no, started_at, finished_at, score, max_score, passed, summary, xp
           ), prof as (
             insert into gami_profiles as p (user_id, sim_id, xp, level, streak_current, streak_best, streak_last_date, updated_at)
             select $2, $3, ins.xp, greatest(1, floor((1 + sqrt(1 + 8.0 * ins.xp / $17)) / 2))::int, 1, 1, $16::date, $11 from ins
             on conflict (user_id, sim_id) do update set
               xp = p.xp + excluded.xp,
               level = greatest(1, floor((1 + sqrt(1 + 8.0 * (p.xp + excluded.xp) / $17)) / 2))::int,
               streak_current = case
                 when p.streak_last_date is null then 1
                 when excluded.streak_last_date <= p.streak_last_date then p.streak_current
                 when excluded.streak_last_date = p.streak_last_date + 1 then p.streak_current + 1
                 else 1 end,
               streak_best = greatest(p.streak_best, case
                 when p.streak_last_date is null then 1
                 when excluded.streak_last_date <= p.streak_last_date then p.streak_current
                 when excluded.streak_last_date = p.streak_last_date + 1 then p.streak_current + 1
                 else 1 end),
               streak_last_date = greatest(p.streak_last_date, excluded.streak_last_date),
               updated_at = excluded.updated_at
             returning 1
           )
           select ins.* from ins`,
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
            input.mode,
            input.caseCount,
            input.hintsUsed,
            serverAttemptXp(input),
            // T149: seri günü sunucunun alım zamanından (istemci saati seri üretemez/donduramaz).
            trDate(input.createdAt),
            DEFAULT_RULES.level.unitXp,
          ],
        );
        const row = inserted.rows[0] as GamiAttemptRow | undefined;
        if (row !== undefined) {
          await awardPgBadges(db, input);
          return { kind: "created", attempt: toAttemptRecord(row) };
        }
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
        `select u.id as user_id, u.display_name, u.leaderboard_visible, unit.code as unit_code, p.xp, p.level,
                a.finished_at, a.score
         from gami_profiles p
         join users u on u.id = p.user_id
         left join units unit on unit.id = u.unit_id and unit.deleted_at is null
         left join gami_attempts a on a.user_id = p.user_id and a.sim_id = p.sim_id
         where u.institution_id = $1 and p.sim_id = $2 and u.status = 'active' and u.deleted_at is null
           and (u.leaderboard_visible or u.id = $3)
           and not exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'ogretim_uyesi')`,
        [query.institutionId, query.simId, query.userId],
      );
      return assembleLeaderboardRecord(query, rows.rows as readonly PgLeaderboardSourceRow[]);
    },

    async getPreferences(userId) {
      const result = await db.query("select leaderboard_visible from users where id = $1 and deleted_at is null", [userId]);
      const row = result.rows[0] as { readonly leaderboard_visible?: unknown } | undefined;
      return { leaderboardVisible: row?.leaderboard_visible !== false };
    },

    async setPreferences(userId, preferences, at) {
      const result = await db.query(
        "update users set leaderboard_visible = $2, updated_at = $3 where id = $1 and deleted_at is null returning leaderboard_visible",
        [userId, preferences.leaderboardVisible, new Date(at)],
      );
      const row = result.rows[0] as { readonly leaderboard_visible?: unknown } | undefined;
      return { leaderboardVisible: row?.leaderboard_visible !== false };
    },
  };
}

/**
 * ADR-008: yeni denemeden sonra kullanıcı×sim özetlerinden rozetler sunucuda
 * değerlendirilir. Yazım idempotenttir (`on conflict do nothing`); hata deneme
 * kaydını bozmaz, sonraki denemede eksik rozet tamamlanır.
 */
async function awardPgBadges(db: GamiDb, input: GamiAttemptInput): Promise<void> {
  const evaluator = SIM_BADGE_EVALUATORS[input.simId];
  if (evaluator === undefined) return;
  try {
    const [summaryRows, badgeRows] = await Promise.all([
      db.query("select summary from gami_attempts where user_id = $1 and sim_id = $2 order by finished_at asc", [input.userId, input.simId]),
      db.query("select badge_key from gami_badges where user_id = $1 and sim_id = $2", [input.userId, input.simId]),
    ]);
    const summaries = summaryRows.rows.map((row) => (row as { readonly summary: Readonly<Record<string, number>> }).summary);
    const earned = badgeRows.rows.map((row) => (row as { readonly badge_key: string }).badge_key);
    const awarded = evaluator.newlyEarned(summaries, earned, new Date(input.createdAt));
    if (awarded.length === 0) return;
    await db.query(
      "insert into gami_badges (user_id, sim_id, badge_key, awarded_at) select $1, $2, key, $4 from unnest($3::text[]) as key on conflict (user_id, sim_id, badge_key) do nothing",
      [input.userId, input.simId, awarded, new Date(input.createdAt)],
    );
  } catch {
    // Rozet yazımı deneme kaydını geri almaz; bir sonraki denemede yeniden değerlendirilir.
  }
}

interface PgLeaderboardSourceRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly leaderboard_visible?: boolean;
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

/** İdempotent tekrar yalnız aynı kullanıcı×sim×deneme için geçerlidir (API-04). */
function sameAttempt(attempt: GamiAttemptRecord, input: GamiAttemptInput): boolean {
  return (
    attempt.simId === input.simId &&
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
  readonly xp?: number;
}

export interface MemoryGamificationSeed {
  /** Liderlik tablosuna katılmayan kullanıcı kimlikleri. */
  readonly hiddenFromLeaderboard?: readonly string[];
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
  /** Sunucu XP'si (API-05); tohum denemelerinde 0. */
  readonly xp: number;
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
  /** Liderlik tablosundan çıkan kullanıcılar (varsayılan: görünür). */
  const hiddenFromLeaderboard = new Set<string>(seed.hiddenFromLeaderboard ?? []);

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
      xp: attempt.xp ?? 0,
    });
  }

  function weeklyXp(userId: string, simId: SimId, at: number): number {
    const weekStart = startOfWeekTr(at);
    let total = 0;
    for (const attempt of attempts.values()) {
      if (attempt.userId !== userId || attempt.simId !== simId) continue;
      if (attempt.finishedAt < weekStart) continue;
      total += attempt.xp;
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
        // Başka kullanıcının/simin kimliğiyle çakışma idempotent tekrar sayılmaz (API-04).
        return byId.userId === input.userId && sameAttempt(byId, input)
          ? { kind: "existing", attempt: { ...attempt, simId: byId.simId } }
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
      const xp = serverAttemptXp(input);
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
        xp,
      });
      // PG ifadesiyle aynı kural: profil XP/düzey/seri deneme ile birlikte güncellenir.
      const key = profileKey(input.userId, input.simId);
      const existing = profiles.get(key);
      const profile: MemoryGamiProfileState = existing ?? {
        userId: input.userId,
        institutionId: input.institutionId,
        simId: input.simId,
        xp: 0,
        level: 1,
        streak: { current: 0, best: 0, lastDate: null },
        updatedAt: input.createdAt,
        displayName: "Örnek Öğrenci",
        unitCode: null,
        public: true,
      };
      profile.xp += xp;
      profile.level = levelForXpClosedForm(profile.xp);
      // T149: seri günü sunucunun alım zamanından; yalnız ilk yazımda güncellenir (idempotent).
      profile.streak = nextStreak(profile.streak, trDate(input.createdAt));
      profile.updatedAt = input.createdAt;
      profiles.set(key, profile);
      // ADR-008: rozetler PG yoluyla aynı kuralla özetlerden değerlendirilir.
      const evaluator = SIM_BADGE_EVALUATORS[input.simId];
      if (evaluator !== undefined) {
        const own = [...attempts.values()]
          .filter((candidate) => candidate.userId === input.userId && candidate.simId === input.simId)
          .sort((a, b) => a.finishedAt - b.finishedAt);
        const earned = badges.filter((badge) => badge.userId === input.userId && badge.simId === input.simId).map((badge) => badge.key);
        for (const badgeKey of evaluator.newlyEarned(own.map((candidate) => candidate.summary), earned, new Date(input.createdAt))) {
          badges.push({ userId: input.userId, simId: input.simId, key: badgeKey, awardedAt: input.createdAt });
        }
      }
      return { kind: "created", attempt };
    },

    async getPreferences(userId) {
      return { leaderboardVisible: !hiddenFromLeaderboard.has(userId) };
    },

    async setPreferences(userId, preferences) {
      if (preferences.leaderboardVisible) hiddenFromLeaderboard.delete(userId);
      else hiddenFromLeaderboard.add(userId);
      return { leaderboardVisible: preferences.leaderboardVisible };
    },

    async getLeaderboard(query) {
      const peers = [...profiles.values()]
        .filter(
          (profile) =>
            profile.institutionId === query.institutionId &&
            profile.simId === query.simId &&
            (!hiddenFromLeaderboard.has(profile.userId) || profile.userId === query.userId),
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

/** T149: deneme `finishedAt` kabul penceresi (sunucu saatine göre). */
export const ATTEMPT_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const ATTEMPT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** T149: kullanıcı başına saatlik deneme yazımı üst sınırı (XP şişirmesine karşı). */
export const ATTEMPT_RATE_MAX = 60;
export const ATTEMPT_RATE_WINDOW_MS = 60 * 60 * 1000;
/** Kabuğun genel kodları (`codedAttemptSummary`); diğer kodlar yalnız `<simId>.` önekli olabilir. */
const GENERIC_SUMMARY_KEYS: ReadonlySet<string> = new Set(["score", "correct", "total"]);

/**
 * Gün kodu istemci beyanı değildir: `opaca.day` varsa deneme `finishedAt`'inden yeniden
 * hesaplanır (idempotent tekrarlarda aynı değer). Sahte gün koduyla seri rozeti üretilemez.
 */
export function anchorSummaryDay(
  simId: string,
  summary: Readonly<Record<string, number>>,
  finishedAt: number,
): Record<string, number> {
  const key = `${simId}.day`;
  if (simId !== "opaca" || !(key in summary)) return { ...summary };
  return { ...summary, [key]: opacaDayIndex(new Date(finishedAt)) };
}

export function registerMeGamificationRoutes(
  app: Hono<AppEnv>,
  deps: MeGamificationDeps,
  now: () => number,
): void {
  const attemptRate = createLoginRateLimiter(deps.auth.attemptRateMax ?? ATTEMPT_RATE_MAX, ATTEMPT_RATE_WINDOW_MS);
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
    c.set("meActor", {
      userId: context.id,
      institutionId: context.institution.id,
      simAccess: context.simAccess,
      gamified: isGamificationEligible(context.roles),
    });
    return next();
  };

  /** Sim başına yetki (API-03): erişimi olmayan sim için okuma ve yazma reddedilir. */
  const canUseSim = (c: Context<AppEnv>, simId: SimId): boolean => c.get("meActor").simAccess.includes(simId);

  // `/me/*` çerezle korunur: mutasyonlar double-submit CSRF ister (T63 kuralı);
  // kimlik her istekte sunucuda yeniden doğrulanır.
  app.use("/me/*", csrfGuard, requireSelf);

  app.get("/me/gamification", async (c) => {
    const actor = c.get("meActor");
    const at = now();
    // Üç simin özeti AYRI tutulur; birleştirme veya toplam puan üretilmez.
    // Yalnız erişim verilmiş simler döner (API-03).
    const summaries = await Promise.all(
      SIM_IDS.filter((simId) => actor.simAccess.includes(simId)).map((simId) =>
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

  // Liderlik tablosuna katılım tercihi (üç simde ortak; sim erişimi gerektirmez).
  app.get("/me/preferences", async (c) => {
    const preferences = await deps.gamification.getPreferences(c.get("meActor").userId);
    return c.json({ data: preferences });
  });

  app.patch("/me/preferences", async (c) => {
    const parsed = mePreferencesSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const preferences = await deps.gamification.setPreferences(c.get("meActor").userId, parsed.data, now());
    return c.json({ data: preferences });
  });

  app.get("/me/gamification/:simId/leaderboard", async (c) => {
    const parsedSim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!parsedSim.success) return jsonError(c, "not_found");
    const parsedQuery = gamiLeaderboardQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) return jsonError(c, "invalid_request", validationDetails(parsedQuery.error));
    if (!canUseSim(c, parsedSim.data)) return jsonError(c, "forbidden");
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
    if (!canUseSim(c, parsed.data)) return jsonError(c, "forbidden");
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
    if (!canUseSim(c, parsedSim.data)) return jsonError(c, "forbidden");
    // Öğretim üyesi deneme yazamaz: XP, rozet ve liderlik yalnız öğrencileri kapsar.
    if (!c.get("meActor").gamified) return jsonError(c, "role_not_permitted");
    const parsed = attemptWriteRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return isScoreIssue(parsed.error)
        ? jsonError(c, "validation_failed", { issues: [{ code: "score_exceeds_max", path: ["score"] }] })
        : jsonError(c, "invalid_request", validationDetails(parsed.error));
    }
    const actor = c.get("meActor");
    const at = now();
    // T149 (güvenlik denetimi): seri/gün tabanlı rozetler istemci saatine bağlanamaz.
    // Gelecek tarihli deneme seriyi yıllarca dondururdu; geçmişe yayılan denemeler 30 günlük
    // sahte seri üretiyordu. Kabul penceresi: son 48 saat, en fazla 5 dk saat kayması.
    const finishedAt = new Date(parsed.data.finishedAt).getTime();
    if (finishedAt > at + ATTEMPT_CLOCK_SKEW_MS) {
      return jsonError(c, "validation_failed", { issues: [{ code: "finished_in_future", path: ["finishedAt"] }] });
    }
    if (finishedAt < at - ATTEMPT_MAX_AGE_MS) {
      return jsonError(c, "validation_failed", { issues: [{ code: "finished_too_old", path: ["finishedAt"] }] });
    }
    const foreignKey = Object.keys(parsed.data.summary).find(
      (key) => !GENERIC_SUMMARY_KEYS.has(key) && !key.startsWith(`${parsedSim.data}.`),
    );
    if (foreignKey !== undefined) {
      return jsonError(c, "validation_failed", { issues: [{ code: "summary_key_not_allowed", path: ["summary", foreignKey] }] });
    }
    if (!attemptRate.consume(`attempt:${actor.userId}`, at)) return jsonError(c, "rate_limited");
    const summary = anchorSummaryDay(parsedSim.data, parsed.data.summary, finishedAt);
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
      summary,
      createdAt: at,
      institutionId: actor.institutionId,
      mode: parsed.data.mode ?? "assessment",
      caseCount: parsed.data.caseCount ?? 1,
      hintsUsed: parsed.data.hintsUsed ?? 0,
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

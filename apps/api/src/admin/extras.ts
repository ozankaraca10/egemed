import type { Hono } from "hono";
import { monthKeyTr } from "@egemed/gamification-core";
import {
  ROLES,
  SIM_IDS,
  USER_STATUSES,
  adminGamiSummaryResponseSchema as contractGamiSchema,
  adminHealthResponseSchema as contractHealthSchema,
  adminOverviewResponseSchema as contractOverviewSchema,
  uuidSchema,
  type Role,
  type UserStatus,
} from "@egemed/contracts";
import { jsonError, type AppEnv } from "../http";
import type { GamiSimSummaryRecord, GamificationRepo } from "../me/gamification";
import type { MemoryAdminImportStore } from "./imports";
import type { AdminDeps, MemoryAdminStore } from "./users";

/**
 * T58 — admin ek uçları (E3 §d, §e.3; E2 admin haritası "Özet"):
 * `GET /admin/users/:id/gamification` kullanıcı ayrıntısındaki sim başına
 * oyunlaştırma özetini verir (üç sim AYRI; ham deneme satırı dönmez),
 * `GET /admin/overview` yalnız sayımları verir (durum/rol bazında kullanıcı,
 * son 7 gün giriş, bekleyen içe aktarma; bireysel puan yok) ve
 * `GET /admin/health` veritabanı yoklaması ile sürümü verir (sır yok).
 *
 * Üç rota da `/admin/*` ara katmanına (csrfGuard + requireAdmin) güvenir; bu
 * yüzden `registerAdminUserRoutes` çağrısından SONRA kaydedilmelidir. Tüm
 * sorgular parametrelidir; `Date.now()` kullanılmaz, an `now` ile enjekte
 * edilir ve yanıtlar hiçbir sır, belirteç veya ham öğrenci verisi taşımaz.
 */

/** `@egemed/api` paket sürümü; sürüm artışıyla birlikte güncellenir. */
export const API_VERSION = "0.0.0";

/** "Son 7 gün" giriş penceresi (E3 §e admin Özet). */
export const LOGIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Yaşayan kullanıcı durumları; yumuşak silinen kayıtlar sayılmaz (E3 §d). */
type OverviewUserStatus = Exclude<UserStatus, "deleted">;

const OVERVIEW_USER_STATUSES = USER_STATUSES.filter(
  (status): status is OverviewUserStatus => status !== "deleted",
);

export interface AdminOverviewCounts {
  readonly users: {
    readonly total: number;
    readonly byStatus: Readonly<Record<OverviewUserStatus, number>>;
    /** Kullanıcı başına roller; iki rolü olan kullanıcı iki sayıma girer (E3 §e.6). */
    readonly byRole: Readonly<Record<Role, number>>;
  };
  /** `last_login_at` penceresi içindeki kullanıcı sayısı; an enjekte edilir. */
  readonly loginsLast7Days: number;
  /** Henüz uygulanmamış batch'ler: `uploaded` + `validated` (E3 §d). */
  readonly pendingImports: number;
  readonly sims: Readonly<Record<"pulse" | "ausculta" | "opaca", AdminOverviewSim>>;
}

interface AdminOverviewSim {
  readonly accessUsers: number;
  readonly activeUsers30d: number;
  readonly attemptsThisMonth: { readonly practice: number; readonly assessment: number };
  readonly learnCompleted: number;
  readonly openChallenges: number;
  readonly currentReward: { readonly month: string; readonly title: string } | null;
}

export interface AdminOverviewRepo {
  overview(institutionId: string, at: number): Promise<AdminOverviewCounts>;
}

/** Havuzun sağlık yoklamasına görünen dar yüzeyi; `app.ts` havuzu geçirir. */
interface AdminHealthDb {
  query(text: string, params: readonly unknown[]): Promise<unknown>;
}

/** Havuzun overview deposuna görünen dar yüzeyi. */
interface AdminOverviewDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

const EMPTY_SIM: AdminOverviewSim = {
  accessUsers: 0,
  activeUsers30d: 0,
  attemptsThisMonth: { practice: 0, assessment: 0 },
  learnCompleted: 0,
  openChallenges: 0,
  currentReward: null,
};

function trMonthStart(at: number): Date {
  const wall = new Date(at + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - 3 * 60 * 60 * 1000);
}

function emptyCounts(): {
  readonly byStatus: Record<OverviewUserStatus, number>;
  readonly byRole: Record<Role, number>;
} {
  return {
    // Tüm durumlar başlangıçta sıfırdır; yeni durum eklenirse typecheck kırılır.
    byStatus: { invited: 0, active: 0, suspended: 0 },
    byRole: { admin: 0, kullanici: 0, ogretim_uyesi: 0, uzmanlik_ogrencisi: 0 },
  };
}

function countOf(row: unknown): number {
  const value = (row as { readonly count?: unknown } | undefined)?.count;
  return typeof value === "number" ? value : 0;
}

function isOverviewStatus(value: unknown): value is OverviewUserStatus {
  return typeof value === "string" && (OVERVIEW_USER_STATUSES as readonly string[]).includes(value);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function createPgAdminOverviewRepo(db: AdminOverviewDb): AdminOverviewRepo {
  return {
    async overview(institutionId, at) {
      const [statusResult, roleResult, loginResult, importResult, simsResult] = await Promise.all([
        db.query(
          "select status, count(*)::int as count from users where institution_id = $1 and deleted_at is null group by status",
          [institutionId],
        ),
        db.query(
          "select r.role, count(*)::int as count from user_roles r join users u on u.id = r.user_id where u.institution_id = $1 and u.deleted_at is null group by r.role",
          [institutionId],
        ),
        db.query(
          "select count(*)::int as count from users where institution_id = $1 and deleted_at is null and last_login_at >= $2",
          [institutionId, new Date(at - LOGIN_WINDOW_MS)],
        ),
        db.query(
          "select count(*)::int as count from import_batches where institution_id = $1 and status in ('uploaded', 'validated')",
          [institutionId],
        ),
        db.query(
          `select s.sim_id,
            (select count(*)::int from sim_access sa join users u on u.id = sa.user_id where sa.sim_id = s.sim_id and u.institution_id = $1 and u.status = 'active' and u.deleted_at is null) as access_users,
            (select count(distinct a.user_id)::int from gami_attempts a join users u on u.id = a.user_id where a.sim_id = s.sim_id and a.finished_at >= $2 and a.finished_at <= $3 and u.institution_id = $1 and u.deleted_at is null and a.mode in ('practice', 'assessment')) as active_users_30d,
            (select count(*)::int from gami_attempts a join users u on u.id = a.user_id where a.sim_id = s.sim_id and a.finished_at >= $4 and a.finished_at <= $3 and u.institution_id = $1 and a.mode = 'practice') as practice_attempts,
            (select count(*)::int from gami_attempts a join users u on u.id = a.user_id where a.sim_id = s.sim_id and a.finished_at >= $4 and a.finished_at <= $3 and u.institution_id = $1 and a.mode = 'assessment') as assessment_attempts,
            (select count(*)::int from sim_learn_completions lc join users u on u.id = lc.user_id where lc.sim_id = s.sim_id and u.institution_id = $1 and u.deleted_at is null) as learn_completed,
            (select count(*)::int from challenges c where c.sim_id = s.sim_id and c.institution_id = $1 and c.status = 'open' and c.expires_at >= $3) as open_challenges,
            (select r.month from monthly_rewards r where r.institution_id = $1 and r.sim_id = s.sim_id and r.month <= $5 order by r.month desc limit 1) as reward_month,
            (select r.title from monthly_rewards r where r.institution_id = $1 and r.sim_id = s.sim_id and r.month <= $5 order by r.month desc limit 1) as reward_title` ,
          [institutionId, new Date(at - 30 * 24 * 60 * 60 * 1000), new Date(at), trMonthStart(at), monthKeyTr(new Date(at))],
        ),
      ]);
      const counts = emptyCounts();
      for (const row of statusResult.rows) {
        const status = (row as { readonly status?: unknown }).status;
        if (isOverviewStatus(status)) counts.byStatus[status] += countOf(row);
      }
      for (const row of roleResult.rows) {
        const role = (row as { readonly role?: unknown }).role;
        if (isRole(role)) counts.byRole[role] += countOf(row);
      }
      const sims = Object.fromEntries(SIM_IDS.map((simId) => [simId, { ...EMPTY_SIM }])) as Record<"pulse" | "ausculta" | "opaca", AdminOverviewSim>;
      for (const row of simsResult.rows) {
        const value = row as { sim_id?: unknown; access_users?: unknown; active_users_30d?: unknown; practice_attempts?: unknown; assessment_attempts?: unknown; learn_completed?: unknown; open_challenges?: unknown; reward_month?: unknown; reward_title?: unknown };
        if (typeof value.sim_id !== "string" || !(SIM_IDS as readonly string[]).includes(value.sim_id)) continue;
        sims[value.sim_id as keyof typeof sims] = {
          accessUsers: countOf({ count: value.access_users }),
          activeUsers30d: countOf({ count: value.active_users_30d }),
          attemptsThisMonth: { practice: countOf({ count: value.practice_attempts }), assessment: countOf({ count: value.assessment_attempts }) },
          learnCompleted: countOf({ count: value.learn_completed }),
          openChallenges: countOf({ count: value.open_challenges }),
          currentReward: typeof value.reward_month === "string" && typeof value.reward_title === "string" ? { month: value.reward_month, title: value.reward_title } : null,
        };
      }
      return {
        users: {
          total: Object.values(counts.byStatus).reduce((sum, value) => sum + value, 0),
          byStatus: counts.byStatus,
          byRole: counts.byRole,
        },
        loginsLast7Days: countOf(loginResult.rows[0]),
        pendingImports: countOf(importResult.rows[0]),
        sims,
      };
    },
  };
}

/** Bellek deposu: testler DB olmadan sayımları doğrular. */
export interface AdminOverviewMemoryData {
  readonly attempts?: readonly { readonly userId: string; readonly simId: (typeof SIM_IDS)[number]; readonly mode?: "practice" | "assessment" | "challenge"; readonly finishedAt: number }[];
  readonly completions?: readonly { readonly userId: string; readonly simId: (typeof SIM_IDS)[number] }[];
  readonly challenges?: readonly { readonly institutionId: string; readonly simId: (typeof SIM_IDS)[number]; readonly status: string; readonly expiresAt: number }[];
  readonly rewards?: readonly { readonly institutionId: string; readonly simId: (typeof SIM_IDS)[number]; readonly month: string; readonly title: string }[];
}

export function createMemoryAdminOverviewRepo(
  admin: Pick<MemoryAdminStore, "records">,
  imports: Pick<MemoryAdminImportStore, "batches">,
  simData: AdminOverviewMemoryData = {},
): AdminOverviewRepo {
  return {
    async overview(institutionId, at) {
      const counts = emptyCounts();
      const windowStart = at - LOGIN_WINDOW_MS;
      let loginsLast7Days = 0;
      for (const record of admin.records.values()) {
        if (record.institutionId !== institutionId || record.deletedAt !== null) continue;
        if (isOverviewStatus(record.status)) counts.byStatus[record.status] += 1;
        for (const role of record.roles) {
          if (isRole(role)) counts.byRole[role] += 1;
        }
        if (record.lastLoginAt !== null && record.lastLoginAt >= windowStart) loginsLast7Days += 1;
      }
      let pendingImports = 0;
      for (const batch of imports.batches.values()) {
        if (batch.institutionId !== institutionId) continue;
        if (batch.status === "uploaded" || batch.status === "validated") pendingImports += 1;
      }
      const month = monthKeyTr(new Date(at));
      const monthStart = trMonthStart(at).getTime();
      const activeStart = at - 30 * 24 * 60 * 60 * 1000;
      const sims = Object.fromEntries(SIM_IDS.map((simId) => {
        const accessUsers = [...admin.records.values()].filter((record) => record.institutionId === institutionId && record.deletedAt === null && record.status === "active" && record.simAccess.includes(simId)).length;
        const attempts = (simData.attempts ?? []).filter((attempt) => attempt.simId === simId && attempt.mode !== "challenge" && [...admin.records.values()].some((record) => record.id === attempt.userId && record.institutionId === institutionId));
        const activeUsers30d = new Set(attempts.filter((attempt) => attempt.finishedAt >= activeStart && attempt.finishedAt <= at && [...admin.records.values()].some((record) => record.id === attempt.userId && record.institutionId === institutionId && record.deletedAt === null)).map((attempt) => attempt.userId)).size;
        const monthAttempts = attempts.filter((attempt) => attempt.finishedAt >= monthStart && attempt.finishedAt <= at);
        const rewards = (simData.rewards ?? []).filter((reward) => reward.institutionId === institutionId && reward.simId === simId && reward.month <= month).sort((a, b) => b.month.localeCompare(a.month));
        return [simId, {
          accessUsers,
          activeUsers30d,
          attemptsThisMonth: { practice: monthAttempts.filter((attempt) => attempt.mode === "practice").length, assessment: monthAttempts.filter((attempt) => attempt.mode === "assessment" || attempt.mode === undefined).length },
          learnCompleted: (simData.completions ?? []).filter((completion) => completion.simId === simId && [...admin.records.values()].some((record) => record.id === completion.userId && record.institutionId === institutionId && record.deletedAt === null)).length,
          openChallenges: (simData.challenges ?? []).filter((challenge) => challenge.institutionId === institutionId && challenge.simId === simId && challenge.status === "open" && challenge.expiresAt >= at).length,
          currentReward: rewards[0] === undefined ? null : { month: rewards[0].month, title: rewards[0].title },
        }];
      })) as Record<"pulse" | "ausculta" | "opaca", AdminOverviewSim>;
      return {
        users: {
          total: Object.values(counts.byStatus).reduce((sum, value) => sum + value, 0),
          byStatus: counts.byStatus,
          byRole: counts.byRole,
        },
        loginsLast7Days,
        pendingImports,
        sims,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Yanıt şemaları (dar alan kümesi; sızıntı testleri bunlarla doğrular)
// ---------------------------------------------------------------------------

/** Yanıt şemaları sözleşme paketinden gelir. */
export const adminGamiSummaryResponseSchema = contractGamiSchema;
export const adminOverviewResponseSchema = contractOverviewSchema;
export const adminHealthSchema = contractHealthSchema;

// ---------------------------------------------------------------------------
// Rotalar
// ---------------------------------------------------------------------------

interface AdminExtrasDeps {
  /** Kapsam doğrulaması için `/admin/users` deposu (E3 §d). */
  readonly admin: Pick<AdminDeps, "users">;
  readonly gamification: GamificationRepo;
  readonly overview: AdminOverviewRepo;
  readonly db: AdminHealthDb;
  readonly lrsProbe?: () => Promise<boolean>;
}

/** Özet gövdesi: yalnız XP/seviye/seri; rozet, liderlik ve denemeler dışarıda. */
function adminSummaryBody(summary: GamiSimSummaryRecord) {
  return {
    simId: summary.simId,
    xp: summary.xp,
    level: summary.level,
    streak: {
      current: summary.streak.current,
      best: summary.streak.best,
      lastDate: summary.streak.lastDate,
    },
  };
}

/** Yoklama hatası yutulur: DSN ve hata metni hiçbir yanıta yazılmaz (E3 §d). */
async function dbStatus(db: AdminHealthDb): Promise<"ok" | "down"> {
  try {
    await db.query("select 1", []);
    return "ok";
  } catch {
    return "down";
  }
}

export function registerAdminExtrasRoutes(
  app: Hono<AppEnv>,
  deps: AdminExtrasDeps,
  now: () => number,
): void {
  app.get("/admin/health", async (c) => {
    const [db, lrsOk] = await Promise.all([dbStatus(deps.db), deps.lrsProbe?.().catch(() => false)]);
    const lrs = deps.lrsProbe === undefined ? "not_configured" : lrsOk ? "ok" : "down";
    const status = db === "ok" && lrs !== "down" ? 200 : 503;
    return c.json(
      { status: status === 200 ? ("ok" as const) : ("degraded" as const), db, lrs, version: API_VERSION },
      status,
    );
  });

  app.get("/admin/overview", async (c) => {
    const counts = await deps.overview.overview(c.get("adminActor").institutionId, now());
    return c.json({ data: counts });
  });

  app.get("/admin/users/:id/gamification", async (c) => {
    const parsed = uuidSchema.safeParse(c.req.param("id"));
    if (!parsed.success) return jsonError(c, "not_found");
    const actor = c.get("adminActor");
    // Kapsam: başka kurumun kaydı ve silinmiş kullanıcı 404'tür (E3 §d).
    const user = await deps.admin.users.findById(parsed.data, actor.institutionId);
    if (user === null || user.status === "deleted") return jsonError(c, "not_found");
    const at = now();
    const summaries = await Promise.all(
      SIM_IDS.map((simId) =>
        deps.gamification.getSummary({
          userId: user.id,
          institutionId: actor.institutionId,
          simId,
          at,
        }),
      ),
    );
    // Üç sim AYRI raporlanır; deneme satırları ve ham veri bilinçli olarak dışarıda.
    return c.json({ data: { sims: summaries.map(adminSummaryBody) } });
  });
}

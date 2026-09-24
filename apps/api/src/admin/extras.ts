import type { Hono } from "hono";
import { z } from "zod";
import {
  ROLES,
  SIM_IDS,
  USER_STATUSES,
  gamiStreakSchema,
  simIdSchema,
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
export type OverviewUserStatus = Exclude<UserStatus, "deleted">;

export const OVERVIEW_USER_STATUSES = USER_STATUSES.filter(
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
}

export interface AdminOverviewRepo {
  overview(institutionId: string, at: number): Promise<AdminOverviewCounts>;
}

/** Havuzun sağlık yoklamasına görünen dar yüzeyi; `app.ts` havuzu geçirir. */
export interface AdminHealthDb {
  query(text: string, params: readonly unknown[]): Promise<unknown>;
}

/** Havuzun overview deposuna görünen dar yüzeyi. */
export interface AdminOverviewDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

function emptyCounts(): {
  readonly byStatus: Record<OverviewUserStatus, number>;
  readonly byRole: Record<Role, number>;
} {
  return {
    // Tüm durumlar başlangıçta sıfırdır; yeni durum eklenirse typecheck kırılır.
    byStatus: { invited: 0, active: 0, suspended: 0 },
    byRole: { admin: 0, kullanici: 0 },
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
      const [statusResult, roleResult, loginResult, importResult] = await Promise.all([
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
      return {
        users: {
          total: Object.values(counts.byStatus).reduce((sum, value) => sum + value, 0),
          byStatus: counts.byStatus,
          byRole: counts.byRole,
        },
        loginsLast7Days: countOf(loginResult.rows[0]),
        pendingImports: countOf(importResult.rows[0]),
      };
    },
  };
}

/** Bellek deposu: testler DB olmadan sayımları doğrular. */
export function createMemoryAdminOverviewRepo(
  admin: Pick<MemoryAdminStore, "records">,
  imports: Pick<MemoryAdminImportStore, "batches">,
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
      return {
        users: {
          total: Object.values(counts.byStatus).reduce((sum, value) => sum + value, 0),
          byStatus: counts.byStatus,
          byRole: counts.byRole,
        },
        loginsLast7Days,
        pendingImports,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Yanıt şemaları (dar alan kümesi; sızıntı testleri bunlarla doğrular)
// ---------------------------------------------------------------------------

const countSchema = z.number().int().min(0);

/** Kullanıcı ayrıntısındaki sim özeti: XP, seviye, seri; deneme satırı yoktur. */
export const adminGamiSimSummarySchema = z.strictObject({
  simId: simIdSchema,
  xp: countSchema,
  level: z.number().int().min(1),
  streak: gamiStreakSchema,
});

/** Üç simin ayrı özeti; birleşik/türetilmiş tek puan yok (ADR-006/007). */
export const adminGamiSummaryResponseSchema = z.strictObject({
  data: z.strictObject({
    sims: z
      .array(adminGamiSimSummarySchema)
      .max(SIM_IDS.length)
      .refine((sims) => new Set(sims.map((sim) => sim.simId)).size === sims.length, {
        message: "duplicate_sim_id",
      }),
  }),
});

export const adminOverviewResponseSchema = z.strictObject({
  data: z.strictObject({
    users: z.strictObject({
      total: countSchema,
      byStatus: z.strictObject({
        invited: countSchema,
        active: countSchema,
        suspended: countSchema,
      }),
      byRole: z.strictObject({ admin: countSchema, kullanici: countSchema }),
    }),
    loginsLast7Days: countSchema,
    pendingImports: countSchema,
  }),
});

/** Sağlık yanıtı: durum kodları ve sürüm; hata ayrıntısı ve sır yoktur. */
export const adminHealthSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "down"]),
  version: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Rotalar
// ---------------------------------------------------------------------------

export interface AdminExtrasDeps {
  /** Kapsam doğrulaması için `/admin/users` deposu (E3 §d). */
  readonly admin: Pick<AdminDeps, "users">;
  readonly gamification: GamificationRepo;
  readonly overview: AdminOverviewRepo;
  readonly db: AdminHealthDb;
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
    const db = await dbStatus(deps.db);
    const status = db === "ok" ? 200 : 503;
    return c.json(
      { status: db === "ok" ? ("ok" as const) : ("degraded" as const), db, version: API_VERSION },
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

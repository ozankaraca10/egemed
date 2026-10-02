import type { Context, Hono } from "hono";
import { z } from "zod";
import { ROLES, roleSchema, uuidSchema, type Role } from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { insertAdminAudit, type AdminDb, type AdminDeps, type MemoryAdminStore } from "./users";

/**
 * T66 (ek) — `PUT /admin/users/:id/roles` (E3 §b): `admin` rolünün elle
 * atanması/geri alınması. E3'te yalnız toplu CSV yasağı tanımlıydı; bu uç
 * tek kullanıcı için admin atamasını mümkün kılar. Kurallar: yalnız admin
 * erişir (`/admin/*` ara katmanı), rol kümesi en az bir rol taşır, kendi
 * `admin` rolünü kaldıramaz (kilitlenme koruması) ve rol değişikliği hedefin
 * oturumlarını iptal eder (E3 §a). Değişiklik audit'lenir. Tüm sorgular
 * parametrelidir; `Date.now()` kullanılmaz.
 *
 * Bu dosyanın rotaları `/admin/*` ara katmanına güvenen
 * `registerAdminUserRoutes` çağrısından SONRA kaydedilmelidir.
 */

/** Boş rol kümesi reddedilir: rolsüz kullanıcı hiçbir yetkiye sahip olamaz. */
const rolesUpdateSchema = z
  .strictObject({
    roles: z
      .array(roleSchema)
      .max(ROLES.length)
      .refine((value) => value.length > 0, { message: "role_required" }),
  })
  .refine((value) => new Set(value.roles).size === value.roles.length, {
    message: "duplicate_role",
  });

export interface SetRolesInput {
  readonly userId: string;
  readonly institutionId: string;
  readonly roles: readonly Role[];
  readonly actorUserId: string;
  readonly at: number;
}

/** Rol kümesini tamamen değiştirir (ekle/çıkar farkından bağımsız). */
export interface AdminRoleRepo {
  setRoles(input: SetRolesInput): Promise<void>;
}

/**
 * Tek ifade: istenen küme dışındaki roller silinir, eksikler eklenir. Hedefin
 * kurumda ve yaşayan olduğu SQL'de yeniden doğrulanır; işlem atomiktir.
 */
export function createPgAdminRoleRepo(db: AdminDb): AdminRoleRepo {
  return {
    async setRoles(input) {
      await db.query(
        `with target as (select u.id from users u where u.id = $1 and u.institution_id = $2 and u.deleted_at is null),
         desired(role) as (select unnest($3::text[])),
         removed as (delete from user_roles r where r.user_id in (select id from target) and r.role <> all($3::text[]))
         insert into user_roles (user_id, role, granted_by, granted_at)
         select target.id, d.role, $4, $5 from target cross join desired d
         where not exists (select 1 from user_roles r where r.user_id = target.id and r.role = d.role)
         on conflict (user_id, role) do nothing`,
        [input.userId, input.institutionId, [...input.roles], input.actorUserId, new Date(input.at)],
      );
    },
  };
}

/** Bellek rol deposu; testler `records` üzerinden durum okur. */
export function createMemoryAdminRoleRepo(store: MemoryAdminStore): AdminRoleRepo {
  return {
    async setRoles(input) {
      const record = store.records.get(input.userId);
      if (
        record === undefined ||
        record.institutionId !== input.institutionId ||
        record.deletedAt !== null
      ) {
        return;
      }
      store.records.set(input.userId, {
        ...record,
        roles: ROLES.filter((role) => input.roles.includes(role)),
        updatedAt: input.at,
      });
    },
  };
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

function isRoleRequiredIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.message === "role_required");
}

function roleBody(id: string, displayName: string, roles: readonly Role[], status: string) {
  return { id, displayName, roles: ROLES.filter((role) => roles.includes(role)), status };
}

export function registerAdminRoleRoutes(app: Hono<AppEnv>, deps: AdminDeps, now: () => number): void {
  app.put("/admin/users/:id/roles", async (c) => {
    const parsed = rolesUpdateSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return isRoleRequiredIssue(parsed.error)
        ? jsonError(c, "validation_failed", { issues: [{ code: "role_required", path: ["roles"] }] })
        : jsonError(c, "invalid_request", validationDetails(parsed.error));
    }
    const id = uuidSchema.safeParse(c.req.param("id"));
    if (!id.success) return jsonError(c, "not_found");

    const actor = c.get("adminActor");
    const target = await deps.users.findById(id.data, actor.institutionId);
    if (target === null || target.status === "deleted") return jsonError(c, "not_found");

    const desired = ROLES.filter((role) => parsed.data.roles.includes(role));
    // Kilitlenme koruması: admin kendi `admin` rolünü kaldıramaz (E3 §b).
    if (target.id === actor.userId && !desired.includes("admin")) {
      return jsonError(c, "role_not_permitted");
    }
    const current = ROLES.filter((role) => target.roles.includes(role));
    if (current.join(",") === desired.join(",")) {
      return c.json({ data: roleBody(target.id, target.displayName, current, target.status) });
    }

    const at = now();
    await deps.roles.setRoles({
      userId: target.id,
      institutionId: actor.institutionId,
      roles: desired,
      actorUserId: actor.userId,
      at,
    });
    // Rol değişikliği hedefin açık oturumlarını iptal eder (E3 §a).
    await deps.auth.sessions.revokeForUser(target.id, at);
    await insertAdminAudit(deps, c, at, {
      action: "user.roles_set",
      targetType: "user",
      targetId: target.id,
      summaryBefore: { roles: current.join(",") },
      summaryAfter: { roles: desired.join(",") },
    });
    return c.json({ data: roleBody(target.id, target.displayName, desired, target.status) });
  });
}

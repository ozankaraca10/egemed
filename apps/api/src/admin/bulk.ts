import type { Context, Hono } from "hono";
import {
  ROLES,
  SIM_IDS,
  bulkQuerySchema,
  bulkRequestSchema,
  type BulkOperation,
  type Role,
  type SimId,
} from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import {
  insertAdminAudit,
  type AdminDb,
  type AdminDeps,
  type AdminUserRecord,
  type MemoryAdminStore,
} from "./users";

/**
 * T66a — `/admin/users/bulk` (E3 §d): seçim + işlem önizlemesi (`dryRun`) ve
 * atomik uygulama. Kurallar: `assign_role`/`revoke_role` yalnız `kullanici`
 * değerini kabul eder (`admin` 403); `set_unit` yalnız sınıflandırmayı
 * değiştirir; herhangi bir satır geçersizse işlem uygulanmaz ve 422 ile satır
 * bazlı hatalar döner. Rol ve askıya alma değişikliklerinde ilgili oturumlar
 * iptal edilir (E3 §a); her değişen kullanıcı audit'lenir. Tüm sorgular
 * parametrelidir ve uygulama tek ifadedir; `Date.now()` kullanılmaz.
 *
 * Bu dosyanın rotaları `/admin/*` ara katmanına (csrfGuard + requireAdmin)
 * güvenen `registerAdminUserRoutes` çağrısından SONRA kaydedilmelidir.
 */

/** Normalize edilmiş işlem değeri: rol, sim, durum veya birim kimliği. */
type BulkValue = string | null;

export interface BulkApplyInput {
  readonly institutionId: string;
  readonly actorUserId: string;
  readonly operation: BulkOperation;
  readonly value: BulkValue;
  readonly userIds: readonly string[];
  readonly at: number;
}

/** Toplu işlem deposu; değişen kullanıcı kimliklerini döner. */
export interface AdminBulkRepo {
  apply(input: BulkApplyInput): Promise<readonly string[]>;
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

function issueDetails(code: string, path: readonly string[]): unknown {
  return { issues: [{ code, path: [...path] }] };
}

/** Kurum ve yaşam koşulunu SQL'de yeniden doğrulayan ortak kapsam. */
const USER_SCOPE = "u.id = any($1::uuid[]) and u.institution_id = $2 and u.deleted_at is null";

/** `returning user_id` ve `returning id` satırlarının ikisinden de kimliği okur. */
function changedUserId(row: unknown): string | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const record = row as { readonly user_id?: unknown; readonly id?: unknown };
  if (typeof record.user_id === "string") return record.user_id;
  if (typeof record.id === "string") return record.id;
  return undefined;
}

export function createPgAdminBulkRepo(db: AdminDb): AdminBulkRepo {
  return {
    async apply(input) {
      const ids = [...input.userIds];
      let rows: readonly unknown[];
      switch (input.operation) {
        case "assign_role":
          ({ rows } = await db.query(
            `insert into user_roles (user_id, role, granted_by, granted_at) select u.id, $3, $4, $5 from users u where ${USER_SCOPE} on conflict (user_id, role) do nothing returning user_id`,
            [ids, input.institutionId, input.value, input.actorUserId, new Date(input.at)],
          ));
          break;
        case "revoke_role":
          ({ rows } = await db.query(
            `delete from user_roles r using users u where r.user_id = u.id and ${USER_SCOPE} and r.role = $3 returning r.user_id`,
            [ids, input.institutionId, input.value],
          ));
          break;
        case "set_unit":
          ({ rows } = await db.query(
            `update users set unit_id = $3::uuid, updated_at = $4 where id = any($1::uuid[]) and institution_id = $2 and deleted_at is null and unit_id is distinct from $3::uuid returning id as user_id`,
            [ids, input.institutionId, input.value, new Date(input.at)],
          ));
          break;
        case "set_status":
          ({ rows } = await db.query(
            `update users set status = $3, updated_at = $4 where id = any($1::uuid[]) and institution_id = $2 and deleted_at is null and status <> $3 returning id as user_id`,
            [ids, input.institutionId, input.value, new Date(input.at)],
          ));
          break;
        case "grant_sim":
          ({ rows } = await db.query(
            `insert into sim_access (user_id, sim_id, granted_by, granted_at) select u.id, $3, $4, $5 from users u where ${USER_SCOPE} on conflict (user_id, sim_id) do nothing returning user_id`,
            [ids, input.institutionId, input.value, input.actorUserId, new Date(input.at)],
          ));
          break;
        case "revoke_sim":
          ({ rows } = await db.query(
            `delete from sim_access s using users u where s.user_id = u.id and ${USER_SCOPE} and s.sim_id = $3 returning s.user_id`,
            [ids, input.institutionId, input.value],
          ));
          break;
      }
      return rows.flatMap((row) => {
        const id = changedUserId(row);
        return id === undefined ? [] : [id];
      });
    },
  };
}

function addRole(roles: readonly Role[], role: Role): Role[] {
  return ROLES.filter((candidate) => candidate === role || roles.includes(candidate));
}

function removeRole(roles: readonly Role[], role: Role): Role[] {
  return ROLES.filter((candidate) => candidate !== role && roles.includes(candidate));
}

function addSim(simAccess: readonly SimId[], simId: SimId): SimId[] {
  return SIM_IDS.filter((candidate) => candidate === simId || simAccess.includes(candidate));
}

function removeSim(simAccess: readonly SimId[], simId: SimId): SimId[] {
  return SIM_IDS.filter((candidate) => candidate !== simId && simAccess.includes(candidate));
}

/** Bellek toplu işlem deposu; testler `records` üzerinden durum okur. */
export function createMemoryAdminBulkRepo(store: MemoryAdminStore): AdminBulkRepo {
  return {
    async apply(input) {
      const changed: string[] = [];
      for (const id of input.userIds) {
        const record = store.records.get(id);
        if (
          record === undefined ||
          record.institutionId !== input.institutionId ||
          record.deletedAt !== null
        ) {
          continue;
        }
        const value = input.value;
        switch (input.operation) {
          case "assign_role":
            if (value === null || record.roles.includes(value as Role)) continue;
            store.records.set(id, {
              ...record,
              roles: addRole(record.roles, value as Role),
              updatedAt: input.at,
            });
            break;
          case "revoke_role":
            if (value === null || !record.roles.includes(value as Role)) continue;
            store.records.set(id, {
              ...record,
              roles: removeRole(record.roles, value as Role),
              updatedAt: input.at,
            });
            break;
          // `set_unit` null taşıyabilir: birim temizleme geçerli bir değişikliktir.
          case "set_unit":
            if (record.unitId === value) continue;
            store.records.set(id, { ...record, unitId: value, updatedAt: input.at });
            break;
          case "set_status":
            if (value === null || record.status === value) continue;
            store.records.set(id, {
              ...record,
              status: value as AdminUserRecord["status"],
              updatedAt: input.at,
            });
            break;
          case "grant_sim":
            if (value === null || record.simAccess.includes(value as SimId)) continue;
            store.records.set(id, {
              ...record,
              simAccess: addSim(record.simAccess, value as SimId),
              updatedAt: input.at,
            });
            break;
          case "revoke_sim":
            if (value === null || !record.simAccess.includes(value as SimId)) continue;
            store.records.set(id, {
              ...record,
              simAccess: removeSim(record.simAccess, value as SimId),
              updatedAt: input.at,
            });
            break;
        }
        changed.push(id);
      }
      return changed;
    },
  };
}

/** Kullanıcının bu işlemle gerçekten değişip değişmeyeceği (dryRun ile ortak). */
function wouldChange(record: AdminUserRecord, operation: BulkOperation, value: BulkValue): boolean {
  switch (operation) {
    case "assign_role":
      return value !== null && !record.roles.includes(value as Role);
    case "revoke_role":
      return value !== null && record.roles.includes(value as Role);
    case "set_unit":
      return record.unitId !== value;
    case "set_status":
      return record.status !== value;
    case "grant_sim":
      return value !== null && !record.simAccess.includes(value as SimId);
    case "revoke_sim":
      return value !== null && record.simAccess.includes(value as SimId);
  }
}

/** Rol ve askıya alma değişiklikleri oturumları iptal eder (E3 §a). */
function revokesSessions(operation: BulkOperation, value: BulkValue): boolean {
  if (operation === "assign_role" || operation === "revoke_role") return true;
  return operation === "set_status" && value === "suspended";
}

function skippedList(userIds: readonly string[], changed: ReadonlySet<string>) {
  return userIds
    .filter((id) => !changed.has(id))
    .map((id) => ({ userId: id, code: "no_change" }));
}

export function registerAdminBulkRoutes(app: Hono<AppEnv>, deps: AdminDeps, now: () => number): void {
  app.post("/admin/users/bulk", async (c) => {
    const query = bulkQuerySchema.safeParse(c.req.query());
    if (!query.success) return jsonError(c, "invalid_request", validationDetails(query.error));
    const parsed = bulkRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));

    const { userIds: rawIds, operation, value } = parsed.data;
    // `admin` rolü toplu yolla atanamaz/geri alınamaz (E3 §b, §d): 403.
    if ((operation === "assign_role" || operation === "revoke_role") && value === "admin") {
      return jsonError(c, "role_not_permitted");
    }
    const actor = c.get("adminActor");
    const userIds = [...new Set(rawIds)];
    // T149 kilitlenme koruması: toplu askıya almada eylemi yapan admin hedef olamaz.
    if (operation === "set_status" && value === "suspended" && userIds.includes(actor.userId)) {
      return jsonError(c, "role_not_permitted");
    }

    if (operation === "set_unit" && value !== null) {
      const unit = await deps.users.findUnit(actor.institutionId, value);
      if (unit === null) return jsonError(c, "validation_failed", issueDetails("unknown_unit", ["value"]));
    }

    const found = await deps.users.findByIds(userIds, actor.institutionId);
    const byId = new Map(found.map((record) => [record.id, record]));
    const rows: { readonly userId: string; readonly code: string }[] = [];
    for (const id of userIds) {
      const record = byId.get(id);
      if (record === undefined || record.status === "deleted") {
        rows.push({ userId: id, code: "not_found" });
      }
    }
    // Herhangi bir satır geçersizse işlem uygulanmaz (atomik).
    if (rows.length > 0) return jsonError(c, "validation_failed", { rows });

    const planned = new Set(
      userIds.filter((id) => {
        const record = byId.get(id);
        return record !== undefined && wouldChange(record, operation, value);
      }),
    );
    if (query.data.dryRun === true) {
      return c.json({
        data: { dryRun: true, updated: planned.size, skipped: skippedList(userIds, planned) },
      });
    }

    const at = now();
    const applied = await deps.bulk.apply({
      institutionId: actor.institutionId,
      actorUserId: actor.userId,
      operation,
      value,
      userIds,
      at,
    });
    const changed = new Set(applied);
    if (revokesSessions(operation, value)) {
      for (const id of applied) {
        await deps.auth.sessions.revokeForUser(id, at);
      }
    }
    for (const id of applied) {
      await insertAdminAudit(deps, c, at, {
        action: "user.bulk",
        targetType: "user",
        targetId: id,
        summaryAfter: { operation, value: value ?? "" },
      });
    }
    return c.json({
      data: { dryRun: false, updated: changed.size, skipped: skippedList(userIds, changed) },
    });
  });
}

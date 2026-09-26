/**
 * T89 — API oturumu veri kaynakları. Yalnız `import.meta.env.DEV` dalından
 * dinamik yüklenir. Mock birim kimlikleri (`unit-3`) UUID değildir; create
 * isteğinden düşülür ki kullanıcı gerçekten kaydolabilsin.
 */

import {
  ApiError,
  createApiClient,
  type ApiAuditEntry,
  type ApiClient,
  type ApiImportRow,
} from "@egemed/api-client";
import type { BulkRequest } from "@egemed/contracts";
import { browserApiWindow, csrfTokenFromCookie } from "./apiAuth";
import {
  AUDIT_ACTIONS,
  matchesAuditQuery,
  type AuditAction,
  type AuditDataSource,
  type AuditEntry,
  type AuditListQuery,
  type AuditTargetType,
} from "./admin/auditDataSource";
import {
  parseCsv,
  rowsFromMapping,
  TEMPLATE_COLUMNS,
  type ColumnMapping,
  type ImportBatch,
  type ImportMode,
  type ImportRow,
  type ImportRowStatus,
  type ImportsDataSource,
  type TemplateColumn,
} from "./admin/importsDataSource";
import {
  primaryRoleFor,
  type AdminUserDetail,
  type AdminUserHistoryEntry,
  type BulkEditInput,
  type BulkEditResult,
  type BulkSkipReason,
  type CreateUserInput,
  type SimId,
  type UpdateUserInput,
  type UserHistoryAction,
  type UserRole,
  type UsersDataSource,
  type UsersListQuery,
  type UsersSummary,
} from "./admin/usersDataSource";
import { createApiGamificationSource, createSyntheticGamificationSource } from "./home/gamificationSource";
import type { ShellDataSources } from "./dataSources";
import type { ShellSession } from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_ACTIONS = new Set<UserHistoryAction>([
  "user.create",
  "user.suspend",
  "user.activate",
  "user.delete",
  "role.grant",
  "role.revoke",
]);
const AUDIT_ACTION_SET = new Set<string>(AUDIT_ACTIONS);
const SIM_SET = new Set<SimId>(["pulse", "ausculta", "opaca"]);
const EMPTY_RAW: Record<TemplateColumn, string> = {
  ad_soyad: "",
  birim_kodu: "",
  eposta: "",
  giris_tipi: "",
  kullanici_adi: "",
  rol: "",
  sim_erisimi: "",
};

function uuidOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

/** T184: `UserRole` üçüncü değeri (`ogretim_uyesi`) aldı; API'den gelen roller
 *  bu kümeye göre süzülür/öncelenir (`primaryRoleFor` ile aynı sıra: admin >
 *  ogretim_uyesi > kullanici) — aksi hâlde gerçek API'den dönen öğretim üyesi
 *  rolü sessizce düşerdi. */
function asRoles(roles: readonly string[]): UserRole[] {
  return roles.filter((role): role is UserRole => role === "admin" || role === "kullanici" || role === "ogretim_uyesi");
}

function asRole(roles: readonly string[]): UserRole {
  return primaryRoleFor(asRoles(roles));
}

function asSims(ids: readonly string[]): SimId[] {
  return ids.filter((id): id is SimId => SIM_SET.has(id as SimId));
}

function rejectKnown(error: unknown): never {
  if (error instanceof ApiError && error.code === "duplicate_mapping_key") {
    throw new Error("duplicate_mapping_key");
  }
  if (error instanceof ApiError && error.code === "not_found") throw new Error("not_found");
  if (error instanceof ApiError && error.code === "role_not_permitted") throw new Error("self_admin_removal");
  throw error instanceof Error ? error : new Error("internal_error");
}

function toListUser(item: {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly roles: readonly string[];
  readonly unitId: string | null;
  readonly status: AdminUserDetail["status"];
  readonly authMethod: AdminUserDetail["authMethod"];
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}): AdminUserDetail {
  return {
    authMethod: item.authMethod,
    createdAt: item.createdAt,
    displayName: item.displayName,
    email: item.email,
    gamification: [],
    history: [],
    id: item.id,
    lastLoginAt: item.lastLoginAt,
    role: asRole(item.roles),
    roles: asRoles(item.roles),
    simAccess: [],
    status: item.status,
    unitId: item.unitId ?? "",
    username: item.username ?? item.email ?? item.id,
  };
}

function toDetail(
  item: Parameters<typeof toListUser>[0] & { readonly simAccess: readonly string[] },
  history: readonly AdminUserHistoryEntry[],
): AdminUserDetail {
  return { ...toListUser(item), history, simAccess: asSims(item.simAccess) };
}

function historyFromAudit(rows: readonly ApiAuditEntry[]): AdminUserHistoryEntry[] {
  const entries: AdminUserHistoryEntry[] = [];
  for (const row of rows) {
    const action = row["action"];
    const id = row["id"];
    const occurredAt = row["occurredAt"];
    if (typeof action !== "string" || !HISTORY_ACTIONS.has(action as UserHistoryAction)) continue;
    if (typeof id !== "string" || typeof occurredAt !== "string") continue;
    entries.push({ action: action as UserHistoryAction, id, occurredAt });
  }
  return entries;
}

function uploadFailure(error: unknown): Error {
  if (error instanceof ApiError) {
    const details = error.details as { readonly issues?: readonly { readonly code?: string }[] } | undefined;
    const code = details?.issues?.[0]?.code;
    if (code === "invalid_header") return new Error("header_mismatch");
    if (typeof code === "string" && code.length > 0) return new Error(code);
    return new Error(error.code);
  }
  return error instanceof Error ? error : new Error("internal_error");
}

function isTemplateColumn(value: string): value is TemplateColumn {
  return (TEMPLATE_COLUMNS as readonly string[]).includes(value);
}

function toImportRow(row: ApiImportRow, raw: Record<TemplateColumn, string> | undefined): ImportRow {
  const status: ImportRowStatus = row.status === "valid" || row.status === "error" ? row.status : "error";
  return {
    errors: row.errors.map((error) => ({
      code: error.code,
      column: isTemplateColumn(error.column) ? error.column : "ad_soyad",
      message: error.message,
    })),
    raw: raw ?? EMPTY_RAW,
    rowNo: row.rowNo,
    status,
  };
}

function batchFrom(data: {
  readonly id: string;
  readonly fileName: string;
  readonly mode: ImportMode;
  readonly status: ImportBatch["status"];
  readonly templateVersion: string;
  readonly rowCount: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly appliedCount: number;
}): ImportBatch {
  return {
    appliedCount: data.appliedCount,
    errorCount: data.errorCount,
    fileName: data.fileName,
    id: data.id,
    mode: data.mode,
    rowCount: data.rowCount,
    status: data.status,
    templateVersion: data.templateVersion,
    validCount: data.validCount,
  };
}

function auditSummary(row: ApiAuditEntry): string {
  const after = row["summaryAfter"];
  if (typeof after === "object" && after !== null) {
    return Object.entries(after as Record<string, unknown>)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
  }
  return typeof row["action"] === "string" ? row["action"] : "";
}

function toAuditEntry(row: ApiAuditEntry): AuditEntry | null {
  const action = row["action"];
  const id = row["id"];
  const occurredAt = row["occurredAt"];
  if (typeof action !== "string" || !AUDIT_ACTION_SET.has(action)) return null;
  if (typeof id !== "string" || typeof occurredAt !== "string") return null;
  const actorUserId = row["actorUserId"];
  const targetType = row["targetType"];
  const targetId = row["targetId"];
  const actorRole = row["actorRole"];
  const typedTarget: AuditTargetType | null =
    targetType === "user" || targetType === "import_batch" ? targetType : null;
  return {
    action: action as AuditAction,
    actorId: typeof actorUserId === "string" ? actorUserId : null,
    actorName: typeof actorUserId === "string" ? (typeof actorRole === "string" ? actorRole : "Yönetici") : "Sistem",
    id,
    occurredAt,
    summary: auditSummary(row),
    targetId: typeof targetId === "string" ? targetId : null,
    targetName: typeof targetId === "string" ? targetId : null,
    targetType: typedTarget,
  };
}

function istanbulBound(day: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return end ? `${day}T23:59:59.999+03:00` : `${day}T00:00:00.000+03:00`;
}

export function createApiShellDataSources(client: ApiClient): ShellDataSources {
  const emptyProgress = createSyntheticGamificationSource(false);
  const apiProgress = createApiGamificationSource(client);
  const uploaded = new Map<string, { readonly headers: readonly string[]; readonly dataRows: readonly (readonly string[])[] }>();

  const users: UsersDataSource = {
    async bulkApply(input: BulkEditInput): Promise<BulkEditResult> {
      return runBulk(client, input, false);
    },
    async bulkPreview(input: BulkEditInput): Promise<BulkEditResult> {
      return runBulk(client, input, true);
    },
    async create(input: CreateUserInput): Promise<AdminUserDetail> {
      const value = input.mappingKeyValue.trim();
      const unitId = uuidOrUndefined(input.unitId);
      try {
        const created = await client.admin.createUser({
          authMethod: input.authMethod,
          displayName: input.displayName,
          // T184: `CreateUserInput.role` artık `kullanici` HARİCİNDE `ogretim_uyesi`yi de taşıyabilir (§b).
          role: input.role,
          simAccess: [...input.simAccess],
          ...(input.mappingKeyType === "email" ? { email: value } : { username: value }),
          ...(unitId === undefined ? {} : { unitId }),
        });
        return toDetail(created, [{ action: "user.create", id: `${created.id}-create`, occurredAt: created.createdAt }]);
      } catch (error) {
        rejectKnown(error);
      }
    },
    async get(id: string): Promise<AdminUserDetail | null> {
      try {
        const detail = await client.admin.getUser(id);
        const audit = UUID_RE.test(id)
          ? await client.admin.listAudit({ page: 1, pageSize: 20, targetId: id, targetType: "user" })
          : { data: [] };
        return toDetail(detail, historyFromAudit(audit.data));
      } catch (error) {
        if (error instanceof ApiError && error.code === "not_found") return null;
        throw error;
      }
    },
    async list(query: UsersListQuery) {
      const unitId = uuidOrUndefined(query.unitId);
      const response = await client.admin.listUsers({
        authMethod: query.authMethod,
        order: query.order,
        page: query.page,
        pageSize: query.pageSize,
        q: query.q,
        role: query.role,
        sort: query.sort,
        status: query.status,
        ...(unitId === undefined ? {} : { unitId }),
      });
      return {
        data: response.data.map((item) => toListUser(item)),
        meta: response.meta,
      };
    },
    async setRoles(id, roles, actingUserId = null): Promise<AdminUserDetail> {
      try {
        if (actingUserId !== null && actingUserId === id && !roles.includes("admin")) {
          const current = await client.admin.getUser(id);
          if (current.roles.includes("admin")) throw new Error("self_admin_removal");
        }
        await client.admin.setUserRoles(id, { roles });
        const detail = await client.admin.getUser(id);
        return toDetail(detail, historyFromAudit([]));
      } catch (error) {
        if (error instanceof Error && error.message === "self_admin_removal") throw error;
        rejectKnown(error);
      }
    },
    async summary(): Promise<UsersSummary> {
      const roleCounts: Record<UserRole, number> = { admin: 0, kullanici: 0, ogretim_uyesi: 0 };
      const simCounts: Record<SimId, number> = { ausculta: 0, opaca: 0, pulse: 0 };
      let page = 1;
      let total = 0;
      do {
        const response = await client.admin.listUsers({ page, pageSize: 100 });
        total = response.meta.total;
        const details = await Promise.all(response.data.map((item) => client.admin.getUser(item.id)));
        for (const user of details) {
          roleCounts[asRole(user.roles)] += 1;
          for (const simId of asSims(user.simAccess)) simCounts[simId] += 1;
        }
        page += 1;
      } while ((page - 1) * 100 < total && page <= 10);
      return { roleCounts, simCounts };
    },
    async update(id, patch: UpdateUserInput): Promise<AdminUserDetail> {
      try {
        let latest = null as Awaited<ReturnType<ApiClient["admin"]["getUser"]>> | null;
        const unitId = patch.unitId === undefined ? undefined : uuidOrUndefined(patch.unitId);
        if (patch.displayName !== undefined || unitId !== undefined) {
          latest = await client.admin.updateUser(id, {
            ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
            ...(unitId === undefined ? {} : { unitId }),
          });
        }
        if (patch.status === "suspended") latest = await client.admin.suspendUser(id);
        if (patch.status === "active") latest = await client.admin.activateUser(id);
        if (patch.status === "deleted") latest = await client.admin.deleteUser(id);
        if (patch.status === "invited") throw new Error("invited");
        if (latest === null) latest = await client.admin.getUser(id);
        return toDetail(latest, []);
      } catch (error) {
        if (error instanceof Error && error.message === "invited") throw error;
        rejectKnown(error);
      }
    },
  };

  const imports: ImportsDataSource = {
    async apply(batchId: string) {
      const result = await client.admin.imports.apply(batchId);
      return {
        alreadyApplied: result.data.alreadyApplied,
        appliedCount: result.data.applied,
        batchId,
        errorCount: result.data.errorCount,
      };
    },
    async template() {
      const csv = await client.admin.imports.getTemplate();
      return { csv, fileName: "egemed-kullanicilar-sablon.csv" };
    },
    async upload(input) {
      try {
        const response = await client.admin.imports.upload(input.csvText, {
          fileName: input.fileName,
          mode: input.mode,
        });
        const parsed = parseCsv(input.csvText.replace(/^\uFEFF/, ""));
        const [headerRow, ...dataRows] = parsed;
        const headers = headerRow ?? [];
        uploaded.set(response.data.id, { dataRows, headers });
        return { batch: batchFrom(response.data), headers };
      } catch (error) {
        throw uploadFailure(error);
      }
    },
    async validate(batchId: string, mapping: ColumnMapping) {
      const response = await client.admin.imports.validate(batchId);
      const stored = uploaded.get(batchId);
      const locals = stored === undefined ? [] : rowsFromMapping(stored.headers, stored.dataRows, mapping);
      return {
        batch: batchFrom(response.data),
        rows: response.data.preview.map((row) => toImportRow(row, locals[row.rowNo - 1])),
      };
    },
  };

  const audit: AuditDataSource = {
    async list(query: AuditListQuery) {
      const actor = query.actor?.trim();
      const target = query.target?.trim();
      const response = await client.admin.listAudit({
        action: query.action,
        page: query.page,
        pageSize: query.pageSize,
        ...(actor !== undefined && UUID_RE.test(actor) ? { actorId: actor } : {}),
        ...(target !== undefined && UUID_RE.test(target) ? { targetId: target } : {}),
        ...(query.from !== undefined ? { from: istanbulBound(query.from, false) } : {}),
        ...(query.to !== undefined ? { to: istanbulBound(query.to, true) } : {}),
      });
      const entries = response.data
        .map(toAuditEntry)
        .filter((entry): entry is AuditEntry => entry !== null)
        .filter((entry) => matchesAuditQuery(entry, query));
      const meta = response.meta ?? { page: query.page ?? 1, pageSize: query.pageSize ?? 20, total: entries.length };
      const textFilter = (actor !== undefined && !UUID_RE.test(actor)) || (target !== undefined && !UUID_RE.test(target));
      return {
        data: entries,
        meta: textFilter ? { ...meta, total: entries.length } : meta,
      };
    },
  };

  const apiPreferences = {
    async getVisible(): Promise<boolean> {
      return (await client.preferences.getPreferences()).data.leaderboardVisible;
    },
    async setVisible(visible: boolean): Promise<boolean> {
      return (await client.preferences.setPreferences({ leaderboardVisible: visible })).data.leaderboardVisible;
    },
  };

  return {
    audit,
    gamification(session: ShellSession | null) {
      return session === null ? emptyProgress : apiProgress;
    },
    leaderboardPreferences(session: ShellSession | null) {
      if (session === null || session.simAccess === null) return null;
      return apiPreferences;
    },
    imports,
    users,
  };
}

async function runBulk(client: ApiClient, input: BulkEditInput, dryRun: boolean): Promise<BulkEditResult> {
  if ((input.operation === "assign_role" || input.operation === "revoke_role") && input.value !== "kullanici") {
    throw new Error("role_not_permitted");
  }
  if (input.operation === "set_unit" && uuidOrUndefined(input.value) === undefined && input.value !== "") {
    throw new Error("unknown_unit");
  }
  const body = input as BulkRequest;
  const response = await client.admin.bulkUsers(body, { dryRun });
  return {
    skipped: response.data.skipped.map((row) => ({
      reason: (row.code === "would_orphan_roles" ? "would_orphan_roles" : "no_change") as BulkSkipReason,
      userId: row.userId,
    })),
    updated: response.data.updated,
  };
}

/** Tarayıcı çerez oturumuna bağlı kaynaklar. DOM yoksa demo XP yerine boş ilerleme döner. */
export function createBrowserShellDataSources(baseUrl: string): ShellDataSources {
  const win = browserApiWindow();
  if (win === null) {
    const empty = createSyntheticGamificationSource(false);
    const fail = (): Promise<never> => Promise.reject(new Error("api_unavailable"));
    const users = {
      bulkApply: fail,
      bulkPreview: fail,
      create: fail,
      get: fail,
      list: fail,
      setRoles: fail,
      summary: fail,
      update: fail,
    };
    return {
      audit: { list: fail },
      gamification: () => empty,
      leaderboardPreferences: () => null,
      imports: { apply: fail, template: fail, upload: fail, validate: fail },
      users,
    };
  }
  const client = createApiClient({
    baseUrl,
    fetch: (input, init) => win.fetch(input, init),
    readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
  });
  return createApiShellDataSources(client);
}

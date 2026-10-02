import type { Context, Hono, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { z } from "zod";
import {
  ROLES,
  SIM_IDS,
  createUserRequestSchema,
  hasMappingKey,
  updateUserRequestSchema,
  userListQuerySchema,
  uuidSchema,
  type AuthMethod,
  type Role,
  type SimId,
  type SortOrder,
  type UserSort,
  type UserStatus,
} from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { csrfGuard, type AuthDeps } from "../auth/routes";
import { SESSION_COOKIE, createSessionService } from "../auth/session";
import type { AdminBulkRepo } from "./bulk";
import type { AdminImportRepo } from "./imports";
import type { AdminRoleRepo } from "./roles";

/**
 * T65 — `/admin/users` CRUD + audit (E3 §b, §c, §d). Her istekte oturum ve
 * `admin` rolü sunucuda yeniden doğrulanır (çerezde rol önbelleği yoktur);
 * başka kurumdaki kaynak 404 döner. Tüm SQL parametrelidir; hiçbir yanıt sır,
 * oturum belirteci veya ham öğrenci verisi taşımaz. Her mutasyon `audit_log`'a
 * yalnız kodlu özet yazar; askıya alma ve silme kullanıcının oturumlarını
 * iptal eder. Zamanlar `now` ile enjekte edilir; `Date.now()` kullanılmaz.
 */

/** Uçların bağlandığı bağımlılıklar; üretimde `server.ts` doldurur. */
export interface AdminDeps {
  readonly auth: AuthDeps;
  readonly users: AdminUsersRepo;
  /** T66 — `/admin/users/bulk` atomik toplu işlem deposu. */
  readonly bulk: AdminBulkRepo;
  /** T66 — `/admin/users/:id/roles` elle rol atama deposu (E3 §b). */
  readonly roles: AdminRoleRepo;
  /** T66 — `/admin/imports` staging ve uygulama deposu (E3 §c, §f). */
  readonly imports: AdminImportRepo;
  /** Sunucu tarafı opak kimlik üretimi (uuid); testler sayacı enjekte eder. */
  readonly newId: () => string;
}

/** Sınıflandırma amaçlı birim (E3 §b); yetki kapsamı değildir. */
export interface AdminUnit {
  readonly id: string;
  readonly name: string;
  /** CSV (`birim_kodu`) eşlemesi için; yalnız toplu içe aktarma kullanır. */
  readonly code?: string;
}

/** Liste satırı (E3 §d): yaşayan kullanıcılar; `deleted` listelenmez. */
interface AdminUserListItem {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly roles: readonly Role[];
  readonly unitId: string | null;
  readonly unitName: string | null;
  readonly status: UserStatus;
  readonly authMethod: AuthMethod;
  readonly createdAt: number;
  readonly lastLoginAt: number | null;
}

/** Ayrıntı kaydı; sim erişimi ve silme zamanı yalnız burada taşınır. */
export interface AdminUserRecord extends AdminUserListItem {
  readonly institutionId: string;
  readonly simAccess: readonly SimId[];
  readonly updatedAt: number;
  readonly deletedAt: number | null;
}

/** Liste sorgusu: filtreler ve sayfalama sunucuda uygulanır (E3 §d). */
interface AdminUsersListQuery {
  readonly institutionId: string;
  readonly q?: string | undefined;
  readonly role?: Role | undefined;
  readonly unitId?: string | undefined;
  readonly status?: UserStatus | undefined;
  readonly authMethod?: AuthMethod | undefined;
  readonly sort: UserSort;
  readonly order: SortOrder;
  readonly page: number;
  readonly pageSize: number;
}

export interface NewAdminUser {
  readonly id: string;
  readonly institutionId: string;
  readonly unitId: string | null;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly xapiActorId: string;
  readonly role: Role;
  readonly simAccess: readonly SimId[];
  readonly createdAt: number;
  readonly grantedBy: string | null;
}

/** PATCH sonrası çözülmüş tam değerler; eşleme anahtarı boş kalamaz. */
interface AdminUserUpdate {
  readonly displayName: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly unitId: string | null;
  readonly at: number;
}

interface AdminStatusChange {
  readonly status: UserStatus;
  readonly deletedAt: number | null;
  readonly at: number;
}

export type MappingKeyField = "username" | "email";

/** Eşleme anahtarı çakışması (E3 §d: 409 `duplicate_mapping_key`). */
export class DuplicateMappingKeyError extends Error {
  readonly field: MappingKeyField;

  constructor(field: MappingKeyField) {
    super(`Eşleme anahtarı çakışıyor: ${field}`);
    this.name = "DuplicateMappingKeyError";
    this.field = field;
  }
}

/** Havuzun depo katmanına görünen dar yüzeyi; `db.ts` çıktısı bunu karşılar. */
export interface AdminDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

export interface AdminUsersRepo {
  list(
    query: AdminUsersListQuery,
  ): Promise<{ readonly rows: readonly AdminUserListItem[]; readonly total: number }>;
  findById(id: string, institutionId: string): Promise<AdminUserRecord | null>;
  /** T66 — toplu işlem öncesi tek sorguda kapsam doğrulaması (E3 §d). */
  findByIds(ids: readonly string[], institutionId: string): Promise<readonly AdminUserRecord[]>;
  findUnit(institutionId: string, unitId: string): Promise<AdminUnit | null>;
  create(input: NewAdminUser): Promise<void>;
  update(id: string, institutionId: string, update: AdminUserUpdate): Promise<void>;
  setStatus(id: string, institutionId: string, change: AdminStatusChange): Promise<void>;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT: UserSort = "displayName";
const DEFAULT_ORDER: SortOrder = "asc";

/** Sıralama kolonları yalnız bu haritadan seçilir; kullanıcı girdisi SQL'e girmez. */
const SORT_COLUMNS: Readonly<Record<UserSort, string>> = {
  displayName: "u.display_name",
  createdAt: "u.created_at",
  lastLoginAt: "u.last_login_at",
};

const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const istanbulParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ISTANBUL_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Epoch milisaniyeyi Europe/Istanbul ofsetli ISO 8601 dizgesine çevirir (E3 §d). */
export function toIstanbulIso(epochMs: number): string {
  const parts = new Map(
    istanbulParts.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]),
  );
  const year = parts.get("year") ?? "1970";
  const month = parts.get("month") ?? "01";
  const day = parts.get("day") ?? "01";
  const hour = parts.get("hour") ?? "00";
  const minute = parts.get("minute") ?? "00";
  const second = parts.get("second") ?? "00";
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const offsetMinutes = Math.round((wallClock - epochMs) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  const millis = String(((Math.floor(epochMs) % 1000) + 1000) % 1000).padStart(3, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}${offset}`;
}

/** Katalog sırasında, tekrarsız alan listesi (`/auth/me` ile aynı kural). */
function inCatalogOrder<T extends string>(values: readonly T[], catalog: readonly T[]): T[] {
  return catalog.filter((value) => values.includes(value));
}

function normalizeRoles(values: readonly string[] | null | undefined): Role[] {
  return inCatalogOrder((values ?? []).filter((value): value is Role => ROLES.includes(value as Role)), ROLES);
}

function normalizeSimAccess(values: readonly string[] | null | undefined): SimId[] {
  return inCatalogOrder((values ?? []).filter((value): value is SimId => SIM_IDS.includes(value as SimId)), SIM_IDS);
}

/** LIKE joker karakterlerini kaçırır; desen parametre olarak taşınır. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

interface ListFilter {
  readonly where: string;
  readonly params: unknown[];
}

function buildListFilter(query: AdminUsersListQuery): ListFilter {
  const params: unknown[] = [query.institutionId];
  const conditions = ["u.institution_id = $1", "u.deleted_at is null"];
  if (query.q !== undefined) {
    params.push(`%${escapeLikePattern(query.q)}%`);
    const index = params.length;
    conditions.push(
      `(u.display_name ilike $${index} escape '\\' or u.username ilike $${index} escape '\\' or u.email ilike $${index} escape '\\')`,
    );
  }
  if (query.role !== undefined) {
    params.push(query.role);
    conditions.push(
      `exists (select 1 from user_roles r where r.user_id = u.id and r.role = $${params.length})`,
    );
  }
  if (query.unitId !== undefined) {
    params.push(query.unitId);
    conditions.push(`u.unit_id = $${params.length}`);
  }
  if (query.status !== undefined) {
    params.push(query.status);
    conditions.push(`u.status = $${params.length}`);
  }
  if (query.authMethod !== undefined) {
    params.push(query.authMethod);
    conditions.push(`u.auth_method = $${params.length}`);
  }
  return { where: conditions.join(" and "), params };
}

interface AdminUserRow {
  readonly id: string;
  readonly institution_id: string;
  readonly unit_id: string | null;
  readonly unit_name: string | null;
  readonly username: string | null;
  readonly email: string | null;
  readonly display_name: string;
  readonly auth_method: string;
  readonly status: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly last_login_at: Date | null;
  readonly deleted_at: Date | null;
  readonly roles: readonly string[] | null;
  readonly sim_access?: readonly string[] | null;
}

const USER_SELECT_COLUMNS =
  "u.id, u.institution_id, u.unit_id, un.name as unit_name, u.username, u.email, u.display_name, u.auth_method, u.status, u.created_at, u.updated_at, u.last_login_at, u.deleted_at, (select coalesce(array_agg(r.role), '{}') from user_roles r where r.user_id = u.id) as roles";

function toEpoch(value: Date | null): number | null {
  return value === null ? null : value.getTime();
}

function mapUserRow(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    authMethod: row.auth_method as AuthMethod,
    status: row.status as UserStatus,
    roles: normalizeRoles(row.roles),
    simAccess: normalizeSimAccess(row.sim_access),
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    lastLoginAt: toEpoch(row.last_login_at),
    deletedAt: toEpoch(row.deleted_at),
  };
}

interface PgErrorLike {
  readonly code?: string;
  readonly constraint?: string;
}

/** 23505 tekil ihlalini alan adına eşler; diğer hatalar aynen yükselir. */
function toDuplicateError(error: unknown): DuplicateMappingKeyError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as PgErrorLike;
  if (candidate.code !== "23505") return null;
  return new DuplicateMappingKeyError(
    candidate.constraint?.includes("email") === true ? "email" : "username",
  );
}

export function createPgAdminUsersRepo(db: AdminDb): AdminUsersRepo {
  return {
    async list(query) {
      const filter = buildListFilter(query);
      const totalResult = await db.query(
        `select count(*)::int as total from users u where ${filter.where}`,
        filter.params,
      );
      const totalRow = totalResult.rows[0] as { readonly total?: unknown } | undefined;
      const total = typeof totalRow?.total === "number" ? totalRow.total : 0;

      const direction = query.order === "desc" ? "desc" : "asc";
      const rowsResult = await db.query(
        `select ${USER_SELECT_COLUMNS} from users u left join units un on un.id = u.unit_id where ${filter.where} order by ${SORT_COLUMNS[query.sort]} ${direction} nulls last, u.id asc limit $${filter.params.length + 1} offset $${filter.params.length + 2}`,
        [...filter.params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        rows: rowsResult.rows.map((row) => mapUserRow(row as AdminUserRow)),
        total,
      };
    },

    async findById(id, institutionId) {
      const result = await db.query(
        `select ${USER_SELECT_COLUMNS}, (select coalesce(array_agg(s.sim_id), '{}') from sim_access s where s.user_id = u.id) as sim_access from users u left join units un on un.id = u.unit_id where u.id = $1 and u.institution_id = $2`,
        [id, institutionId],
      );
      const row = result.rows[0] as AdminUserRow | undefined;
      return row === undefined ? null : mapUserRow(row);
    },

    async findByIds(ids, institutionId) {
      if (ids.length === 0) return [];
      const result = await db.query(
        `select ${USER_SELECT_COLUMNS}, (select coalesce(array_agg(s.sim_id), '{}') from sim_access s where s.user_id = u.id) as sim_access from users u left join units un on un.id = u.unit_id where u.id = any($1::uuid[]) and u.institution_id = $2`,
        [[...ids], institutionId],
      );
      return result.rows.map((row) => mapUserRow(row as AdminUserRow));
    },

    async findUnit(institutionId, unitId) {
      const result = await db.query(
        "select id, name from units where id = $1 and institution_id = $2 and deleted_at is null limit 1",
        [unitId, institutionId],
      );
      const row = result.rows[0] as { readonly id: string; readonly name: string } | undefined;
      return row === undefined ? null : { id: row.id, name: row.name };
    },

    async create(input) {
      try {
        // Tek ifade: kullanıcı, rol ve sim erişimi ya tümüyle yazılır ya hiçbiri.
        await db.query(
          "with created as (insert into users (id, institution_id, unit_id, username, email, display_name, auth_method, status, xapi_actor_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, 'invited', $8, $9, $9) returning id), granted as (insert into user_roles (user_id, role, granted_by, granted_at) select id, $10, $11, $9 from created) insert into sim_access (user_id, sim_id, granted_by, granted_at) select created.id, access.sim_id, $11, $9 from created cross join unnest($12::text[]) as access(sim_id)",
          [
            input.id,
            input.institutionId,
            input.unitId,
            input.username,
            input.email,
            input.displayName,
            input.authMethod,
            input.xapiActorId,
            new Date(input.createdAt),
            input.role,
            input.grantedBy,
            [...input.simAccess],
          ],
        );
      } catch (error) {
        const conflict = toDuplicateError(error);
        if (conflict !== null) throw conflict;
        throw error;
      }
    },

    async update(id, institutionId, update) {
      try {
        await db.query(
          "update users set display_name = $3, username = $4, email = $5, unit_id = $6, updated_at = $7 where id = $1 and institution_id = $2 and deleted_at is null",
          [
            id,
            institutionId,
            update.displayName,
            update.username,
            update.email,
            update.unitId,
            new Date(update.at),
          ],
        );
      } catch (error) {
        const conflict = toDuplicateError(error);
        if (conflict !== null) throw conflict;
        throw error;
      }
    },

    async setStatus(id, institutionId, change) {
      await db.query(
        "update users set status = $3, deleted_at = $4, updated_at = $5 where id = $1 and institution_id = $2 and deleted_at is null",
        [
          id,
          institutionId,
          change.status,
          change.deletedAt === null ? null : new Date(change.deletedAt),
          new Date(change.at),
        ],
      );
    },
  };
}

export interface MemoryAdminUserSeed {
  readonly id: string;
  readonly institutionId: string;
  readonly unitId?: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status?: UserStatus;
  readonly roles?: readonly Role[];
  readonly simAccess?: readonly SimId[];
  readonly createdAt?: number;
  readonly updatedAt?: number;
  readonly lastLoginAt?: number | null;
}

interface MemoryAdminStoreSeed {
  readonly users?: readonly MemoryAdminUserSeed[];
  readonly units?: readonly (AdminUnit & { readonly institutionId: string })[];
}

export interface MemoryAdminUserState {
  readonly id: string;
  readonly institutionId: string;
  unitId: string | null;
  username: string | null;
  email: string | null;
  displayName: string;
  status: UserStatus;
  readonly authMethod: AuthMethod;
  roles: readonly Role[];
  simAccess: readonly SimId[];
  readonly createdAt: number;
  updatedAt: number;
  readonly lastLoginAt: number | null;
  deletedAt: number | null;
}

export interface MemoryAdminStore {
  readonly users: AdminUsersRepo;
  readonly records: Map<string, MemoryAdminUserState>;
  readonly units: Map<string, AdminUnit>;
  /** Birimin bağlı olduğu kurum; CSV birim eşlemesi kapsamı için (T66). */
  readonly unitInstitutions: Map<string, string>;
}

function findMappingConflict(
  records: ReadonlyMap<string, MemoryAdminUserState>,
  institutionId: string,
  username: string | null,
  email: string | null,
  excludeId: string | null,
): MappingKeyField | null {
  const needleUsername = username?.toLowerCase() ?? null;
  const needleEmail = email?.toLowerCase() ?? null;
  for (const record of records.values()) {
    if (record.institutionId !== institutionId || record.deletedAt !== null) continue;
    if (record.id === excludeId) continue;
    if (needleUsername !== null && record.username?.toLowerCase() === needleUsername) return "username";
    if (needleEmail !== null && record.email?.toLowerCase() === needleEmail) return "email";
  }
  return null;
}

/** SQL `nulls last` davranışını birebir yansıtan karşılaştırma; eşitlikte id asc. */
function compareRecords(
  a: MemoryAdminUserState,
  b: MemoryAdminUserState,
  sort: UserSort,
  order: SortOrder,
): number {
  let result = 0;
  if (sort === "lastLoginAt") {
    if (a.lastLoginAt === null && b.lastLoginAt === null) result = 0;
    else if (a.lastLoginAt === null) return 1;
    else if (b.lastLoginAt === null) return -1;
    else result = a.lastLoginAt - b.lastLoginAt;
  } else if (sort === "createdAt") {
    result = a.createdAt - b.createdAt;
  } else {
    result = a.displayName.localeCompare(b.displayName, "tr");
  }
  if (result !== 0) return order === "desc" ? -result : result;
  return a.id.localeCompare(b.id);
}

function toMemoryListItem(record: MemoryAdminUserState, units: ReadonlyMap<string, AdminUnit>): AdminUserListItem {
  return {
    id: record.id,
    displayName: record.displayName,
    username: record.username,
    email: record.email,
    roles: [...record.roles],
    unitId: record.unitId,
    unitName: record.unitId === null ? null : (units.get(record.unitId)?.name ?? null),
    status: record.status,
    authMethod: record.authMethod,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
  };
}

function toMemoryRecord(record: MemoryAdminUserState, units: ReadonlyMap<string, AdminUnit>): AdminUserRecord {
  return {
    ...toMemoryListItem(record, units),
    institutionId: record.institutionId,
    simAccess: [...record.simAccess],
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}

/** Testlerin durum okuduğu/ayarladığı bellek deposu (DB gerekmez). */
export function createMemoryAdminStore(seed: MemoryAdminStoreSeed = {}): MemoryAdminStore {
  const records = new Map<string, MemoryAdminUserState>();
  const units = new Map<string, AdminUnit>();
  const unitInstitutions = new Map<string, string>();

  for (const unit of seed.units ?? []) {
    units.set(
      unit.id,
      unit.code === undefined
        ? { id: unit.id, name: unit.name }
        : { id: unit.id, name: unit.name, code: unit.code },
    );
    unitInstitutions.set(unit.id, unit.institutionId);
  }
  for (const user of seed.users ?? []) {
    records.set(user.id, {
      id: user.id,
      institutionId: user.institutionId,
      unitId: user.unitId ?? null,
      username: user.username ?? null,
      email: user.email ?? null,
      displayName: user.displayName,
      status: user.status ?? "active",
      authMethod: user.authMethod,
      roles: [...(user.roles ?? [])],
      simAccess: [...(user.simAccess ?? [])],
      createdAt: user.createdAt ?? 0,
      updatedAt: user.updatedAt ?? user.createdAt ?? 0,
      lastLoginAt: user.lastLoginAt ?? null,
      deletedAt: null,
    });
  }

  const users: AdminUsersRepo = {
    async list(query) {
      const filtered = [...records.values()].filter((record) => {
        if (record.institutionId !== query.institutionId || record.deletedAt !== null) return false;
        if (query.status !== undefined && record.status !== query.status) return false;
        if (query.authMethod !== undefined && record.authMethod !== query.authMethod) return false;
        if (query.unitId !== undefined && record.unitId !== query.unitId) return false;
        if (query.role !== undefined && !record.roles.includes(query.role)) return false;
        const needle = query.q?.trim().toLowerCase();
        if (needle !== undefined && needle.length > 0) {
          const haystack = `${record.displayName} ${record.username ?? ""} ${record.email ?? ""}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
      const sorted = filtered.sort((a, b) => compareRecords(a, b, query.sort, query.order));
      const start = (query.page - 1) * query.pageSize;
      return {
        rows: sorted.slice(start, start + query.pageSize).map((record) => toMemoryListItem(record, units)),
        total: filtered.length,
      };
    },

    async findById(id, institutionId) {
      const record = records.get(id);
      if (record === undefined || record.institutionId !== institutionId) return null;
      return toMemoryRecord(record, units);
    },

    async findByIds(ids, institutionId) {
      const found: AdminUserRecord[] = [];
      for (const id of ids) {
        const record = records.get(id);
        if (record !== undefined && record.institutionId === institutionId) {
          found.push(toMemoryRecord(record, units));
        }
      }
      return found;
    },

    async findUnit(institutionId, unitId) {
      const unit = units.get(unitId);
      if (unit === undefined || unitInstitutions.get(unitId) !== institutionId) return null;
      return { id: unit.id, name: unit.name };
    },

    async create(input) {
      const conflict = findMappingConflict(
        records,
        input.institutionId,
        input.username,
        input.email,
        null,
      );
      if (conflict !== null) throw new DuplicateMappingKeyError(conflict);
      records.set(input.id, {
        id: input.id,
        institutionId: input.institutionId,
        unitId: input.unitId,
        username: input.username,
        email: input.email,
        displayName: input.displayName,
        status: "invited",
        authMethod: input.authMethod,
        roles: [input.role],
        simAccess: [...input.simAccess],
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        lastLoginAt: null,
        deletedAt: null,
      });
    },

    async update(id, institutionId, update) {
      const record = records.get(id);
      if (record === undefined || record.institutionId !== institutionId || record.deletedAt !== null) {
        return;
      }
      const conflict = findMappingConflict(
        records,
        institutionId,
        update.username,
        update.email,
        id,
      );
      if (conflict !== null) throw new DuplicateMappingKeyError(conflict);
      record.displayName = update.displayName;
      record.username = update.username;
      record.email = update.email;
      record.unitId = update.unitId;
      record.updatedAt = update.at;
    },

    async setStatus(id, institutionId, change) {
      const record = records.get(id);
      if (record === undefined || record.institutionId !== institutionId || record.deletedAt !== null) {
        return;
      }
      record.status = change.status;
      record.deletedAt = change.deletedAt;
      record.updatedAt = change.at;
    },
  };

  return { users, records, units, unitInstitutions };
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

function issueDetails(code: string, path: readonly string[]): unknown {
  return { issues: [{ code, path: [...path] }] };
}

function isMappingKeyIssue(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.message === "mapping_key_required");
}

function userIdFrom(c: Context<AppEnv>): string | null {
  const parsed = uuidSchema.safeParse(c.req.param("id"));
  return parsed.success ? parsed.data : null;
}

function listItemBody(item: AdminUserListItem) {
  return {
    id: item.id,
    displayName: item.displayName,
    username: item.username,
    email: item.email,
    roles: inCatalogOrder(item.roles, ROLES),
    unitId: item.unitId,
    unitName: item.unitName,
    status: item.status,
    authMethod: item.authMethod,
    createdAt: toIstanbulIso(item.createdAt),
    lastLoginAt: item.lastLoginAt === null ? null : toIstanbulIso(item.lastLoginAt),
  };
}

function detailBody(record: AdminUserRecord) {
  return {
    ...listItemBody(record),
    simAccess: inCatalogOrder(record.simAccess, SIM_IDS),
    updatedAt: toIstanbulIso(record.updatedAt),
    deletedAt: record.deletedAt === null ? null : toIstanbulIso(record.deletedAt),
  };
}

/** Audit özeti: kodlu alanlar. Ad, kullanıcı adı ve e-posta kişisel veridir; yazılmaz. */
function userSummary(record: AdminUserRecord): Record<string, string> {
  return {
    unitId: record.unitId ?? "",
    status: record.status,
    authMethod: record.authMethod,
    roles: record.roles.join(","),
  };
}

/** Admin uçlarının paylaştığı denetim yazımı; aktör ve request_id bağlamdan gelir. */
interface AdminAuditInput {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly summaryBefore?: Record<string, string>;
  readonly summaryAfter: Record<string, string>;
}

export async function insertAdminAudit(
  deps: Pick<AdminDeps, "auth">,
  c: Context<AppEnv>,
  at: number,
  input: AdminAuditInput,
): Promise<void> {
  const actor = c.get("adminActor");
  await deps.auth.audit.insert({
    occurredAt: at,
    actorUserId: actor.userId,
    actorRole: "admin",
    institutionId: actor.institutionId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summaryAfter: input.summaryAfter,
    ...(input.summaryBefore === undefined ? {} : { summaryBefore: input.summaryBefore }),
    requestId: c.get("requestId"),
  });
}

export function registerAdminUserRoutes(app: Hono<AppEnv>, deps: AdminDeps, now: () => number): void {
  const sessions = createSessionService({
    sessions: deps.auth.sessions,
    now,
    idleMs: deps.auth.sessionIdleMs,
    absoluteMs: deps.auth.sessionAbsoluteMs,
  });

  const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
    const outcome = await sessions.verify(getCookie(c, SESSION_COOKIE));
    if (!outcome.ok) {
      return jsonError(c, outcome.reason === "expired" ? "session_expired" : "unauthorized");
    }
    // Rol her istekte sunucuda yeniden okunur; çerezde önbellek yoktur (E3 §b).
    const context = await deps.auth.users.getMeContext(outcome.session.userId);
    if (context === null || context.status !== "active") {
      await sessions.revoke(getCookie(c, SESSION_COOKIE));
      return jsonError(c, "unauthorized");
    }
    if (!context.roles.includes("admin")) return jsonError(c, "forbidden");
    c.set("adminActor", { userId: context.id, institutionId: context.institution.id });
    return next();
  };

  app.use("/admin/*", csrfGuard, requireAdmin);

  async function recordAudit(
    c: Context<AppEnv>,
    input: {
      readonly action: string;
      readonly targetId: string;
      readonly summaryBefore?: Record<string, string>;
      readonly summaryAfter: Record<string, string>;
    },
  ): Promise<void> {
    await insertAdminAudit(deps, c, now(), { ...input, targetType: "user" });
  }

  async function loadScopedUser(c: Context<AppEnv>, id: string | null): Promise<AdminUserRecord | null> {
    if (id === null) return null;
    return deps.users.findById(id, c.get("adminActor").institutionId);
  }

  async function findLivingUser(c: Context<AppEnv>, id: string | null): Promise<AdminUserRecord | null> {
    const record = await loadScopedUser(c, id);
    return record === null || record.status === "deleted" ? null : record;
  }

  app.get("/admin/users", async (c) => {
    const parsed = userListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const query = {
      institutionId: c.get("adminActor").institutionId,
      q: parsed.data.q,
      role: parsed.data.role,
      unitId: parsed.data.unitId,
      status: parsed.data.status,
      authMethod: parsed.data.authMethod,
      sort: parsed.data.sort ?? DEFAULT_SORT,
      order: parsed.data.order ?? DEFAULT_ORDER,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? DEFAULT_PAGE_SIZE,
    } satisfies AdminUsersListQuery;
    const result = await deps.users.list(query);
    return c.json({
      data: result.rows.map(listItemBody),
      meta: { page: query.page, pageSize: query.pageSize, total: result.total },
    });
  });

  app.post("/admin/users", async (c) => {
    const parsed = createUserRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return isMappingKeyIssue(parsed.error)
        ? jsonError(c, "validation_failed", issueDetails("mapping_key_required", ["username"]))
        : jsonError(c, "invalid_request", validationDetails(parsed.error));
    }
    // `admin` rolü bu uçla atanamaz; yalnız mevcut admin elle atar (E3 §b, §d).
    if (parsed.data.role === "admin") return jsonError(c, "role_not_permitted");
    if (parsed.data.unitId !== undefined) {
      const unit = await deps.users.findUnit(c.get("adminActor").institutionId, parsed.data.unitId);
      if (unit === null) return jsonError(c, "validation_failed", issueDetails("unknown_unit", ["unitId"]));
    }

    const id = deps.newId();
    const createdAt = now();
    try {
      await deps.users.create({
        id,
        institutionId: c.get("adminActor").institutionId,
        unitId: parsed.data.unitId ?? null,
        username: parsed.data.username ?? null,
        email: parsed.data.email ?? null,
        displayName: parsed.data.displayName,
        authMethod: parsed.data.authMethod,
        xapiActorId: `act-${deps.newId()}`,
        role: parsed.data.role,
        simAccess: parsed.data.simAccess,
        createdAt,
        grantedBy: c.get("adminActor").userId,
      });
    } catch (error) {
      if (error instanceof DuplicateMappingKeyError) {
        return jsonError(c, "duplicate_mapping_key", { field: error.field });
      }
      throw error;
    }
    await recordAudit(c, {
      action: "user.create",
      targetId: id,
      summaryAfter: {
        status: "invited",
        authMethod: parsed.data.authMethod,
        roles: parsed.data.role,
        unitId: parsed.data.unitId ?? "",
        simAccess: parsed.data.simAccess.join(","),
      },
    });
    const created = await loadScopedUser(c, id);
    if (created === null) throw new Error("Oluşturulan kullanıcı okunamadı.");
    return c.json({ data: detailBody(created) }, 201);
  });

  app.get("/admin/users/:id", async (c) => {
    const record = await findLivingUser(c, userIdFrom(c));
    if (record === null) return jsonError(c, "not_found");
    return c.json({ data: detailBody(record) });
  });

  app.patch("/admin/users/:id", async (c) => {
    const parsed = updateUserRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return isMappingKeyIssue(parsed.error)
        ? jsonError(c, "validation_failed", issueDetails("mapping_key_required", ["username"]))
        : jsonError(c, "invalid_request", validationDetails(parsed.error));
    }
    const existing = await findLivingUser(c, userIdFrom(c));
    if (existing === null) return jsonError(c, "not_found");

    const username = parsed.data.username !== undefined ? parsed.data.username : existing.username;
    const email = parsed.data.email !== undefined ? parsed.data.email : existing.email;
    if (!hasMappingKey({ username, email })) {
      return jsonError(c, "validation_failed", issueDetails("mapping_key_required", ["username"]));
    }
    const unitId = parsed.data.unitId !== undefined ? parsed.data.unitId : existing.unitId;
    if (unitId !== null && unitId !== existing.unitId) {
      const unit = await deps.users.findUnit(existing.institutionId, unitId);
      if (unit === null) return jsonError(c, "validation_failed", issueDetails("unknown_unit", ["unitId"]));
    }

    try {
      await deps.users.update(existing.id, existing.institutionId, {
        displayName: parsed.data.displayName ?? existing.displayName,
        username,
        email,
        unitId,
        at: now(),
      });
    } catch (error) {
      if (error instanceof DuplicateMappingKeyError) {
        return jsonError(c, "duplicate_mapping_key", { field: error.field });
      }
      throw error;
    }
    const updated = await findLivingUser(c, existing.id);
    if (updated === null) throw new Error("Güncellenen kullanıcı okunamadı.");
    await recordAudit(c, {
      action: "user.update",
      targetId: existing.id,
      summaryBefore: userSummary(existing),
      summaryAfter: userSummary(updated),
    });
    return c.json({ data: detailBody(updated) });
  });

  app.post("/admin/users/:id/suspend", async (c) => {
    const existing = await findLivingUser(c, userIdFrom(c));
    if (existing === null) return jsonError(c, "not_found");
    // T149 kilitlenme koruması: admin kendi hesabını askıya alamaz; eylemi yapan aktif
    // admin kaldığı için sistemde her zaman en az bir aktif admin olur (E3 §b).
    if (existing.id === c.get("adminActor").userId) return jsonError(c, "role_not_permitted");
    const at = now();
    if (existing.status !== "suspended") {
      await deps.users.setStatus(existing.id, existing.institutionId, {
        status: "suspended",
        deletedAt: null,
        at,
      });
    }
    // Askıya alınan kullanıcının açık oturumları erişim veremez (E3 §a).
    await deps.auth.sessions.revokeForUser(existing.id, at);
    const updated = await findLivingUser(c, existing.id);
    if (updated === null) throw new Error("Askıya alınan kullanıcı okunamadı.");
    if (existing.status !== "suspended") {
      await recordAudit(c, {
        action: "user.suspend",
        targetId: existing.id,
        summaryBefore: { status: existing.status },
        summaryAfter: { status: "suspended" },
      });
    }
    return c.json({ data: detailBody(updated) });
  });

  app.post("/admin/users/:id/activate", async (c) => {
    const existing = await findLivingUser(c, userIdFrom(c));
    if (existing === null) return jsonError(c, "not_found");
    if (existing.status !== "active") {
      await deps.users.setStatus(existing.id, existing.institutionId, {
        status: "active",
        deletedAt: null,
        at: now(),
      });
    }
    const updated = await findLivingUser(c, existing.id);
    if (updated === null) throw new Error("Etkinleştirilen kullanıcı okunamadı.");
    if (existing.status !== "active") {
      await recordAudit(c, {
        action: "user.activate",
        targetId: existing.id,
        summaryBefore: { status: existing.status },
        summaryAfter: { status: "active" },
      });
    }
    return c.json({ data: detailBody(updated) });
  });

  app.delete("/admin/users/:id", async (c) => {
    const record = await loadScopedUser(c, userIdFrom(c));
    if (record === null) return jsonError(c, "not_found");
    if (record.status === "deleted") return jsonError(c, "already_deleted");
    // T149 kilitlenme koruması: admin kendi hesabını silemez.
    if (record.id === c.get("adminActor").userId) return jsonError(c, "role_not_permitted");
    const at = now();
    await deps.users.setStatus(record.id, record.institutionId, {
      status: "deleted",
      deletedAt: at,
      at,
    });
    await deps.auth.sessions.revokeForUser(record.id, at);
    const deleted = await loadScopedUser(c, record.id);
    if (deleted === null) throw new Error("Silinen kullanıcı okunamadı.");
    await recordAudit(c, {
      action: "user.delete",
      targetId: record.id,
      summaryBefore: { status: record.status },
      summaryAfter: { status: "deleted" },
    });
    return c.json({ data: detailBody(deleted) });
  });
}

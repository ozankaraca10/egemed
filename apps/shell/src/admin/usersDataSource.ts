/**
 * Kullanıcılar listesi (T69a) veri sözleşmesi + sentetik kaynak.
 *
 * `apps/api` henüz `GET /admin/users` sunmaz (E3 §d); bu yüzden ekran veriyi
 * `UsersDataSource` arayüzüyle enjekte alır ve geliştirmede tohumlu, sentetik
 * bir kaynak kullanır (`createMockUsersSource`). Alan adları ve değer
 * kümeleri `@egemed/contracts` E3 §b/§d şekilleriyle birebir örtüşür (rol,
 * durum, giriş tipi, sıralama alanları, `pageSize` üst sınırı) ama kabuk bu
 * dosyada kendi UI-yalnız kopyasını tutar: `apps/shell` henüz `@egemed/contracts`'a
 * bağımlı değildir ve bu görevde yeni bağımlılık eklenmez (AGENTS.md).
 * Sentetik ad ve kullanıcı adları gerçek kişi taşımaz ("Örnek Kullanıcı 001").
 *
 * T70: `create`/`get`/`update` ile genişletildi (kullanıcı ekle + ayrıntı/düzenle).
 */

import { shellNow } from "../now";

export type UserRole = "admin" | "kullanici";
export const USER_ROLES: readonly UserRole[] = ["admin", "kullanici"];

export type UserStatus = "invited" | "active" | "suspended" | "deleted";
export const USER_STATUSES: readonly UserStatus[] = ["invited", "active", "suspended", "deleted"];

export type UserAuthMethod = "sso" | "dev";
export const USER_AUTH_METHODS: readonly UserAuthMethod[] = ["sso", "dev"];

export type UserSort = "displayName" | "createdAt" | "lastLoginAt";
export type SortOrder = "asc" | "desc";

export interface AdminUnit {
  readonly id: string;
  /** ASCII, insan-okunur birim kodu (E3 §f `birim_kodu` sütunuyla eşleşir; T71). */
  readonly code: string;
  readonly name: string;
}

/** Sınıflandırma amaçlı sabit birim listesi (dönem/grup); yetki kapsamı değildir (E3 §b). */
export const ADMIN_UNITS: readonly AdminUnit[] = [
  { code: "1-sinif", id: "unit-1", name: "1. Sınıf" },
  { code: "2-sinif", id: "unit-2", name: "2. Sınıf" },
  { code: "3-sinif", id: "unit-3", name: "3. Sınıf" },
  { code: "4-sinif", id: "unit-4", name: "4. Sınıf" },
];

export interface AdminUser {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly role: UserRole;
  readonly unitId: string;
  readonly status: UserStatus;
  readonly authMethod: UserAuthMethod;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

/**
 * Alanlar `| undefined` ile açıkça birleşiktir: `exactOptionalPropertyTypes`
 * altında filtre temizleme (`onFilterChange({ role: undefined })`) yalnız bu
 * şekilde tip güvenlidir; aksi hâlde "temizle" yamalarında TS2379 alınır.
 */
export interface UsersListQuery {
  readonly q?: string | undefined;
  readonly role?: UserRole | undefined;
  readonly unitId?: string | undefined;
  readonly status?: UserStatus | undefined;
  readonly authMethod?: UserAuthMethod | undefined;
  readonly sort?: UserSort | undefined;
  readonly order?: SortOrder | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface UsersListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface UsersListResult {
  readonly data: readonly AdminUser[];
  readonly meta: UsersListMeta;
}

/**
 * Sim kimlikleri (AGENTS.md sırası: Pulse → Ausculta → Opaca). `SimCard.tsx`'teki
 * `SIM_IDS` ile aynı değer kümesidir; veri katmanını UI/JSX bileşen dosyasına
 * bağımlı kılmamak için burada yerel olarak tutulur (ADMIN_UNITS deseniyle aynı).
 */
export type SimId = "pulse" | "ausculta" | "opaca";
export const SIM_IDS: readonly SimId[] = ["pulse", "ausculta", "opaca"];

export interface AdminUserGamificationSummary {
  readonly simId: SimId;
  readonly xp: number;
  readonly level: number;
  readonly streakCurrent: number;
}

/**
 * `audit_log.action` kodlarından ayrıntı geçmişinde gösterilen alt küme (E3
 * §c/§d). `role.grant`/`role.revoke` T73'te `setRoles` (elle admin atama)
 * için eklendi.
 */
export type UserHistoryAction =
  | "user.create"
  | "user.suspend"
  | "user.activate"
  | "user.delete"
  | "role.grant"
  | "role.revoke";

export interface AdminUserHistoryEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: UserHistoryAction;
}

/**
 * `GET /admin/users/:id` ayrıntı yanıtı (E3 §d): temel alanlara roller, sim erişimi,
 * sim başına oyunlaştırma özeti (birleştirme YOK, ADR-006) ve durum geçmişi eklenir.
 * `email` eşleme anahtarı e-posta ise dolu, yalnız kullanıcı adıyla oluşturulmuşsa
 * `null`'dur (E3 §c: en az biri zorunlu, ikisi de olabilir).
 */
export interface AdminUserDetail extends AdminUser {
  readonly email: string | null;
  readonly roles: readonly UserRole[];
  readonly simAccess: readonly SimId[];
  readonly gamification: readonly AdminUserGamificationSummary[];
  readonly history: readonly AdminUserHistoryEntry[];
}

/** Kullanıcı ekle ekranındaki eşleme anahtarı seçimi (E3 §e.2: kullanıcı adı VEYA e-posta). */
export type MappingKeyType = "username" | "email";

/** `POST /admin/users` sözleşmesi (E3 §d): `role` bu uçtan yalnız `kullanici` olabilir. */
export interface CreateUserInput {
  readonly mappingKeyType: MappingKeyType;
  readonly mappingKeyValue: string;
  readonly displayName: string;
  readonly authMethod: UserAuthMethod;
  readonly unitId: string;
  readonly simAccess: readonly SimId[];
}

/**
 * `PATCH /admin/users/:id` + durum uçları (`suspend`/`activate`/`DELETE`) tek
 * yamada birleştirilir (mock kaynak basitliği); `sso_subject` karşılığı yoktur
 * ve hiçbir zaman düzenlenmez (E3 §d).
 */
export interface UpdateUserInput {
  readonly displayName?: string;
  readonly unitId?: string;
  readonly status?: UserStatus;
}

/**
 * `POST /admin/users/bulk` gövdesi (E3 §d; `@egemed/contracts`
 * `bulkRequestSchema` ile aynı ayrımlı birlik). `assign_role`/`revoke_role`
 * biçimsel olarak tam `UserRole` kabul eder; `value === "admin"` istek
 * düzeyinde reddedilir (bkz. `validateBulkInput` — gerçek API'de 403
 * `role_not_permitted`, E3 §b/§d). `set_unit` bu mock katmanında `null`
 * (kaldırma) desteklemez: `AdminUser.unitId` zorunlu alandır.
 */
export type BulkOperation = "assign_role" | "revoke_role" | "set_unit" | "set_status" | "grant_sim" | "revoke_sim";
export const BULK_OPERATIONS: readonly BulkOperation[] = [
  "assign_role",
  "revoke_role",
  "set_unit",
  "set_status",
  "grant_sim",
  "revoke_sim",
];
/** E3 §b: toplu durum değişimi yalnız etkinleştir/askıya alır; silme ayrı, tek kullanıcılık uçtadır. */
export type BulkStatus = "active" | "suspended";
export const BULK_STATUSES: readonly BulkStatus[] = ["active", "suspended"];

export type BulkEditInput =
  | { readonly userIds: readonly string[]; readonly operation: "assign_role" | "revoke_role"; readonly value: UserRole }
  | { readonly userIds: readonly string[]; readonly operation: "set_unit"; readonly value: string }
  | { readonly userIds: readonly string[]; readonly operation: "set_status"; readonly value: BulkStatus }
  | { readonly userIds: readonly string[]; readonly operation: "grant_sim" | "revoke_sim"; readonly value: SimId };

/** Satır atlama nedeni; hata değildir — dryRun ve gerçek uygulama aynı sayıyı verir. */
export type BulkSkipReason = "no_change" | "would_orphan_roles";
export interface BulkEditRowResult {
  readonly userId: string;
  readonly reason: BulkSkipReason;
}
/** `dryRun` önizlemesi ve gerçek uygulama aynı şekli döner (E3 §d örnek yanıtı). */
export interface BulkEditResult {
  readonly updated: number;
  readonly skipped: readonly BulkEditRowResult[];
}

/** İstek düzeyinde geçersiz işlem+değer birleşimi; satır bazlı değil (bkz. yukarıdaki tip notu). */
export type BulkValidationError = "role_not_permitted" | "unknown_unit";

/** `assign_role`/`revoke_role` yalnız `kullanici` kabul eder (§b); `set_unit` bilinen bir birimi hedeflemelidir. */
export function validateBulkInput(input: BulkEditInput): BulkValidationError | null {
  if ((input.operation === "assign_role" || input.operation === "revoke_role") && input.value !== "kullanici") {
    return "role_not_permitted";
  }
  if (input.operation === "set_unit" && !ADMIN_UNITS.some((unit) => unit.id === input.value)) {
    return "unknown_unit";
  }
  return null;
}

/** Tek kullanıcıya işlemi saf olarak uygular; değişiklik yoksa/riskliyse atlama nedeniyle döner. */
export function bulkOutcomeForUser(
  user: AdminUserDetail,
  input: BulkEditInput,
  nowMs: number,
): { readonly next: AdminUserDetail; readonly reason?: BulkSkipReason } {
  if (input.operation === "assign_role") {
    if (user.roles.includes(input.value)) return { next: user, reason: "no_change" };
    const roles = [...user.roles, input.value];
    return { next: { ...user, role: roles.includes("admin") ? "admin" : "kullanici", roles } };
  }
  if (input.operation === "revoke_role") {
    if (!user.roles.includes(input.value)) return { next: user, reason: "no_change" };
    const roles = user.roles.filter((role) => role !== input.value);
    // Kullanıcıyı tüm rollerden arındırmak (tam erişimsiz bırakmak) toplu işlemle yapılmaz.
    if (roles.length === 0) return { next: user, reason: "would_orphan_roles" };
    return { next: { ...user, role: roles.includes("admin") ? "admin" : "kullanici", roles } };
  }
  if (input.operation === "set_unit") {
    if (user.unitId === input.value) return { next: user, reason: "no_change" };
    return { next: { ...user, unitId: input.value } };
  }
  if (input.operation === "set_status") {
    if (user.status === input.value) return { next: user, reason: "no_change" };
    const action = STATUS_HISTORY_ACTION[input.value];
    const history =
      action === undefined ? user.history : [...user.history, historyEntry(user.id, user.history.length + 1, toIso(nowMs), action)];
    return { next: { ...user, history, status: input.value } };
  }
  if (input.operation === "grant_sim") {
    if (user.simAccess.includes(input.value)) return { next: user, reason: "no_change" };
    return { next: { ...user, simAccess: [...user.simAccess, input.value] } };
  }
  // Açık `=== "revoke_sim"` kontrolü: birleşik ayrımlı `operation` alanı (grant_sim|revoke_sim)
  // yüzünden dolaylı eleme yerine doğrudan eşleşme kullanılır (TS `value: SimId` daralımı için).
  if (input.operation === "revoke_sim") {
    if (!user.simAccess.includes(input.value)) return { next: user, reason: "no_change" };
    return { next: { ...user, simAccess: user.simAccess.filter((simId) => simId !== input.value) } };
  }
  throw new Error(`Tanınmayan toplu işlem: ${String(input.operation)}`);
}

/**
 * Seçilen tüm kullanıcılar için işlemi planlar (E3 §d: "herhangi bir satır
 * geçersizse işlem uygulanmaz, atomik"). Bilinmeyen `userId` tüm işlemi
 * reddeder (`Error("not_found")`); bilinen satırlar değişmiyorsa/riskliyse
 * `skipped`e düşer, hataya sayılmaz.
 */
export function planBulkEdit(
  users: readonly AdminUserDetail[],
  input: BulkEditInput,
  nowMs: number,
): { readonly updatedUsers: readonly AdminUserDetail[]; readonly result: BulkEditResult } {
  const updatedUsers: AdminUserDetail[] = [];
  const skipped: BulkEditRowResult[] = [];
  for (const userId of input.userIds) {
    const user = users.find((candidate) => candidate.id === userId);
    if (user === undefined) throw new Error("not_found");
    const outcome = bulkOutcomeForUser(user, input, nowMs);
    if (outcome.reason !== undefined) skipped.push({ reason: outcome.reason, userId });
    else updatedUsers.push(outcome.next);
  }
  return { result: { skipped, updated: updatedUsers.length }, updatedUsers };
}

/** Kendi admin rolünü kaldırma girişimini engeller (E3 §e.6 uyarısı: "kendi admin rolünü kaldıramaz"). */
export type RoleChangeError = "self_admin_removal";

export function guardSelfAdminRemoval(
  current: AdminUserDetail,
  nextRoles: readonly UserRole[],
  actingUserId: string | null,
): RoleChangeError | null {
  const removesAdmin = current.roles.includes("admin") && !nextRoles.includes("admin");
  if (actingUserId !== null && current.id === actingUserId && removesAdmin) return "self_admin_removal";
  return null;
}

export interface UsersSummary {
  readonly roleCounts: Readonly<Record<UserRole, number>>;
  readonly simCounts: Readonly<Record<SimId, number>>;
}

/** Roller ve erişim ekranı (E3 §e.6) için rol/sim sayıları; saf, tam listeden hesaplanır. */
export function computeUsersSummary(users: readonly AdminUserDetail[]): UsersSummary {
  const roleCounts: Record<UserRole, number> = { admin: 0, kullanici: 0 };
  const simCounts: Record<SimId, number> = { ausculta: 0, opaca: 0, pulse: 0 };
  for (const user of users) {
    roleCounts[user.role] += 1;
    for (const simId of user.simAccess) simCounts[simId] += 1;
  }
  return { roleCounts, simCounts };
}

/** E3 §d: liste yanıtı `{ data, meta }`; API bağlanana dek bu sözleşmeyi taşır. */
export interface UsersDataSource {
  list(query: UsersListQuery): Promise<UsersListResult>;
  /** Kayıt yoksa `null` (gerçek API'de 404 — E3 §b kural 4: varlık sızdırma yok). */
  get(id: string): Promise<AdminUserDetail | null>;
  /** Eşleme anahtarı zaten kayıtlıysa `Error("duplicate_mapping_key")` ile reddeder (409). */
  create(input: CreateUserInput): Promise<AdminUserDetail>;
  /** Kayıt yoksa `Error("not_found")` ile reddeder (404). */
  update(id: string, patch: UpdateUserInput): Promise<AdminUserDetail>;
  /** `POST /admin/users/bulk?dryRun=true`; hiçbir kaydı değiştirmez, yalnız etkiyi hesaplar. */
  bulkPreview(input: BulkEditInput): Promise<BulkEditResult>;
  /** `POST /admin/users/bulk`; atomik uygular (bkz. `planBulkEdit`). */
  bulkApply(input: BulkEditInput): Promise<BulkEditResult>;
  /**
   * `PUT /admin/users/:id/roles` (T73, E3 §b/§e.6): admin rolünü elle ver/kaldır.
   * `actingUserId` geçerli oturumun kimliğidir; kendi admin rolünü kaldırma
   * girişimi `Error("self_admin_removal")` ile reddedilir.
   */
  setRoles(id: string, roles: readonly UserRole[], actingUserId?: string | null): Promise<AdminUserDetail>;
  /** Roller ve erişim ekranı özet sayıları (E3 §e.6). */
  summary(): Promise<UsersSummary>;
}

export const DEFAULT_PAGE_SIZE = 20;
/** E3 §d: `pageSize` en çok 100. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT: UserSort = "displayName";
export const DEFAULT_ORDER: SortOrder = "asc";

/** Sorguda arama, rol, birim, durum ve giriş tipi filtrelerinden herhangi biri etkinse `true`. */
export function hasActiveFilters(query: UsersListQuery): boolean {
  return (
    (query.q?.trim().length ?? 0) > 0 ||
    query.role !== undefined ||
    query.unitId !== undefined ||
    query.status !== undefined ||
    query.authMethod !== undefined
  );
}

/** Tek kullanıcının sorguyla eşleşip eşleşmediğini saf olarak değerlendirir. */
export function matchesUserQuery(user: AdminUser, query: UsersListQuery): boolean {
  if (query.role !== undefined && user.role !== query.role) return false;
  if (query.unitId !== undefined && user.unitId !== query.unitId) return false;
  if (query.status !== undefined && user.status !== query.status) return false;
  if (query.authMethod !== undefined && user.authMethod !== query.authMethod) return false;
  const needle = query.q?.trim().toLowerCase();
  if (needle !== undefined && needle.length > 0) {
    const haystack = `${user.displayName} ${user.username}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function compareUsers(a: AdminUser, b: AdminUser, sort: UserSort): number {
  if (sort === "displayName") return a.displayName.localeCompare(b.displayName, "tr");
  if (sort === "createdAt") return a.createdAt.localeCompare(b.createdAt);
  return (a.lastLoginAt ?? "").localeCompare(b.lastLoginAt ?? "");
}

/** Saf sıralama; girdi dizisini değiştirmez. */
export function sortUsers(
  users: readonly AdminUser[],
  sort: UserSort = DEFAULT_SORT,
  order: SortOrder = DEFAULT_ORDER,
): AdminUser[] {
  const sorted = [...users].sort((a, b) => compareUsers(a, b, sort));
  return order === "desc" ? sorted.reverse() : sorted;
}

/** `pageSize`'ı [1, 100] aralığına kilitler; geçersiz değerde varsayılan. */
export function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

/** Sayfa numarasını en az 1'e kilitler; geçersiz değerde 1. */
export function clampPage(page: number | undefined): number {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/** Saf sayfalama; sıralanmış diziden dilim alır. */
export function paginateUsers(
  users: readonly AdminUser[],
  page: number | undefined,
  pageSize: number | undefined,
): AdminUser[] {
  const size = clampPageSize(pageSize);
  const current = clampPage(page);
  const start = (current - 1) * size;
  return users.slice(start, start + size);
}

/** Filtre → sıralama → sayfalama sırasıyla sorguyu uygular; `meta.total` filtre SONRASI sayıdır. */
export function applyUsersQuery(users: readonly AdminUser[], query: UsersListQuery): UsersListResult {
  const filtered = users.filter((user) => matchesUserQuery(user, query));
  const sorted = sortUsers(filtered, query.sort, query.order);
  const pageSize = clampPageSize(query.pageSize);
  const page = clampPage(query.page);
  return {
    data: paginateUsers(sorted, page, pageSize),
    meta: { page, pageSize, total: filtered.length },
  };
}

/** mulberry32: bağımlılıksız, deterministik 32 bit PRNG; `auditDataSource.ts` da bunu paylaşır. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  const item = items[index];
  if (item === undefined) throw new Error("Boş havuzdan seçim yapılamaz.");
  return item;
}

/**
 * Sentetik veri sabit bir başlangıç anına göre üretilir; `Date.now()` KULLANILMAZ
 * (AGENTS.md, eslint `no-restricted-properties`). Üretim tamamen tohum + sabit
 * ofsetlerden türer, bu yüzden aynı `seed` her zaman aynı veriyi verir.
 */
const SEED_EPOCH_MS = Date.parse("2026-01-05T09:00:00.000+03:00");
const DAY_MS = 86_400_000;
const STATUS_POOL: readonly UserStatus[] = ["active", "active", "active", "invited", "suspended", "deleted"];
const AUTH_POOL: readonly UserAuthMethod[] = ["sso", "sso", "sso", "dev"];

/** Kullanıcı geçmişindeki tek girdi; `history`'de kayıt sırasına göre eklenir. */
function historyEntry(id: string, index: number, occurredAt: string, action: UserHistoryAction): AdminUserHistoryEntry {
  return { action, id: `${id}-hist-${index}`, occurredAt };
}

/** Deterministik sentetik kullanıcı ayrıntısı listesi üretir; gerçek kişi verisi taşımaz.
 * `list()` yalnız temel `AdminUser` alanlarını döner; `get()` bu tam kayıtları döner. */
export function generateSyntheticUsers(seed: number, count: number): AdminUserDetail[] {
  const rng = mulberry32(seed);
  const users: AdminUserDetail[] = [];
  for (let index = 1; index <= count; index += 1) {
    const number = String(index).padStart(3, "0");
    const id = `user-${number}`;
    const role: UserRole = rng() < 0.04 ? "admin" : "kullanici";
    const unit = pick(rng, ADMIN_UNITS);
    const status = pick(rng, STATUS_POOL);
    const authMethod = pick(rng, AUTH_POOL);
    const createdOffset = Math.floor(rng() * 260);
    const createdAt = new Date(SEED_EPOCH_MS + createdOffset * DAY_MS).toISOString();
    const hasLoggedIn = status !== "invited" && status !== "deleted" && rng() < 0.85;
    const loginOffset = createdOffset + Math.floor(rng() * 60);
    const lastLoginAt = hasLoggedIn ? new Date(SEED_EPOCH_MS + loginOffset * DAY_MS).toISOString() : null;
    const simAccess = SIM_IDS.filter(() => rng() < 0.7);
    const gamification: AdminUserGamificationSummary[] = simAccess.map((simId) => ({
      level: 1 + Math.floor(rng() * 6),
      simId,
      streakCurrent: Math.floor(rng() * 10),
      xp: Math.floor(rng() * 2000),
    }));
    const history: AdminUserHistoryEntry[] = [historyEntry(id, 1, createdAt, "user.create")];
    if (status === "suspended") history.push(historyEntry(id, 2, lastLoginAt ?? createdAt, "user.suspend"));
    if (status === "deleted") history.push(historyEntry(id, 2, lastLoginAt ?? createdAt, "user.delete"));
    users.push({
      authMethod,
      createdAt,
      displayName: `Örnek Kullanıcı ${number}`,
      email: null,
      gamification,
      history,
      id,
      lastLoginAt,
      role,
      roles: [role],
      simAccess,
      status,
      unitId: unit.id,
      username: `ornek.kullanici.${number}`,
    });
  }
  return users;
}

export const DEFAULT_MOCK_SEED = 69;
export const DEFAULT_MOCK_SIZE = 240;

/** ISO 8601 anına çevirir; girdi her zaman enjekte edilen `now()`'dan gelir (Date.now() YOK). */
function toIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

/**
 * Doğrulanmış (bkz. `userForm.ts` `validateCreateUserForm`) girdiden yeni kayıt üretir;
 * saf fonksiyondur — zaman ve kimlik dışarıdan verilir, test edilebilir.
 */
export function buildCreatedUserDetail(input: CreateUserInput, nowMs: number, id: string): AdminUserDetail {
  const rawValue = input.mappingKeyValue.trim();
  const value = input.mappingKeyType === "email" ? rawValue.toLowerCase() : rawValue;
  // E3 §c: kullanıcı adı VEYA e-posta yeterlidir. Bu mock katmanı `AdminUser.username`'ı
  // her zaman dolu tutar (liste sütunu); e-posta anahtarında yerel kısım kullanılır.
  const username = input.mappingKeyType === "username" ? value : (value.split("@")[0] ?? value);
  const email = input.mappingKeyType === "email" ? value : null;
  const createdAt = toIso(nowMs);
  return {
    authMethod: input.authMethod,
    createdAt,
    displayName: input.displayName.trim(),
    email,
    gamification: [],
    history: [historyEntry(id, 1, createdAt, "user.create")],
    id,
    lastLoginAt: null,
    role: "kullanici",
    roles: ["kullanici"],
    simAccess: input.simAccess,
    status: "invited",
    unitId: input.unitId,
    username,
  };
}

const STATUS_HISTORY_ACTION: Partial<Record<UserStatus, UserHistoryAction>> = {
  active: "user.activate",
  deleted: "user.delete",
  suspended: "user.suspend",
};

/** Saf yama uygulayıcı; durum değişince geçmişe girdi ekler (E3 §d: her mutasyon audit'lenir). */
export function applyUserPatch(current: AdminUserDetail, patch: UpdateUserInput, nowMs: number): AdminUserDetail {
  const nextStatus = patch.status ?? current.status;
  const historyAction =
    patch.status !== undefined && patch.status !== current.status ? STATUS_HISTORY_ACTION[patch.status] : undefined;
  const history =
    historyAction === undefined
      ? current.history
      : [...current.history, historyEntry(current.id, current.history.length + 1, toIso(nowMs), historyAction)];
  return {
    ...current,
    displayName: patch.displayName?.trim() ?? current.displayName,
    history,
    status: nextStatus,
    unitId: patch.unitId ?? current.unitId,
  };
}

/** Sentetik, tohumlu `UsersDataSource`; API bağlanana dek `UsersPage`/`UserFormPage`/`UserDetailPage` bunu kullanır.
 * `now` enjekte edilir (AGENTS.md); varsayılan `shellNow` gerçek duvar saatini okur. */
export function createMockUsersSource(
  seed: number = DEFAULT_MOCK_SEED,
  size: number = DEFAULT_MOCK_SIZE,
  now: () => number = shellNow,
): UsersDataSource {
  const users: AdminUserDetail[] = generateSyntheticUsers(seed, size);
  let createdCount = 0;

  function isDuplicateMappingKey(type: MappingKeyType, value: string): boolean {
    return type === "username"
      ? users.some((user) => user.username.toLowerCase() === value)
      : users.some((user) => (user.email ?? "").toLowerCase() === value);
  }

  function runBulk(input: BulkEditInput, apply: boolean): Promise<BulkEditResult> {
    const validationError = validateBulkInput(input);
    if (validationError !== null) return Promise.reject(new Error(validationError));
    try {
      const { result, updatedUsers } = planBulkEdit(users, input, now());
      if (apply) {
        for (const updated of updatedUsers) {
          const index = users.findIndex((candidate) => candidate.id === updated.id);
          if (index !== -1) users[index] = updated;
        }
      }
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("internal_error"));
    }
  }

  return {
    bulkApply(input: BulkEditInput): Promise<BulkEditResult> {
      return runBulk(input, true);
    },
    bulkPreview(input: BulkEditInput): Promise<BulkEditResult> {
      return runBulk(input, false);
    },
    create(input: CreateUserInput): Promise<AdminUserDetail> {
      const value = input.mappingKeyType === "email" ? input.mappingKeyValue.trim().toLowerCase() : input.mappingKeyValue.trim();
      if (isDuplicateMappingKey(input.mappingKeyType, value)) {
        return Promise.reject(new Error("duplicate_mapping_key"));
      }
      createdCount += 1;
      const created = buildCreatedUserDetail(input, now(), `user-created-${createdCount}`);
      users.push(created);
      return Promise.resolve(created);
    },
    get(id: string): Promise<AdminUserDetail | null> {
      return Promise.resolve(users.find((user) => user.id === id) ?? null);
    },
    list(query: UsersListQuery): Promise<UsersListResult> {
      return Promise.resolve(applyUsersQuery(users, query));
    },
    setRoles(id: string, roles: readonly UserRole[], actingUserId: string | null = null): Promise<AdminUserDetail> {
      const index = users.findIndex((user) => user.id === id);
      const current = users[index];
      if (index === -1 || current === undefined) return Promise.reject(new Error("not_found"));
      const guard = guardSelfAdminRemoval(current, roles, actingUserId);
      if (guard !== null) return Promise.reject(new Error(guard));
      const grantedAdmin = roles.includes("admin") && !current.roles.includes("admin");
      const revokedAdmin = !roles.includes("admin") && current.roles.includes("admin");
      const action: UserHistoryAction | null = grantedAdmin ? "role.grant" : revokedAdmin ? "role.revoke" : null;
      const history =
        action === null ? current.history : [...current.history, historyEntry(id, current.history.length + 1, toIso(now()), action)];
      const updated: AdminUserDetail = { ...current, history, role: roles.includes("admin") ? "admin" : "kullanici", roles };
      users[index] = updated;
      return Promise.resolve(updated);
    },
    summary(): Promise<UsersSummary> {
      return Promise.resolve(computeUsersSummary(users));
    },
    update(id: string, patch: UpdateUserInput): Promise<AdminUserDetail> {
      const index = users.findIndex((user) => user.id === id);
      const current = users[index];
      if (index === -1 || current === undefined) return Promise.reject(new Error("not_found"));
      const updated = applyUserPatch(current, patch, now());
      users[index] = updated;
      return Promise.resolve(updated);
    },
  };
}

/** Seçim kümesini değiştirmeden yeni bir küme döndürür (toggle). */
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Birim kimliğini görünen ada çevirir; tanınmayan kimlikte kimliği döndürür. */
export function unitNameFor(unitId: string, units: readonly AdminUnit[] = ADMIN_UNITS): string {
  return units.find((unit) => unit.id === unitId)?.name ?? unitId;
}

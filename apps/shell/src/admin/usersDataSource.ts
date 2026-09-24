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
 */

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
  readonly name: string;
}

/** Sınıflandırma amaçlı sabit birim listesi (dönem/grup); yetki kapsamı değildir (E3 §b). */
export const ADMIN_UNITS: readonly AdminUnit[] = [
  { id: "unit-1", name: "1. Sınıf" },
  { id: "unit-2", name: "2. Sınıf" },
  { id: "unit-3", name: "3. Sınıf" },
  { id: "unit-4", name: "4. Sınıf" },
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

/** E3 §d: liste yanıtı `{ data, meta }`; API bağlanana dek bu sözleşmeyi taşır. */
export interface UsersDataSource {
  list(query: UsersListQuery): Promise<UsersListResult>;
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

/** mulberry32: bağımlılıksız, deterministik 32 bit PRNG. */
function mulberry32(seed: number): () => number {
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

/** Deterministik sentetik kullanıcı listesi üretir; gerçek kişi verisi taşımaz. */
export function generateSyntheticUsers(seed: number, count: number): AdminUser[] {
  const rng = mulberry32(seed);
  const users: AdminUser[] = [];
  for (let index = 1; index <= count; index += 1) {
    const number = String(index).padStart(3, "0");
    const role: UserRole = rng() < 0.04 ? "admin" : "kullanici";
    const unit = pick(rng, ADMIN_UNITS);
    const status = pick(rng, STATUS_POOL);
    const authMethod = pick(rng, AUTH_POOL);
    const createdOffset = Math.floor(rng() * 260);
    const createdAt = new Date(SEED_EPOCH_MS + createdOffset * DAY_MS).toISOString();
    const hasLoggedIn = status !== "invited" && status !== "deleted" && rng() < 0.85;
    const loginOffset = createdOffset + Math.floor(rng() * 60);
    const lastLoginAt = hasLoggedIn ? new Date(SEED_EPOCH_MS + loginOffset * DAY_MS).toISOString() : null;
    users.push({
      authMethod,
      createdAt,
      displayName: `Örnek Kullanıcı ${number}`,
      id: `user-${number}`,
      lastLoginAt,
      role,
      status,
      unitId: unit.id,
      username: `ornek.kullanici.${number}`,
    });
  }
  return users;
}

export const DEFAULT_MOCK_SEED = 69;
export const DEFAULT_MOCK_SIZE = 240;

/** Sentetik, tohumlu `UsersDataSource`; API bağlanana dek `UsersPage` bunu kullanır. */
export function createMockUsersSource(
  seed: number = DEFAULT_MOCK_SEED,
  size: number = DEFAULT_MOCK_SIZE,
): UsersDataSource {
  const users = generateSyntheticUsers(seed, size);
  return {
    list(query: UsersListQuery): Promise<UsersListResult> {
      return Promise.resolve(applyUsersQuery(users, query));
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

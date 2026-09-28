/**
 * Kimlik sözleşmesi (ADR-007; E3 §a, §b). Sim kimliği `@egemed/sim-host`
 * `SimulatorId` ile aynı birlik tipidir; tek kaynak drift'i
 * `tests/contracts/ids-errors.test.ts` içinde hem tip hem çalışma zamanı
 * düzeyinde doğrulanır.
 */

export type SimId = "pulse" | "ausculta" | "opaca";

export const SIM_IDS = ["pulse", "ausculta", "opaca"] as const satisfies readonly SimId[];

/** Çalışma zamanı koruması: birlik dışı değerleri reddeder. */
export function isSimId(value: unknown): value is SimId {
  return typeof value === "string" && (SIM_IDS as readonly string[]).includes(value);
}

/**
 * ADR-007 depo sahibi kararı (E3 §b) + 26 Eyl 2026: `ogretim_uyesi` rolü.
 * 28 Eyl 2026: `uzmanlik_ogrencisi` rolü. İki rol de simleri tam içerikle
 * kullanır ama oyunlaştırmaya (rozet, XP, liderlik, Meydan Okuma) katılmaz
 * ve bu listelerde seçilemez.
 */
export type Role = "admin" | "kullanici" | "ogretim_uyesi" | "uzmanlik_ogrencisi";

export const ROLES = ["admin", "kullanici", "ogretim_uyesi", "uzmanlik_ogrencisi"] as const satisfies readonly Role[];

/** Oyunlaştırmaya katılım: öğretim üyesi ya da uzmanlık öğrencisi rolü taşıyan hesap katılmaz. */
export function isGamificationEligible(roles: readonly Role[]): boolean {
  return !roles.includes("ogretim_uyesi") && !roles.includes("uzmanlik_ogrencisi");
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * CSV ve toplu işlemlerde atanabilir tek rol (E3 §b, §f): `admin` toplu yolla
 * atanamaz; yalnız mevcut bir admin elle atar. Uç nokta gövdesinde `admin`
 * görülürse yetki katmanı 403 `role_not_permitted` döner; bu yüzden istek
 * şemaları tam `Role` tipini kabul eder, kısıt yetki katmanındadır.
 */
export const ASSIGNABLE_ROLES = ["kullanici", "ogretim_uyesi", "uzmanlik_ogrencisi"] as const satisfies readonly Role[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

/** E3 §a: üretimde `sso`; `dev` yalnız geliştirme ortamında. */
export type AuthMethod = "sso" | "dev";

export const AUTH_METHODS = ["sso", "dev"] as const satisfies readonly AuthMethod[];

export function isAuthMethod(value: unknown): value is AuthMethod {
  return typeof value === "string" && (AUTH_METHODS as readonly string[]).includes(value);
}

/** E3 §a durum yaşam döngüsü: invited → active → suspended/deleted. */
export type UserStatus = "invited" | "active" | "suspended" | "deleted";

export const USER_STATUSES = ["invited", "active", "suspended", "deleted"] as const satisfies readonly UserStatus[];

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && (USER_STATUSES as readonly string[]).includes(value);
}

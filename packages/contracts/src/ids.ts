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

/** ADR-007 depo sahibi kararı: yalnız iki rol vardır (E3 §b). */
export type Role = "admin" | "kullanici";

export const ROLES = ["admin", "kullanici"] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * CSV ve toplu işlemlerde atanabilir tek rol (E3 §b, §f): `admin` toplu yolla
 * atanamaz; yalnız mevcut bir admin elle atar. Uç nokta gövdesinde `admin`
 * görülürse yetki katmanı 403 `role_not_permitted` döner; bu yüzden istek
 * şemaları tam `Role` tipini kabul eder, kısıt yetki katmanındadır.
 */
export const ASSIGNABLE_ROLES = ["kullanici"] as const satisfies readonly Role[];

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

/**
 * "Kullanıcı ekle" formu (T70, E3 §e.2) için DOM'suz, saf doğrulama fonksiyonları.
 * `UserFormPage.tsx` bu modülü çağırır; burada React/JSX yoktur ki testler
 * DOM'suz kalabilsin (SimRoute/usersDataSource deseniyle aynı).
 *
 * Kurallar E3 §c/§f'ten alınır: kullanıcı adı `^[a-z0-9][a-z0-9._-]{2,63}$`
 * (3–64 karakter), e-posta biçimi + küçük harfe normalize, görünen ad 2–120
 * karakter, birim zorunlu (bu mock katmanında `unitId` her zaman doludur).
 * `role` bu ekrandan yalnız `kullanici`dır (§b) — form bunu seçenek olarak
 * sunmaz, sabit değerdir.
 */

import type { MappingKeyType, SimId, UserAuthMethod } from "./usersDataSource";

export interface CreateUserFormValues {
  readonly mappingKeyType: MappingKeyType;
  readonly mappingKeyValue: string;
  readonly displayName: string;
  readonly authMethod: UserAuthMethod;
  readonly unitId: string;
  readonly simAccess: readonly SimId[];
}

export const INITIAL_CREATE_USER_VALUES: CreateUserFormValues = {
  authMethod: "sso",
  displayName: "",
  mappingKeyType: "username",
  mappingKeyValue: "",
  simAccess: [],
  unitId: "",
};

export type CreateUserFieldErrorCode =
  | "mappingValueRequired"
  | "usernameInvalid"
  | "emailInvalid"
  | "duplicateMappingKey"
  | "displayNameInvalid"
  | "unitRequired";

export type CreateUserFieldName = "mappingKeyValue" | "displayName" | "unitId";

export type CreateUserFieldErrors = Partial<Record<CreateUserFieldName, CreateUserFieldErrorCode>>;

/** E3 §c `users.username`: `^[a-z0-9][a-z0-9._-]{2,63}$` (toplam 3–64 karakter). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
/** Basit e-posta biçimi; sunucu tarafı doğrulama nihai karardır (bu yalnız istemci ön denetimi). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Eşleme anahtarı değerini tipe göre normalize eder: e-posta küçük harfe, ikisi de kırpılır (E3 §c). */
export function normalizeMappingKeyValue(type: MappingKeyType, raw: string): string {
  const trimmed = raw.trim();
  return type === "email" ? trimmed.toLowerCase() : trimmed;
}

/** Saf doğrulama: sunucu tarafı yinelenen anahtar denetimi kapsam dışıdır (bkz. `UsersDataSource.create`). */
export function validateCreateUserForm(values: CreateUserFormValues): CreateUserFieldErrors {
  const errors: CreateUserFieldErrors = {};
  const value = normalizeMappingKeyValue(values.mappingKeyType, values.mappingKeyValue);
  if (value.length === 0) {
    errors.mappingKeyValue = "mappingValueRequired";
  } else if (values.mappingKeyType === "username" && !USERNAME_PATTERN.test(value)) {
    errors.mappingKeyValue = "usernameInvalid";
  } else if (values.mappingKeyType === "email" && !EMAIL_PATTERN.test(value)) {
    errors.mappingKeyValue = "emailInvalid";
  }
  const name = values.displayName.trim();
  if (name.length < 2 || name.length > 120) errors.displayName = "displayNameInvalid";
  if (values.unitId.length === 0) errors.unitId = "unitRequired";
  return errors;
}

export function hasFormErrors(errors: CreateUserFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Sim erişimi kümesini değiştirmeden ekler/çıkarır (toggleSelected deseniyle aynı). */
export function toggleSimAccess(current: readonly SimId[], simId: SimId): SimId[] {
  return current.includes(simId) ? current.filter((id) => id !== simId) : [...current, simId];
}

/** Form değerleri başlangıç durumundan farklıysa `true` (kaydedilmemiş değişiklik var mı — E3 §e.2). */
export function isFormDirty(values: CreateUserFormValues): boolean {
  return (
    values.mappingKeyType !== INITIAL_CREATE_USER_VALUES.mappingKeyType ||
    values.mappingKeyValue !== INITIAL_CREATE_USER_VALUES.mappingKeyValue ||
    values.displayName !== INITIAL_CREATE_USER_VALUES.displayName ||
    values.authMethod !== INITIAL_CREATE_USER_VALUES.authMethod ||
    values.unitId !== INITIAL_CREATE_USER_VALUES.unitId ||
    values.simAccess.length > 0
  );
}

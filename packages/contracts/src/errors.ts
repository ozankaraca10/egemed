/**
 * Hata kodu kataloğu (E3 §d). Sunucu kullanıcıya görünen metin döndürmez;
 * yanıt `{ "error": { "code", "details?" } }` taşır ve metin `@egemed/ui`
 * i18n'de çözülür. Bu dosya bilinçli olarak zod'a bağımlı değildir: katalog
 * saf veridir, zarf şeması `schemas/common.ts` içindedir.
 */

const ERROR_STATUS_BY_CODE = {
  invalid_request: 400,
  unauthorized: 401,
  session_expired: 401,
  auth_state_invalid: 401,
  auth_denied_unknown_user: 401,
  auth_denied_suspended: 401,
  auth_subject_mismatch: 401,
  forbidden: 403,
  role_not_permitted: 403,
  /** A4 (ADR-009): puanlı deneme istemciden yazılamaz; sunucu oturumu yazar. */
  server_scored: 403,
  not_found: 404,
  duplicate_mapping_key: 409,
  conflict: 409,
  already_deleted: 409,
  validation_failed: 422,
  import_validation_failed: 422,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS_BY_CODE;

export type ErrorStatus = (typeof ERROR_STATUS_BY_CODE)[ErrorCode];

export const ERROR_CODE_LIST = Object.keys(ERROR_STATUS_BY_CODE) as [ErrorCode, ...ErrorCode[]];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_STATUS_BY_CODE, value);
}

export function statusForErrorCode(code: ErrorCode): ErrorStatus {
  return ERROR_STATUS_BY_CODE[code];
}

function groupCodesByStatus(): Readonly<Record<ErrorStatus, readonly ErrorCode[]>> {
  // Anahtarlar `ErrorStatus`ten türetilir: kataloğa yeni bir durum eklenirse
  // bu literal eksik kalır ve typecheck kırılır (drift koruması).
  const grouped: Record<ErrorStatus, ErrorCode[]> = {
    400: [],
    401: [],
    403: [],
    404: [],
    409: [],
    413: [],
    422: [],
    429: [],
    500: [],
  };
  for (const code of ERROR_CODE_LIST) {
    grouped[ERROR_STATUS_BY_CODE[code]].push(code);
  }
  return grouped;
}

/** HTTP durumu → o durumda dönebilecek kodlar (katalog ters indeksi). */
export const ERROR_CODES_BY_STATUS = groupCodesByStatus();

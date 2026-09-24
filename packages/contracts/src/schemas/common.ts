import { z } from "zod";
import { AUTH_METHODS, ROLES, SIM_IDS, USER_STATUSES } from "../ids";
import { ERROR_CODE_LIST } from "../errors";

/** E3 §c eşleme anahtarı biçimleri. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
export const UNIT_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Kodlu alanlar (özet anahtarı, rozet anahtarı) ASCII küçük harftir. */
export const CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const BADGE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const uuidSchema = z.uuid();
/** E3 §d örnekleri ofsetli ISO 8601 taşır (`+03:00`). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateSchema = z.iso.date();

export const displayNameSchema = z.string().trim().min(2).max(120);
export const usernameSchema = z.string().regex(USERNAME_PATTERN);
/** E3 §a: e-posta küçük harfe normalize edilir. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const unitCodeSchema = z.string().regex(UNIT_CODE_PATTERN);

export const roleSchema = z.enum(ROLES);
export const authMethodSchema = z.enum(AUTH_METHODS);
export const userStatusSchema = z.enum(USER_STATUSES);
export const simIdSchema = z.enum(SIM_IDS);
export const simIdListSchema = z.array(simIdSchema);

/** E3 §d: `pageSize` en çok 100. Sorgu dizgeleri için sayıya çevrilir. */
export const pageSizeSchema = z.coerce.number().int().min(1).max(100);

export const pageMetaSchema = z.strictObject({
  page: z.coerce.number().int().min(1),
  pageSize: pageSizeSchema,
  total: z.coerce.number().int().min(0),
});

/** Sorgu parametresi boolean'ı yalnız `true`/`false` kabul eder. */
export const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");

/** E3 §a: `username` veya `email` en az biri zorunludur. */
export function hasMappingKey(value: {
  readonly username?: string | null | undefined;
  readonly email?: string | null | undefined;
}): boolean {
  return value.username != null || value.email != null;
}

export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(ERROR_CODE_LIST),
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export function listResponseSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ data: z.array(item), meta: pageMetaSchema });
}

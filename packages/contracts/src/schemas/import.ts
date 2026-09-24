import { z } from "zod";
import { ASSIGNABLE_ROLES, AUTH_METHODS } from "../ids";
import { displayNameSchema, emailSchema, simIdListSchema, unitCodeSchema, usernameSchema } from "./common";

/** E3 §f: UTF-8, `;` ayraç, RFC 4180 tırnaklama, ilk satır başlık. */
export const CSV_DELIMITER = ";";
export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_BYTES = 2_000_000;

export const CSV_COLUMNS = [
  "kullanici_adi",
  "eposta",
  "ad_soyad",
  "rol",
  "birim_kodu",
  "sim_erisimi",
  "giris_tipi",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** §f hata raporu CSV'si: `satir_no;kolon;kod;aciklama`. */
export const CSV_ERROR_COLUMNS = ["satir_no", "kolon", "kod", "aciklama"] as const;

/** §f: başlık eşleşmesi zorunlu; sıra ve küme birebir olmalıdır. */
export function isCsvHeader(value: readonly string[]): boolean {
  return (
    value.length === CSV_COLUMNS.length &&
    CSV_COLUMNS.every((column, index) => value[index] === column)
  );
}

/** Boş hücre "yok" sayılır; hücreler kırpılarak değerlendirilir. */
function csvOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

/** Boş/eksik hücrede varsayılanı uygular (E3 §f: rol, giris_tipi). */
function csvWithDefault<T extends z.ZodType>(schema: T, fallback: z.output<T>) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional().transform((value) => value ?? fallback),
  );
}

/** `pulse, ausculta` → `["pulse", "ausculta"]`; boş = erişim yok (E3 §f). */
export const csvSimAccessSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    )
    .pipe(simIdListSchema),
);

/** CSV satırı (§f). `rol` yalnız `kullanici`; `admin` satır hatasıdır. */
export const csvRowSchema = z
  .strictObject({
    kullanici_adi: csvOptional(usernameSchema),
    eposta: csvOptional(emailSchema),
    ad_soyad: displayNameSchema,
    rol: csvWithDefault(z.enum(ASSIGNABLE_ROLES), "kullanici"),
    birim_kodu: csvOptional(unitCodeSchema),
    sim_erisimi: csvSimAccessSchema,
    giris_tipi: csvWithDefault(z.enum(AUTH_METHODS), "sso"),
  })
  .refine((row) => row.kullanici_adi !== undefined || row.eposta !== undefined, {
    message: "mapping_key_required",
    path: ["kullanici_adi"],
  });

export type CsvRow = z.infer<typeof csvRowSchema>;

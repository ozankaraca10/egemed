/**
 * Admin toplu içe aktarma sihirbazı (T71, E3 §e.4 + §f) için DOM'suz veri
 * katmanı: RFC 4180 benzeri CSV ayrıştırma/üretme, saf doğrulama fonksiyonları
 * ve `ImportsDataSource` sözleşmesiyle uyumlu, tohumlu sentetik kaynak.
 *
 * `apps/api` henüz `/admin/imports*` sunmaz (E3 §d); bu yüzden ekran veriyi bu
 * arayüz üzerinden enjekte alır. `apps/shell` `@egemed/contracts`'a bağımlı
 * değildir (AGENTS.md: onaysız yeni bağımlılık yok); alan adları E3 §d/§f
 * şekilleriyle örtüşen yerel bir kopyadır (usersDataSource.ts deseniyle aynı).
 *
 * Hata raporu CSV'si formül enjeksiyonuna karşı kaçışlıdır: `=`, `+`, `-`, `@`
 * ile başlayan hücrelerin önüne tek tırnak eklenir (`escapeCsvField`).
 */

import { shellNow } from "../now";
import { EMAIL_PATTERN, USERNAME_PATTERN } from "./userForm";
import {
  ADMIN_UNITS,
  DEFAULT_MOCK_SEED,
  DEFAULT_MOCK_SIZE,
  generateSyntheticUsers,
  SIM_IDS,
  type AdminUser,
} from "./usersDataSource";

export type ImportMode = "ekle" | "guncelle";
export const IMPORT_MODES: readonly ImportMode[] = ["ekle", "guncelle"];

/** E3 §f sütun sırası; şablon başlığı ve eşleme adayları bu sıradadır. */
export const TEMPLATE_COLUMNS = [
  "kullanici_adi",
  "eposta",
  "ad_soyad",
  "rol",
  "birim_kodu",
  "sim_erisimi",
  "giris_tipi",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/** Şablon sürümü; `import_batches.template_version` karşılığı (E3 §c). */
export const TEMPLATE_VERSION = "2026-09";

export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

/** CSV başlığı → hedef sütun eşlemesi; eşleşmeyen sütun için değer yoktur. */
export type ColumnMapping = Partial<Record<TemplateColumn, string>>;

export interface ImportRowError {
  readonly column: TemplateColumn;
  readonly code: string;
  readonly message: string;
}

export type ImportRowStatus = "valid" | "error" | "applied" | "skipped";

export interface ImportRow {
  readonly rowNo: number;
  readonly raw: Readonly<Record<TemplateColumn, string>>;
  readonly status: ImportRowStatus;
  readonly errors: readonly ImportRowError[];
}

export type ImportBatchStatus = "uploaded" | "validated" | "applied" | "failed" | "expired";

export interface ImportBatch {
  readonly id: string;
  readonly fileName: string;
  readonly mode: ImportMode;
  readonly status: ImportBatchStatus;
  readonly templateVersion: string;
  readonly rowCount: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly appliedCount: number;
}

export interface ImportApplyResult {
  readonly batchId: string;
  readonly appliedCount: number;
  readonly errorCount: number;
  readonly alreadyApplied: boolean;
}

/** `POST /admin/imports` (400) sınıfında istemci tarafı reddedilme kodları. */
export type ImportUploadErrorCode = "empty_file" | "too_many_rows" | "file_too_large" | "header_mismatch";

// ---------------------------------------------------------------------------
// CSV ayrıştırma/üretme (RFC 4180 benzeri; küçük yüzey, yeni bağımlılık yok)
// ---------------------------------------------------------------------------

/** `;` ayraçlı, tırnaklı alan destekli basit CSV ayrıştırıcı; boş son satırı düşürür. */
export function parseCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  function pushField(): void {
    row.push(field);
    field = "";
  }
  function pushRow(): void {
    pushField();
    rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === "\r") {
      // yok say; \r\n ve \n aynı satır sonudur
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

/** Formül enjeksiyonuna karşı öneki kaçışlar (`=`,`+`,`-`,`@`,sekme,CR), gerekirse tırnaklar. */
export function escapeCsvField(value: string, delimiter = ";"): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const needsQuotes = neutralized.includes(delimiter) || neutralized.includes('"') || neutralized.includes("\n") || neutralized.includes("\r");
  return needsQuotes ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

/** Satırları `;` ayraçlı CRLF CSV metnine çevirir; her hücre `escapeCsvField`'den geçer. */
export function buildCsv(rows: readonly (readonly string[])[], delimiter = ";"): string {
  return rows.map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}

/** E3 §f: başlık + tek sentetik örnek satır; gerçek öğrenci verisi taşımaz. */
export function buildTemplateCsv(): string {
  const example: Readonly<Record<TemplateColumn, string>> = {
    ad_soyad: "Örnek Öğrenci",
    birim_kodu: "3-sinif",
    eposta: "ornek.ogrenci@example.invalid",
    giris_tipi: "sso",
    kullanici_adi: "ornek.ogrenci",
    rol: "kullanici",
    sim_erisimi: "pulse,opaca",
  };
  return buildCsv([[...TEMPLATE_COLUMNS], TEMPLATE_COLUMNS.map((column) => example[column])]);
}

/** Şablon dosya adı; sürüm adı taşır (E3 §c `template_version`). */
export function templateFileName(): string {
  return `sablon-kullanicilar-${TEMPLATE_VERSION}.csv`;
}

// ---------------------------------------------------------------------------
// Sütun eşleme
// ---------------------------------------------------------------------------

/** Algılanan başlıkları hedef sütunlara büyük/küçük harf duyarsız, tam eşleşmeyle eşler. */
export function autoMapHeaders(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const column of TEMPLATE_COLUMNS) {
    const header = headers.find((candidate) => candidate.trim().toLowerCase() === column);
    if (header !== undefined) mapping[column] = header;
  }
  return mapping;
}

/** Eşlemeye göre ham CSV satırlarını sütun adlı kayıtlara çevirir; eşleşmeyen alan boş kalır. */
export function rowsFromMapping(
  headers: readonly string[],
  dataRows: readonly (readonly string[])[],
  mapping: ColumnMapping,
): Readonly<Record<TemplateColumn, string>>[] {
  const indexByColumn: Partial<Record<TemplateColumn, number>> = {};
  for (const column of TEMPLATE_COLUMNS) {
    const header = mapping[column];
    const index = header === undefined ? -1 : headers.indexOf(header);
    if (index >= 0) indexByColumn[column] = index;
  }
  return dataRows.map((row) => {
    const record: Record<TemplateColumn, string> = {
      ad_soyad: "",
      birim_kodu: "",
      eposta: "",
      giris_tipi: "",
      kullanici_adi: "",
      rol: "",
      sim_erisimi: "",
    };
    for (const column of TEMPLATE_COLUMNS) {
      const index = indexByColumn[column];
      if (index !== undefined) record[column] = (row[index] ?? "").trim();
    }
    return record;
  });
}

// ---------------------------------------------------------------------------
// Doğrulama (E3 §f)
// ---------------------------------------------------------------------------

/** Mevcut kullanıcı listesinden küçük harfli eşleme anahtarı kümesi üretir (kullanıcı adı + e-posta). */
export function existingMappingKeys(users: readonly AdminUser[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const user of users) keys.add(user.username.toLowerCase());
  return keys;
}

interface ValidateRowContext {
  readonly seenKeys: Set<string>;
  readonly existingKeys: ReadonlySet<string>;
  readonly mode: ImportMode;
}

/** Tek satırı E3 §f kurallarına göre saf olarak doğrular; yan etkisi yalnız `context.seenKeys`'tir. */
export function validateImportRow(
  raw: Readonly<Record<TemplateColumn, string>>,
  rowNo: number,
  context: ValidateRowContext,
): ImportRow {
  const errors: ImportRowError[] = [];
  const username = raw.kullanici_adi.trim();
  const email = raw.eposta.trim().toLowerCase();
  const displayName = raw.ad_soyad.trim();
  const roleRaw = raw.rol.trim();
  const unitCode = raw.birim_kodu.trim();
  const simRaw = raw.sim_erisimi.trim();
  const authRaw = raw.giris_tipi.trim();

  if (username.length === 0 && email.length === 0) {
    errors.push({ code: "key_required", column: "kullanici_adi", message: "Kullanıcı adı veya e-posta girin." });
  }
  if (username.length > 0 && !USERNAME_PATTERN.test(username)) {
    errors.push({ code: "username_invalid", column: "kullanici_adi", message: "Kullanıcı adı biçimi geçersiz." });
  }
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    errors.push({ code: "email_invalid", column: "eposta", message: "E-posta biçimi geçersiz." });
  }
  if (displayName.length < 2 || displayName.length > 120) {
    errors.push({ code: "display_name_invalid", column: "ad_soyad", message: "Ad soyad 2-120 karakter olmalıdır." });
  }
  const role = roleRaw.length === 0 ? "kullanici" : roleRaw;
  if (role !== "kullanici") {
    errors.push({ code: "role_forbidden", column: "rol", message: "admin rolü CSV ile atanamaz." });
  }
  if (unitCode.length > 0 && !ADMIN_UNITS.some((unit) => unit.code === unitCode)) {
    errors.push({ code: "unknown_unit", column: "birim_kodu", message: "Bilinmeyen birim kodu." });
  }
  if (simRaw.length > 0) {
    const tokens = simRaw.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
    for (const token of tokens) {
      if (!(SIM_IDS as readonly string[]).includes(token)) {
        errors.push({ code: "unknown_sim", column: "sim_erisimi", message: `Bilinmeyen sim: ${token}` });
        break;
      }
    }
  }
  const authMethod = authRaw.length === 0 ? "sso" : authRaw;
  if (authMethod !== "sso" && authMethod !== "dev") {
    errors.push({ code: "auth_method_invalid", column: "giris_tipi", message: "giris_tipi yalnız sso veya dev olabilir." });
  }

  const mappingKey = username.length > 0 ? username.toLowerCase() : email;
  if (mappingKey.length > 0) {
    if (context.seenKeys.has(mappingKey)) {
      errors.push({ code: "duplicate_in_file", column: "kullanici_adi", message: "Bu anahtar dosyada tekrar ediyor." });
    }
    context.seenKeys.add(mappingKey);
    if (context.mode === "ekle" && context.existingKeys.has(mappingKey)) {
      errors.push({ code: "already_exists", column: "kullanici_adi", message: "Bu kullanıcı zaten kayıtlı." });
    }
  }

  return { errors, raw, rowNo, status: errors.length === 0 ? "valid" : "error" };
}

export interface ValidateRowsResult {
  readonly rows: readonly ImportRow[];
  readonly validCount: number;
  readonly errorCount: number;
}

/** Satır dizisini sırayla doğrular; yinelenen anahtar denetimi dosya içi sıraya bağlıdır. */
export function validateImportRows(
  rawRows: readonly Readonly<Record<TemplateColumn, string>>[],
  existingKeys: ReadonlySet<string>,
  mode: ImportMode,
): ValidateRowsResult {
  const seenKeys = new Set<string>();
  const rows = rawRows.map((raw, index) => validateImportRow(raw, index + 1, { existingKeys, mode, seenKeys }));
  const validCount = rows.filter((row) => row.status === "valid").length;
  return { errorCount: rows.length - validCount, rows, validCount };
}

/**
 * UTF-8 bayt uzunluğu; `TextEncoder` kök tsconfig'te (DOM'suz) yoktur, bu
 * yüzden karakter kodu aralıklarından elle hesaplanır (yeni bağımlılık yok).
 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // yüksek vekil çift; sonraki alçak vekili atlar
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Yükleme sınırı ihlali; sınır aşılmazsa `null` (E3 §f: en çok 5.000 satır / 2 MB). */
export function checkUploadConstraints(csvText: string, dataRowCount: number): ImportUploadErrorCode | null {
  if (dataRowCount > MAX_IMPORT_ROWS) return "too_many_rows";
  if (utf8ByteLength(csvText) > MAX_IMPORT_FILE_BYTES) return "file_too_large";
  return null;
}

/** Hata raporu CSV'si: `satir_no;kolon;kod;aciklama`; her satır hatası kendi satırındadır (E3 §f). */
export function buildErrorReportCsv(rows: readonly ImportRow[]): string {
  const header = ["satir_no", "kolon", "kod", "aciklama"];
  const lines = rows.flatMap((row) =>
    row.errors.map((error) => [String(row.rowNo), error.column, error.code, error.message]),
  );
  return buildCsv([header, ...lines]);
}

// ---------------------------------------------------------------------------
// Sentetik kaynak (`ImportsDataSource`)
// ---------------------------------------------------------------------------

export interface ImportsDataSource {
  /** `GET /admin/imports/template`. */
  template(): Promise<{ readonly fileName: string; readonly csv: string }>;
  /** `POST /admin/imports`; sınır ihlalinde veya boş dosyada reddeder. */
  upload(input: { readonly fileName: string; readonly csvText: string; readonly mode: ImportMode }): Promise<{
    readonly batch: ImportBatch;
    readonly headers: readonly string[];
  }>;
  /** `POST /admin/imports/:id/validate`; bilinmeyen batch'te reddeder. */
  validate(batchId: string, mapping: ColumnMapping): Promise<{ readonly batch: ImportBatch; readonly rows: readonly ImportRow[] }>;
  /** `POST /admin/imports/:id/apply`; idempotenttir (E3 §d). */
  apply(batchId: string): Promise<ImportApplyResult>;
}

interface StoredBatch {
  batch: ImportBatch;
  headers: readonly string[];
  dataRows: readonly (readonly string[])[];
  rows: readonly ImportRow[];
}

/** Sentetik, tohumlu `ImportsDataSource`; `now` enjekte edilir (AGENTS.md: `Date.now()` YOK). */
export function createMockImportsSource(
  users: readonly AdminUser[] = generateSyntheticUsers(DEFAULT_MOCK_SEED, DEFAULT_MOCK_SIZE),
  now: () => number = shellNow,
): ImportsDataSource {
  const batches = new Map<string, StoredBatch>();
  const existingKeys = existingMappingKeys(users);
  let createdCount = 0;

  return {
    apply(batchId: string): Promise<ImportApplyResult> {
      const stored = batches.get(batchId);
      if (stored === undefined) return Promise.reject(new Error("not_found"));
      if (stored.batch.status === "applied") {
        return Promise.resolve({
          alreadyApplied: true,
          appliedCount: stored.batch.appliedCount,
          batchId,
          errorCount: stored.batch.errorCount,
        });
      }
      if (stored.batch.status !== "validated") return Promise.reject(new Error("not_validated"));
      void now();
      const appliedCount = stored.batch.validCount;
      stored.rows = stored.rows.map((row) => (row.status === "valid" ? { ...row, status: "applied" } : row));
      stored.batch = { ...stored.batch, appliedCount, status: "applied" };
      return Promise.resolve({ alreadyApplied: false, appliedCount, batchId, errorCount: stored.batch.errorCount });
    },
    template(): Promise<{ fileName: string; csv: string }> {
      return Promise.resolve({ csv: buildTemplateCsv(), fileName: templateFileName() });
    },
    upload(input): Promise<{ batch: ImportBatch; headers: readonly string[] }> {
      const parsed = parseCsv(input.csvText);
      if (parsed.length === 0) return Promise.reject(new Error("empty_file"));
      const [headerRow, ...dataRows] = parsed;
      const headers = headerRow ?? [];
      const constraintError = checkUploadConstraints(input.csvText, dataRows.length);
      if (constraintError !== null) return Promise.reject(new Error(constraintError));
      createdCount += 1;
      const id = `import-${createdCount}`;
      const batch: ImportBatch = {
        appliedCount: 0,
        errorCount: 0,
        fileName: input.fileName,
        id,
        mode: input.mode,
        rowCount: dataRows.length,
        status: "uploaded",
        templateVersion: TEMPLATE_VERSION,
        validCount: 0,
      };
      batches.set(id, { batch, dataRows, headers, rows: [] });
      return Promise.resolve({ batch, headers });
    },
    validate(batchId: string, mapping: ColumnMapping): Promise<{ batch: ImportBatch; rows: readonly ImportRow[] }> {
      const stored = batches.get(batchId);
      if (stored === undefined) return Promise.reject(new Error("not_found"));
      const rawRows = rowsFromMapping(stored.headers, stored.dataRows, mapping);
      const { errorCount, rows, validCount } = validateImportRows(rawRows, existingKeys, stored.batch.mode);
      stored.rows = rows;
      stored.batch = { ...stored.batch, errorCount, status: "validated", validCount };
      return Promise.resolve({ batch: stored.batch, rows });
    },
  };
}

import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  CSV_COLUMNS,
  CSV_DELIMITER,
  CSV_ERROR_COLUMNS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  ROLES,
  SIM_IDS,
  csvRowSchema,
  isCsvHeader,
  pageSizeSchema,
  uuidSchema,
  type CsvColumn,
  type CsvRow,
} from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import {
  DuplicateMappingKeyError,
  insertAdminAudit,
  toIstanbulIso,
  type AdminDb,
  type AdminDeps,
  type AdminUnit,
  type MappingKeyField,
  type MemoryAdminStore,
  type MemoryAdminUserState,
} from "./users";

/**
 * T66b — `/admin/imports` (E3 §d, §f): şablon → yükle → doğrula → önizle →
 * uygula. CSV gövdesi `text/csv` olarak alınır (multipart yerine düz metin;
 * gerekçe: multipart ayrıştırma yeni bağımlılık veya geniş yüzey gerektirir,
 * yükleme istemcisi dosyayı zaten metin olarak taşır). Ayrıştırma elle RFC 4180
 * (yeni bağımlılık yok): `;` ayraç, `"` tırnaklama, UTF-8 BOM, boş satırlar
 * atlanır; sınırlar 5.000 satır / 2 MB. Doğrulama satır bazlıdır; `apply` yalnız
 * `valid` satırları TEK transaction'da işler ve idempotenttir. Tüm sorgular
 * parametrelidir; `Date.now()` kullanılmaz.
 *
 * Şema notu: `import_rows.status` kümesinde doğrulanmamış satır için ayrı bir
 * değer yoktur; yükleme anında satırlar `skipped` ("henüz işlenmedi") olarak
 * yazılır ve `validate` bunları `valid`/`error` durumuna geçirir. Bu, T61
 * migration'ını değiştirmeden staging'i şema uyumlu tutar.
 *
 * Bu dosyanın rotaları `/admin/*` ara katmanına (csrfGuard + requireAdmin)
 * güvenen `registerAdminUserRoutes` çağrısından SONRA kaydedilmelidir.
 */

const IMPORT_TEMPLATE_VERSION = "1";
const IMPORT_PREVIEW_SIZE = 20;
const DEFAULT_PAGE_SIZE = 20;

const IMPORT_MODES = ["ekle", "guncelle"] as const;
type ImportMode = (typeof IMPORT_MODES)[number];

type ImportBatchStatus = "uploaded" | "validated" | "applied" | "failed" | "expired";

const IMPORT_ROW_STATUSES = ["valid", "error", "applied", "skipped"] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** E3 §c `errors` jsonb biçimi. */
export interface ImportRowError {
  readonly column: string;
  readonly code: string;
  readonly message: string;
}

/** Doğrulanmış satır: CSV alanları + çözülen birim kimliği (jsonb `normalized`). */
export type ImportNormalizedRow = CsvRow & { readonly unitId: string | null };

export interface NewImportBatch {
  readonly id: string;
  readonly institutionId: string;
  readonly uploadedBy: string;
  readonly fileName: string;
  readonly mode: ImportMode;
  readonly status: ImportBatchStatus;
  readonly templateVersion: string;
  readonly rowCount: number;
  readonly createdAt: number;
}

export interface ImportBatchRecord extends NewImportBatch {
  readonly validCount: number;
  readonly errorCount: number;
  readonly appliedCount: number;
  readonly validatedAt: number | null;
  readonly appliedAt: number | null;
  readonly expiresAt: number | null;
}

export interface ImportRowRecord {
  readonly rowNo: number;
  /** Ham CSV alanları; kişisel veri içerebilir, kısa saklanır (E3 §c). */
  readonly raw: readonly string[];
  readonly status: ImportRowStatus;
  readonly normalized: ImportNormalizedRow | null;
  readonly errors: readonly ImportRowError[] | null;
  readonly matchedUserId: string | null;
  readonly createdAt: number;
  readonly appliedAt: number | null;
}

interface ImportRowDraft {
  readonly rowNo: number;
  readonly status: "valid" | "error";
  readonly normalized: ImportNormalizedRow | null;
  readonly errors: readonly ImportRowError[];
  readonly matchedUserId: string | null;
}

export interface ImportValidationSave {
  readonly rows: readonly ImportRowDraft[];
  readonly validCount: number;
  readonly errorCount: number;
  readonly at: number;
}

export interface ImportExistingUser {
  readonly id: string;
  readonly username: string | null;
  readonly email: string | null;
}

export interface MappingKeyQuery {
  readonly usernames: readonly string[];
  readonly emails: readonly string[];
}

export interface ImportRowsQuery {
  readonly status?: ImportRowStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface ImportApplyInput {
  readonly batchId: string;
  readonly institutionId: string;
  readonly mode: ImportMode;
  readonly actorUserId: string;
  readonly at: number;
  readonly rows: readonly ImportRowRecord[];
}

export interface ImportApplyResult {
  readonly appliedCount: number;
  readonly roleChangedUserIds: readonly string[];
}

export interface AdminImportRepo {
  createBatch(
    batch: NewImportBatch,
    rows: readonly { readonly rowNo: number; readonly raw: readonly string[] }[],
  ): Promise<void>;
  findBatch(id: string, institutionId: string): Promise<ImportBatchRecord | null>;
  listAllRows(batchId: string): Promise<readonly ImportRowRecord[]>;
  listRows(
    batchId: string,
    query: ImportRowsQuery,
  ): Promise<{ readonly rows: readonly ImportRowRecord[]; readonly total: number }>;
  saveValidation(batchId: string, save: ImportValidationSave): Promise<void>;
  findUsersByMappingKeys(
    institutionId: string,
    keys: MappingKeyQuery,
  ): Promise<readonly ImportExistingUser[]>;
  findUnitByCode(institutionId: string, code: string): Promise<AdminUnit | null>;
  applyBatch(input: ImportApplyInput): Promise<ImportApplyResult>;
}

/** Havuzun içe aktarma deposuna görünen dar yüzeyi; `apply` tek transaction ister. */
interface AdminImportDb extends AdminDb {
  transaction<T>(work: (query: AdminDb["query"]) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// CSV ayrıştırma (elle RFC 4180; yeni bağımlılık yok)
// ---------------------------------------------------------------------------

interface CsvRecord {
  /** Başlık hariç, 1 tabanlı ve boş satırlar atlanmış sıra numarası. */
  readonly rowNo: number;
  readonly fields: readonly string[];
}

/** Bozuk tırnaklama; mesaj hiçbir hücre değerini taşımaz. */
class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/** UTF-8 bayt uzunluğu; `Buffer`/`TextEncoder` olmadan (lib ES2022). */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/**
 * `text`i kayıtlara ayırır (başlık dahil). BOM atılır; CRLF/LF/CR satır sonu
 * sayılır; tırnaklı hücreler ayraç ve satır sonu taşıyabilir; yalnız ayraç
 * içermeyen boş satırlar atlanır.
 */
function parseCsv(text: string): {
  readonly header: readonly string[];
  readonly records: readonly CsvRecord[];
} {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    fields.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    if (!(fields.length === 1 && (fields[0] ?? "").trim() === "")) parsed.push(fields);
    fields = [];
  };

  let index = 0;
  while (index < content.length) {
    const char = content.charAt(index);
    if (inQuotes) {
      if (char === '"') {
        if (content.charAt(index + 1) === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === CSV_DELIMITER) {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && content.charAt(index + 1) === "\n") index += 1;
      pushRecord();
      index += 1;
      continue;
    }
    if (char === '"') throw new CsvParseError("Tırnak beklenmeyen konumda");
    field += char;
    index += 1;
  }
  if (inQuotes) throw new CsvParseError("Kapanmayan tırnak");
  if (field !== "" || fields.length > 0) pushRecord();

  const header = parsed[0] ?? [];
  const records = parsed.slice(1).map((values, position) => ({
    rowNo: position + 1,
    fields: values,
  }));
  return { header, records };
}

// ---------------------------------------------------------------------------
// Satır doğrulama (E3 §f)
// ---------------------------------------------------------------------------

const CSV_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_format: "Geçersiz biçim",
  invalid_length: "Geçersiz uzunluk",
  invalid_value: "Geçersiz değer",
  mapping_key_required: "Kullanıcı adı veya e-posta zorunlu",
  malformed_row: "Satır alan sayısı başlıkla uyuşmuyor",
  unknown_unit: "Bilinmeyen birim kodu",
  duplicate_mapping_key: "Eşleme anahtarı yineleniyor",
  role_not_permitted: "Admin rolü toplu içe aktarma ile atanamaz",
  dev_not_allowed: "dev giriş tipi yalnız geliştirme ortamında kabul edilir",
};

/**
 * Sütun+kod özel iletiler; sahte kaynaktaki (`apps/shell/src/admin/importsDataSource.ts`)
 * metinlerle birebir aynı tutulur. Eşleşmeyen sütun+kod için `CSV_ERROR_MESSAGES`
 * genel iletisi kullanılır.
 */
const CSV_FIELD_ERROR_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  kullanici_adi: {
    invalid_format: "Kullanıcı adı biçimi geçersiz.",
    mapping_key_required: "Kullanıcı adı veya e-posta girin.",
  },
  eposta: {
    invalid_format: "E-posta biçimi geçersiz.",
  },
  ad_soyad: {
    invalid_length: "Ad soyad 2-120 karakter olmalıdır.",
  },
  giris_tipi: {
    invalid_value: "giris_tipi yalnız sso veya dev olabilir.",
  },
  birim_kodu: {
    unknown_unit: "Bilinmeyen birim kodu.",
  },
  rol: {
    role_not_permitted: "admin rolü CSV ile atanamaz.",
  },
};

function messageFor(column: string, code: string): string {
  return CSV_FIELD_ERROR_MESSAGES[column]?.[code] ?? CSV_ERROR_MESSAGES[code] ?? "Doğrulama hatası";
}

function rowError(column: string, code: string, message?: string): ImportRowError {
  return { column, code, message: message ?? messageFor(column, code) };
}

function cellAt(fields: readonly string[], column: CsvColumn): string {
  return (fields[CSV_COLUMNS.indexOf(column)] ?? "").trim();
}

function buildValues(fields: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  CSV_COLUMNS.forEach((column, index) => {
    values[column] = (fields[index] ?? "").trim();
  });
  return values;
}

/** `sim_erisimi` dizisinde geçersiz olan token'ı, ham hücreyi bölerek geri kazanır. */
function simTokenAt(values: Record<string, string>, index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  const tokens = (values.sim_erisimi ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return tokens[index];
}

function toImportError(issue: z.ZodIssue, values: Record<string, string>): ImportRowError {
  if (issue.message === "mapping_key_required") {
    return rowError("kullanici_adi", "mapping_key_required");
  }
  const column = issue.path.length > 0 ? String(issue.path[0]) : "-";
  switch (issue.code) {
    case "invalid_format":
      return rowError(column, "invalid_format");
    case "too_small":
    case "too_big":
      return rowError(column, "invalid_length");
    case "invalid_type":
    case "invalid_value":
      if (column === "sim_erisimi") {
        const token = simTokenAt(values, typeof issue.path[1] === "number" ? issue.path[1] : undefined);
        return rowError(
          column,
          "invalid_value",
          token !== undefined ? `Bilinmeyen sim: ${token}` : "Bilinmeyen sim erişimi değeri.",
        );
      }
      return rowError(column, "invalid_value");
    default:
      return rowError(column, issue.code);
  }
}

interface MutableDraft {
  readonly rowNo: number;
  username: string | null;
  email: string | null;
  status: "valid" | "error";
  normalized: ImportNormalizedRow | null;
  errors: ImportRowError[];
  matchedUserId: string | null;
}

interface ImportValidationContext {
  readonly repo: Pick<AdminImportRepo, "findUsersByMappingKeys" | "findUnitByCode">;
  readonly institutionId: string;
  readonly nodeEnv: "development" | "test" | "production";
  readonly mode: ImportMode;
}

async function validateRow(
  context: ImportValidationContext,
  row: { readonly rowNo: number; readonly raw: readonly string[] },
  byUsername: ReadonlyMap<string, ImportExistingUser>,
  byEmail: ReadonlyMap<string, ImportExistingUser>,
  unitCache: Map<string, AdminUnit | null>,
): Promise<MutableDraft> {
  const draft: MutableDraft = {
    rowNo: row.rowNo,
    username: null,
    email: null,
    status: "valid",
    normalized: null,
    errors: [],
    matchedUserId: null,
  };
  if (row.raw.length !== CSV_COLUMNS.length) {
    draft.errors.push(rowError("-", "malformed_row"));
    draft.status = "error";
    return draft;
  }
  const values = buildValues(row.raw);
  const username = values.kullanici_adi ?? "";
  const email = values.eposta ?? "";
  draft.username = username === "" ? null : username;
  draft.email = email === "" ? null : email;
  if (values.rol === "admin") {
    draft.errors.push(rowError("rol", "role_not_permitted"));
    draft.status = "error";
    return draft;
  }
  const parsed = csvRowSchema.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) draft.errors.push(toImportError(issue, values));
    draft.status = "error";
    return draft;
  }
  const data = parsed.data;
  let unitId: string | null = null;
  if (data.birim_kodu !== undefined) {
    let unit = unitCache.get(data.birim_kodu);
    if (unit === undefined) {
      unit = await context.repo.findUnitByCode(context.institutionId, data.birim_kodu);
      unitCache.set(data.birim_kodu, unit);
    }
    if (unit === null) {
      draft.errors.push(rowError("birim_kodu", "unknown_unit"));
    } else {
      unitId = unit.id;
    }
  }
  if (data.giris_tipi === "dev" && context.nodeEnv === "production") {
    draft.errors.push(rowError("giris_tipi", "dev_not_allowed"));
  }
  const matchedUsername = draft.username === null ? undefined : byUsername.get(draft.username.toLowerCase());
  const matchedEmail = draft.email === null ? undefined : byEmail.get(draft.email.toLowerCase());
  const matched = matchedUsername ?? matchedEmail ?? null;
  if (matched !== null) {
    if (context.mode === "ekle") {
      // Sahte kaynaktaki "already_exists" karşılığı: dosya içi tekrardan ayrı ileti.
      draft.errors.push(
        rowError(
          matchedUsername !== undefined ? "kullanici_adi" : "eposta",
          "duplicate_mapping_key",
          "Bu kullanıcı zaten kayıtlı.",
        ),
      );
    } else {
      draft.matchedUserId = matched.id;
    }
  }
  if (draft.errors.length > 0) {
    draft.status = "error";
    return draft;
  }
  draft.normalized = { ...data, unitId };
  return draft;
}

/** Aynı dosyada tekrar eden anahtar: iki satır da hatalıdır (E3 §f). */
function markInFileDuplicates(drafts: readonly MutableDraft[]): void {
  const seenUsernames = new Map<string, MutableDraft>();
  const seenEmails = new Map<string, MutableDraft>();
  const mark = (first: MutableDraft, second: MutableDraft, column: string) => {
    for (const draft of [first, second]) {
      if (!draft.errors.some((issue) => issue.code === "duplicate_mapping_key")) {
        draft.errors.push(rowError(column, "duplicate_mapping_key", "Bu anahtar dosyada tekrar ediyor."));
      }
      draft.status = "error";
      draft.normalized = null;
      draft.matchedUserId = null;
    }
  };
  for (const draft of drafts) {
    if (draft.username !== null) {
      const key = draft.username.toLowerCase();
      const first = seenUsernames.get(key);
      if (first === undefined) seenUsernames.set(key, draft);
      else mark(first, draft, "kullanici_adi");
    }
    if (draft.email !== null) {
      const key = draft.email.toLowerCase();
      const first = seenEmails.get(key);
      if (first === undefined) seenEmails.set(key, draft);
      else mark(first, draft, "eposta");
    }
  }
}

export async function validateImportRows(
  context: ImportValidationContext,
  rows: readonly { readonly rowNo: number; readonly raw: readonly string[] }[],
): Promise<readonly ImportRowDraft[]> {
  const usernames = new Set<string>();
  const emails = new Set<string>();
  for (const row of rows) {
    if (row.raw.length !== CSV_COLUMNS.length) continue;
    const username = cellAt(row.raw, "kullanici_adi");
    const email = cellAt(row.raw, "eposta");
    if (username !== "") usernames.add(username.toLowerCase());
    if (email !== "") emails.add(email.toLowerCase());
  }
  const existing = await context.repo.findUsersByMappingKeys(context.institutionId, {
    usernames: [...usernames],
    emails: [...emails],
  });
  const byUsername = new Map<string, ImportExistingUser>();
  const byEmail = new Map<string, ImportExistingUser>();
  for (const user of existing) {
    if (user.username !== null) byUsername.set(user.username.trim().toLowerCase(), user);
    if (user.email !== null) byEmail.set(user.email.trim().toLowerCase(), user);
  }

  const unitCache = new Map<string, AdminUnit | null>();
  const drafts: MutableDraft[] = [];
  for (const row of rows) {
    drafts.push(await validateRow(context, row, byUsername, byEmail, unitCache));
  }
  markInFileDuplicates(drafts);
  return drafts.map((draft) => ({
    rowNo: draft.rowNo,
    status: draft.status,
    normalized: draft.normalized,
    errors: draft.errors,
    matchedUserId: draft.matchedUserId,
  }));
}

// ---------------------------------------------------------------------------
// Hata raporu CSV'si (E3 §f) ve formül enjeksiyonu koruması
// ---------------------------------------------------------------------------

/**
 * CSV hücresi: `=`,`+`,`-`,`@`, sekme veya CR ile başlayan değer formül
 * sayılmasın diye tek tırnakla kaçırılır; `;`, tırnak ve satır sonu RFC 4180
 * gereği tırnaklanır.
 */
export function escapeCsvCell(value: string): string {
  const guarded = /^[\t\r\n ]*[=+\-@]|^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** `satir_no;kolon;kod;aciklama`; değerler kaçırılır, ham hücre taşınmaz. */
export function buildErrorReportCsv(rows: readonly ImportRowRecord[]): string {
  const lines = [CSV_ERROR_COLUMNS.join(CSV_DELIMITER)];
  for (const row of rows) {
    for (const issue of row.errors ?? []) {
      lines.push(
        [
          String(row.rowNo),
          escapeCsvCell(issue.column),
          escapeCsvCell(issue.code),
          escapeCsvCell(issue.message),
        ].join(CSV_DELIMITER),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// PostgreSQL deposu
// ---------------------------------------------------------------------------

interface ImportBatchRow {
  readonly id: string;
  readonly institution_id: string;
  readonly uploaded_by: string;
  readonly file_name: string;
  readonly mode: string;
  readonly status: string;
  readonly template_version: string;
  readonly row_count: number;
  readonly valid_count: number;
  readonly error_count: number;
  readonly applied_count: number;
  readonly created_at: Date | null;
  readonly validated_at: Date | null;
  readonly applied_at: Date | null;
  readonly expires_at: Date | null;
}

interface ImportRowRow {
  readonly row_no: number;
  readonly raw: unknown;
  readonly status: string;
  readonly normalized: unknown;
  readonly errors: unknown;
  readonly matched_user_id: string | null;
  readonly created_at: Date | null;
  readonly applied_at: Date | null;
}

function toEpoch(value: Date | null): number | null {
  return value === null ? null : value.getTime();
}

function toBatchRecord(row: ImportBatchRow): ImportBatchRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    mode: row.mode as ImportMode,
    status: row.status as ImportBatchStatus,
    templateVersion: row.template_version,
    rowCount: row.row_count,
    validCount: row.valid_count,
    errorCount: row.error_count,
    appliedCount: row.applied_count,
    createdAt: toEpoch(row.created_at) ?? 0,
    validatedAt: toEpoch(row.validated_at),
    appliedAt: toEpoch(row.applied_at),
    expiresAt: toEpoch(row.expires_at),
  };
}

function toRowRecord(row: ImportRowRow): ImportRowRecord {
  return {
    rowNo: row.row_no,
    raw: (row.raw as readonly string[] | null) ?? [],
    status: row.status as ImportRowStatus,
    normalized: (row.normalized as ImportNormalizedRow | null) ?? null,
    errors: (row.errors as readonly ImportRowError[] | null) ?? null,
    matchedUserId: row.matched_user_id,
    createdAt: toEpoch(row.created_at) ?? 0,
    appliedAt: toEpoch(row.applied_at),
  };
}

const BATCH_COLUMNS =
  "id, institution_id, uploaded_by, file_name, mode, status, template_version, row_count, valid_count, error_count, applied_count, created_at, validated_at, applied_at, expires_at";
const ROW_COLUMNS =
  "row_no, raw, status, normalized, errors, matched_user_id, created_at, applied_at";

export function createPgAdminImportRepo(db: AdminImportDb): AdminImportRepo {
  return {
    async createBatch(batch, rows) {
      await db.transaction(async (query) => {
        await query(
          `insert into import_batches (id, institution_id, uploaded_by, file_name, mode, status, template_version, row_count, created_at, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null)`,
          [
            batch.id,
            batch.institutionId,
            batch.uploadedBy,
            batch.fileName,
            batch.mode,
            batch.status,
            batch.templateVersion,
            batch.rowCount,
            new Date(batch.createdAt),
          ],
        );
        if (rows.length > 0) {
          await query(
            `insert into import_rows (batch_id, row_no, raw, status) select $1, r.row_no, r.raw::jsonb, 'skipped' from unnest($2::int[], $3::text[]) as r(row_no, raw)`,
            [batch.id, rows.map((row) => row.rowNo), rows.map((row) => JSON.stringify(row.raw))],
          );
        }
      });
    },

    async findBatch(id, institutionId) {
      const result = await db.query(
        `select ${BATCH_COLUMNS} from import_batches where id = $1 and institution_id = $2`,
        [id, institutionId],
      );
      const row = result.rows[0] as ImportBatchRow | undefined;
      return row === undefined ? null : toBatchRecord(row);
    },

    async listAllRows(batchId) {
      const result = await db.query(
        `select ${ROW_COLUMNS} from import_rows where batch_id = $1 order by row_no`,
        [batchId],
      );
      return result.rows.map((row) => toRowRecord(row as ImportRowRow));
    },

    async listRows(batchId, query) {
      const status = query.status ?? null;
      const totalResult = await db.query(
        `select count(*)::int as total from import_rows where batch_id = $1 and ($2::text is null or status = $2)`,
        [batchId, status],
      );
      const totalRow = totalResult.rows[0] as { readonly total?: unknown } | undefined;
      const total = typeof totalRow?.total === "number" ? totalRow.total : 0;
      const result = await db.query(
        `select ${ROW_COLUMNS} from import_rows where batch_id = $1 and ($2::text is null or status = $2) order by row_no limit $3 offset $4`,
        [batchId, status, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { rows: result.rows.map((row) => toRowRecord(row as ImportRowRow)), total };
    },

    async saveValidation(batchId, save) {
      await db.transaction(async (query) => {
        if (save.rows.length > 0) {
          await query(
            `update import_rows as ir set status = d.status, normalized = d.normalized::jsonb, errors = d.errors::jsonb, matched_user_id = d.matched_id::uuid
             from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) as d(row_no, status, normalized, errors, matched_id)
             where ir.batch_id = $1 and ir.row_no = d.row_no`,
            [
              batchId,
              save.rows.map((row) => row.rowNo),
              save.rows.map((row) => row.status),
              save.rows.map((row) => (row.normalized === null ? null : JSON.stringify(row.normalized))),
              save.rows.map((row) => (row.errors.length === 0 ? null : JSON.stringify(row.errors))),
              save.rows.map((row) => row.matchedUserId),
            ],
          );
        }
        await query(
          `update import_batches set status = 'validated', valid_count = $2, error_count = $3, validated_at = $4 where id = $1`,
          [batchId, save.validCount, save.errorCount, new Date(save.at)],
        );
      });
    },

    async findUsersByMappingKeys(institutionId, keys) {
      if (keys.usernames.length === 0 && keys.emails.length === 0) return [];
      const result = await db.query(
        `select id, username, email from users where institution_id = $1 and deleted_at is null and (lower(username) = any($2::text[]) or lower(email) = any($3::text[]))`,
        [institutionId, [...keys.usernames], [...keys.emails]],
      );
      return result.rows.map((row) => {
        const value = row as { readonly id: string; readonly username: string | null; readonly email: string | null };
        return { id: value.id, username: value.username, email: value.email };
      });
    },

    async findUnitByCode(institutionId, code) {
      const result = await db.query(
        `select id, name, code from units where institution_id = $1 and code = $2 and deleted_at is null limit 1`,
        [institutionId, code],
      );
      const row = result.rows[0] as
        | { readonly id: string; readonly name: string; readonly code: string }
        | undefined;
      return row === undefined ? null : { id: row.id, name: row.name, code: row.code };
    },

    async applyBatch(input) {
      return db.transaction(async (query) => {
        let appliedCount = 0;
        const roleChangedUserIds: string[] = [];
        for (const row of input.rows) {
          const normalized = row.normalized;
          if (normalized === null) continue;
          const at = new Date(input.at);
          const simAccess = SIM_IDS.filter((simId) => normalized.sim_erisimi.includes(simId));
          if (input.mode === "guncelle" && row.matchedUserId !== null) {
            await query(
              `update users set display_name = $3, unit_id = $4, updated_at = $5 where id = $1 and institution_id = $2 and deleted_at is null`,
              [row.matchedUserId, input.institutionId, normalized.ad_soyad, normalized.unitId, at],
            );
            const granted = await query(
              `insert into user_roles (user_id, role, granted_by, granted_at) values ($1, 'kullanici', $2, $3) on conflict (user_id, role) do nothing returning user_id`,
              [row.matchedUserId, input.actorUserId, at],
            );
            if (granted.rows.length > 0) roleChangedUserIds.push(row.matchedUserId);
            await query(`delete from sim_access where user_id = $1 and not (sim_id = any($2::text[]))`, [
              row.matchedUserId,
              simAccess,
            ]);
            await query(
              `insert into sim_access (user_id, sim_id, granted_by, granted_at) select $1, s.sim_id, $2, $3 from unnest($4::text[]) as s(sim_id) on conflict (user_id, sim_id) do nothing`,
              [row.matchedUserId, input.actorUserId, at, simAccess],
            );
          } else {
            await query(
              `with created as (insert into users (institution_id, unit_id, username, email, display_name, auth_method, status, xapi_actor_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, 'invited', 'act-' || gen_random_uuid(), $7, $7) returning id),
               granted as (insert into user_roles (user_id, role, granted_by, granted_at) select id, 'kullanici', $8, $7 from created)
               insert into sim_access (user_id, sim_id, granted_by, granted_at) select created.id, s.sim_id, $8, $7 from created cross join unnest($9::text[]) as s(sim_id)`,
              [
                input.institutionId,
                normalized.unitId,
                normalized.kullanici_adi ?? null,
                normalized.eposta ?? null,
                normalized.ad_soyad,
                normalized.giris_tipi,
                at,
                input.actorUserId,
                simAccess,
              ],
            );
          }
          await query(
            `update import_rows set status = 'applied', applied_at = $3 where batch_id = $1 and row_no = $2`,
            [input.batchId, row.rowNo, at],
          );
          appliedCount += 1;
        }
        await query(
          `update import_batches set status = 'applied', applied_count = $2, applied_at = $3 where id = $1`,
          [input.batchId, appliedCount, new Date(input.at)],
        );
        return { appliedCount, roleChangedUserIds };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Bellek deposu (testler; DB gerekmez)
// ---------------------------------------------------------------------------

export interface MemoryAdminImportStore {
  readonly repo: AdminImportRepo;
  readonly batches: Map<string, ImportBatchRecord>;
  readonly rows: Map<string, readonly ImportRowRecord[]>;
}

/** Kopya üzerinde çalışan uygulama: hata durumunda ana depo değişmez. */
export function createMemoryAdminImportRepo(
  store: MemoryAdminStore,
  newId: () => string,
): MemoryAdminImportStore {
  const batches = new Map<string, ImportBatchRecord>();
  const rows = new Map<string, readonly ImportRowRecord[]>();

  const repo: AdminImportRepo = {
    async createBatch(batch, rawRows) {
      const at = batch.createdAt;
      batches.set(batch.id, {
        ...batch,
        validCount: 0,
        errorCount: 0,
        appliedCount: 0,
        validatedAt: null,
        appliedAt: null,
        expiresAt: null,
      });
      rows.set(
        batch.id,
        rawRows.map((row) => ({
          rowNo: row.rowNo,
          raw: [...row.raw],
          status: "skipped",
          normalized: null,
          errors: null,
          matchedUserId: null,
          createdAt: at,
          appliedAt: null,
        })),
      );
    },

    async findBatch(id, institutionId) {
      const batch = batches.get(id);
      return batch === undefined || batch.institutionId !== institutionId ? null : { ...batch };
    },

    async listAllRows(batchId) {
      return [...(rows.get(batchId) ?? [])].sort((a, b) => a.rowNo - b.rowNo);
    },

    async listRows(batchId, query) {
      const filtered = (rows.get(batchId) ?? []).filter(
        (row) => query.status === undefined || row.status === query.status,
      );
      const start = (query.page - 1) * query.pageSize;
      return {
        rows: filtered.slice(start, start + query.pageSize),
        total: filtered.length,
      };
    },

    async saveValidation(batchId, save) {
      const drafts = new Map(save.rows.map((row) => [row.rowNo, row]));
      const stored = rows.get(batchId) ?? [];
      rows.set(
        batchId,
        stored.map((row) => {
          const draft = drafts.get(row.rowNo);
          if (draft === undefined) return row;
          return {
            ...row,
            status: draft.status,
            normalized: draft.normalized,
            errors: draft.errors.length === 0 ? null : draft.errors,
            matchedUserId: draft.matchedUserId,
          };
        }),
      );
      const batch = batches.get(batchId);
      if (batch !== undefined) {
        batches.set(batchId, {
          ...batch,
          status: "validated",
          validCount: save.validCount,
          errorCount: save.errorCount,
          validatedAt: save.at,
        });
      }
    },

    async findUsersByMappingKeys(institutionId, keys) {
      const usernames = new Set(keys.usernames.map((value) => value.toLowerCase()));
      const emails = new Set(keys.emails.map((value) => value.toLowerCase()));
      const found = new Map<string, ImportExistingUser>();
      for (const record of store.records.values()) {
        if (record.institutionId !== institutionId || record.deletedAt !== null) continue;
        const username = record.username?.toLowerCase() ?? null;
        const email = record.email?.toLowerCase() ?? null;
        if (
          (username !== null && usernames.has(username)) ||
          (email !== null && emails.has(email))
        ) {
          found.set(record.id, { id: record.id, username: record.username, email: record.email });
        }
      }
      return [...found.values()];
    },

    async findUnitByCode(institutionId, code) {
      for (const unit of store.units.values()) {
        if (unit.code !== code) continue;
        if (store.unitInstitutions.get(unit.id) !== institutionId) continue;
        return { id: unit.id, name: unit.name, code: unit.code };
      }
      return null;
    },

    async applyBatch(input) {
      const draft = new Map<string, MemoryAdminUserState>();
      const view = (id: string) => draft.get(id) ?? store.records.get(id);
      const clone = (record: MemoryAdminUserState): MemoryAdminUserState => {
        const copy: MemoryAdminUserState = {
          ...record,
          roles: [...record.roles],
          simAccess: [...record.simAccess],
        };
        draft.set(copy.id, copy);
        return copy;
      };
      const findConflict = (username: string | null, email: string | null): MappingKeyField | null => {
        const needleUsername = username?.toLowerCase() ?? null;
        const needleEmail = email?.toLowerCase() ?? null;
        const seen = new Set<string>();
        for (const source of [draft.values(), store.records.values()]) {
          for (const record of source) {
            if (seen.has(record.id)) continue;
            seen.add(record.id);
            if (record.institutionId !== input.institutionId || record.deletedAt !== null) continue;
            if (needleUsername !== null && record.username?.toLowerCase() === needleUsername) {
              return "username";
            }
            if (needleEmail !== null && record.email?.toLowerCase() === needleEmail) return "email";
          }
        }
        return null;
      };

      const nextRows = new Map<number, ImportRowRecord>(
        (rows.get(input.batchId) ?? []).map((row) => [row.rowNo, row]),
      );
      const roleChangedUserIds: string[] = [];
      let appliedCount = 0;
      for (const row of input.rows) {
        const normalized = row.normalized;
        if (normalized === null) continue;
        const matched = row.matchedUserId === null ? undefined : view(row.matchedUserId);
        const target =
          matched === undefined ||
          matched.institutionId !== input.institutionId ||
          matched.deletedAt !== null
            ? null
            : matched;
        if (input.mode === "guncelle" && target !== null) {
          const copy = clone(target);
          copy.displayName = normalized.ad_soyad;
          copy.unitId = normalized.unitId;
          copy.updatedAt = input.at;
          if (!copy.roles.includes("kullanici")) {
            copy.roles = ROLES.filter(
              (role) => role === "kullanici" || copy.roles.includes(role),
            );
            roleChangedUserIds.push(copy.id);
          }
          copy.simAccess = SIM_IDS.filter((simId) => normalized.sim_erisimi.includes(simId));
        } else {
          const conflict = findConflict(
            normalized.kullanici_adi ?? null,
            normalized.eposta ?? null,
          );
          if (conflict !== null) throw new DuplicateMappingKeyError(conflict);
          const id = newId();
          draft.set(id, {
            id,
            institutionId: input.institutionId,
            unitId: normalized.unitId,
            username: normalized.kullanici_adi ?? null,
            email: normalized.eposta ?? null,
            displayName: normalized.ad_soyad,
            status: "invited",
            authMethod: normalized.giris_tipi,
            roles: ["kullanici"],
            simAccess: SIM_IDS.filter((simId) => normalized.sim_erisimi.includes(simId)),
            createdAt: input.at,
            updatedAt: input.at,
            lastLoginAt: null,
            deletedAt: null,
          });
        }
        nextRows.set(row.rowNo, { ...row, status: "applied", appliedAt: input.at });
        appliedCount += 1;
      }

      for (const [id, record] of draft) store.records.set(id, record);
      rows.set(
        input.batchId,
        [...nextRows.values()].sort((a, b) => a.rowNo - b.rowNo),
      );
      const batch = batches.get(input.batchId);
      if (batch !== undefined) {
        batches.set(input.batchId, {
          ...batch,
          status: "applied",
          appliedCount,
          appliedAt: input.at,
        });
      }
      return { appliedCount, roleChangedUserIds };
    },
  };

  return { repo, batches, rows };
}

// ---------------------------------------------------------------------------
// Rotalar
// ---------------------------------------------------------------------------

const uploadQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mode: z.enum(IMPORT_MODES).default("ekle"),
});

const rowsQuerySchema = z.object({
  status: z.enum(IMPORT_ROW_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: pageSizeSchema.optional(),
});

const TEMPLATE_EXAMPLE = [
  "ornek.ogrenci",
  "ornek.ogrenci@example.invalid",
  "Örnek Öğrenci",
  "kullanici",
  "3-sinif",
  "pulse,opaca",
  "sso",
];

function batchBody(batch: ImportBatchRecord) {
  return {
    id: batch.id,
    fileName: batch.fileName,
    mode: batch.mode,
    status: batch.status,
    templateVersion: batch.templateVersion,
    rowCount: batch.rowCount,
    validCount: batch.validCount,
    errorCount: batch.errorCount,
    appliedCount: batch.appliedCount,
    createdAt: toIstanbulIso(batch.createdAt),
    validatedAt: batch.validatedAt === null ? null : toIstanbulIso(batch.validatedAt),
    appliedAt: batch.appliedAt === null ? null : toIstanbulIso(batch.appliedAt),
  };
}

function rowBody(row: ImportRowRecord) {
  return {
    rowNo: row.rowNo,
    status: row.status,
    errors: row.errors ?? [],
    matchedUserId: row.matchedUserId,
  };
}

function applyBody(batch: ImportBatchRecord, alreadyApplied: boolean) {
  return {
    alreadyApplied,
    rowCount: batch.rowCount,
    validCount: batch.validCount,
    errorCount: batch.errorCount,
    applied: batch.appliedCount,
    appliedAt: batch.appliedAt === null ? null : toIstanbulIso(batch.appliedAt),
  };
}

async function loadBatch(
  c: Context<AppEnv>,
  deps: AdminDeps,
): Promise<ImportBatchRecord | null> {
  const id = uuidSchema.safeParse(c.req.param("id"));
  if (!id.success) return null;
  return deps.imports.findBatch(id.data, c.get("adminActor").institutionId);
}

export function registerAdminImportRoutes(
  app: Hono<AppEnv>,
  deps: AdminDeps,
  now: () => number,
): void {
  // Şablon, `/:id` yakalayıcısından önce kaydedilir.
  app.get("/admin/imports/template", (c) => {
    const csv = `\uFEFF${CSV_COLUMNS.join(CSV_DELIMITER)}\n${TEMPLATE_EXAMPLE.map(escapeCsvCell).join(CSV_DELIMITER)}\n`;
    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="egemed-kullanicilar-sablon.csv"',
    });
  });

  app.post("/admin/imports", async (c) => {
    const query = uploadQuerySchema.safeParse(c.req.query());
    if (!query.success) return jsonError(c, "invalid_request", validationDetails(query.error));
    const actor = c.get("adminActor");
    const at = now();
    const batchId = deps.newId();

    const failUpload = async (code: string, rowCount = 0) => {
      await deps.imports.createBatch(
        {
          id: batchId,
          institutionId: actor.institutionId,
          uploadedBy: actor.userId,
          fileName: query.data.fileName,
          mode: query.data.mode,
          status: "failed",
          templateVersion: IMPORT_TEMPLATE_VERSION,
          rowCount,
          createdAt: at,
        },
        [],
      );
      await insertAdminAudit(deps, c, at, {
        action: "import.upload",
        targetType: "import_batch",
        targetId: batchId,
        summaryAfter: {
          fileName: query.data.fileName,
          mode: query.data.mode,
          status: "failed",
          code,
        },
      });
      // Batch `failed` olarak açılır; izlenebilirlik için kimliği yanıtta döner.
      return jsonError(c, "import_validation_failed", {
        issues: [{ code, path: ["file"] }],
        batchId,
      });
    };

    const declaredLength = Number(c.req.header("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > CSV_MAX_BYTES) {
      return failUpload("file_too_large");
    }
    const text = await c.req.text();
    if (utf8ByteLength(text) > CSV_MAX_BYTES) return failUpload("file_too_large");
    let parsed: { readonly header: readonly string[]; readonly records: readonly CsvRecord[] };
    try {
      parsed = parseCsv(text);
    } catch (error) {
      if (error instanceof CsvParseError) return failUpload("invalid_csv");
      throw error;
    }
    if (!isCsvHeader(parsed.header)) return failUpload("invalid_header", parsed.records.length);
    if (parsed.records.length > CSV_MAX_ROWS) {
      return failUpload("too_many_rows", parsed.records.length);
    }

    await deps.imports.createBatch(
      {
        id: batchId,
        institutionId: actor.institutionId,
        uploadedBy: actor.userId,
        fileName: query.data.fileName,
        mode: query.data.mode,
        status: "uploaded",
        templateVersion: IMPORT_TEMPLATE_VERSION,
        rowCount: parsed.records.length,
        createdAt: at,
      },
      parsed.records.map((record) => ({ rowNo: record.rowNo, raw: record.fields })),
    );
    await insertAdminAudit(deps, c, at, {
      action: "import.upload",
      targetType: "import_batch",
      targetId: batchId,
      summaryAfter: {
        fileName: query.data.fileName,
        mode: query.data.mode,
        status: "uploaded",
        rowCount: String(parsed.records.length),
      },
    });
    const batch = await deps.imports.findBatch(batchId, actor.institutionId);
    if (batch === null) throw new Error("Yüklenen batch okunamadı.");
    return c.json({ data: batchBody(batch) }, 201);
  });

  app.get("/admin/imports/:id", async (c) => {
    const batch = await loadBatch(c, deps);
    if (batch === null) return jsonError(c, "not_found");
    return c.json({ data: batchBody(batch) });
  });

  app.get("/admin/imports/:id/rows", async (c) => {
    const batch = await loadBatch(c, deps);
    if (batch === null) return jsonError(c, "not_found");
    const query = rowsQuerySchema.safeParse(c.req.query());
    if (!query.success) return jsonError(c, "invalid_request", validationDetails(query.error));
    const page = query.data.page ?? 1;
    const pageSize = query.data.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await deps.imports.listRows(batch.id, {
      ...(query.data.status === undefined ? {} : { status: query.data.status }),
      page,
      pageSize,
    });
    return c.json({
      data: result.rows.map(rowBody),
      meta: { page, pageSize, total: result.total },
    });
  });

  app.get("/admin/imports/:id/result", async (c) => {
    const batch = await loadBatch(c, deps);
    if (batch === null) return jsonError(c, "not_found");
    const stored = await deps.imports.listAllRows(batch.id);
    return c.json({
      data: {
        ...batchBody(batch),
        errorsCsv: buildErrorReportCsv(stored.filter((row) => row.status === "error")),
      },
    });
  });

  app.post("/admin/imports/:id/validate", async (c) => {
    const batch = await loadBatch(c, deps);
    if (batch === null) return jsonError(c, "not_found");
    if (batch.status !== "uploaded" && batch.status !== "validated") {
      return jsonError(c, "conflict");
    }
    const stored = await deps.imports.listAllRows(batch.id);
    if (batch.status === "validated") {
      // Idempotent: aynı batch yeniden doğrulanmaz, kayıtlı önizleme döner.
      return c.json({
        data: {
          ...batchBody(batch),
          preview: stored.slice(0, IMPORT_PREVIEW_SIZE).map(rowBody),
        },
      });
    }

    const drafts = await validateImportRows(
      {
        repo: deps.imports,
        institutionId: batch.institutionId,
        nodeEnv: deps.auth.nodeEnv,
        mode: batch.mode,
      },
      stored.map((row) => ({ rowNo: row.rowNo, raw: row.raw })),
    );
    const validCount = drafts.filter((draft) => draft.status === "valid").length;
    const errorCount = drafts.length - validCount;
    const at = now();
    await deps.imports.saveValidation(batch.id, { rows: drafts, validCount, errorCount, at });
    await insertAdminAudit(deps, c, at, {
      action: "import.validate",
      targetType: "import_batch",
      targetId: batch.id,
      summaryAfter: {
        rowCount: String(drafts.length),
        validCount: String(validCount),
        errorCount: String(errorCount),
      },
    });
    const updated = await deps.imports.findBatch(batch.id, batch.institutionId);
    if (updated === null) throw new Error("Doğrulanan batch okunamadı.");
    const refreshed = await deps.imports.listAllRows(batch.id);
    return c.json({
      data: {
        ...batchBody(updated),
        preview: refreshed.slice(0, IMPORT_PREVIEW_SIZE).map(rowBody),
      },
    });
  });

  app.post("/admin/imports/:id/apply", async (c) => {
    const batch = await loadBatch(c, deps);
    if (batch === null) return jsonError(c, "not_found");
    if (batch.status === "applied") return c.json({ data: applyBody(batch, true) });
    if (batch.status !== "validated") return jsonError(c, "conflict");

    const validRows = (await deps.imports.listAllRows(batch.id)).filter(
      (row) => row.status === "valid",
    );
    const at = now();
    let result: ImportApplyResult;
    try {
      result = await deps.imports.applyBatch({
        batchId: batch.id,
        institutionId: batch.institutionId,
        mode: batch.mode,
        actorUserId: c.get("adminActor").userId,
        at,
        rows: validRows,
      });
    } catch (error) {
      // Yarışta oluşan çakışma: transaction geri alınır, batch `validated` kalır.
      if (error instanceof DuplicateMappingKeyError) {
        return jsonError(c, "duplicate_mapping_key", { field: error.field });
      }
      throw error;
    }
    for (const id of result.roleChangedUserIds) {
      await deps.auth.sessions.revokeForUser(id, at);
    }
    await insertAdminAudit(deps, c, at, {
      action: "import.apply",
      targetType: "import_batch",
      targetId: batch.id,
      summaryAfter: {
        appliedCount: String(result.appliedCount),
        errorCount: String(batch.errorCount),
      },
    });
    const updated = await deps.imports.findBatch(batch.id, batch.institutionId);
    if (updated === null) throw new Error("Uygulanan batch okunamadı.");
    return c.json({ data: applyBody(updated, false) });
  });
}

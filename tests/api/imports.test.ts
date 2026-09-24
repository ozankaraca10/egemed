import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, CSV_MAX_ROWS } from "../../packages/contracts/src/index";
import {
  buildErrorReportCsv,
  escapeCsvCell,
  validateImportRows,
  type ImportRowRecord,
} from "../../apps/api/src/admin/imports";
import type { MemoryAdminUserState } from "../../apps/api/src/admin/users";
import {
  ALI_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  UNIT_CODE,
  UNIT_ID,
  auditActions,
  createAdminHarness,
  login,
  type AdminHarness,
  type Login,
} from "./admin-harness";

// T66b — E3 §d/§f `/admin/imports`: şablon, yükleme, doğrulama, satır hata
// raporu, idempotent apply ve atomik geri alma. CSV ayrıştırıcı elle RFC 4180;
// yeni bağımlılık yok. Bellek deposu; DB gerekmez.

const HEADER = "kullanici_adi;eposta;ad_soyad;rol;birim_kodu;sim_erisimi;giris_tipi";

function buildCsv(rows: readonly (readonly string[])[]): string {
  return `${[HEADER, ...rows.map((row) => row.join(";"))].join("\n")}\n`;
}

async function upload(harness: AdminHarness, admin: Login, body: string, query = "") {
  return harness.app.request(`/admin/imports${query}`, {
    method: "POST",
    headers: { ...admin.headers, "content-type": "text/csv; charset=utf-8" },
    body,
  });
}

async function validateBatch(harness: AdminHarness, admin: Login, id: string) {
  return harness.app.request(`/admin/imports/${id}/validate`, {
    method: "POST",
    headers: admin.headers,
  });
}

async function applyBatch(harness: AdminHarness, admin: Login, id: string) {
  return harness.app.request(`/admin/imports/${id}/apply`, {
    method: "POST",
    headers: admin.headers,
  });
}

async function uploadOk(
  harness: AdminHarness,
  admin: Login,
  body: string,
  query = "?fileName=ogrenciler.csv&mode=ekle",
): Promise<string> {
  const response = await upload(harness, admin, body, query);
  expect(response.status).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

interface JsonBody {
  readonly data: Record<string, unknown>;
  readonly meta?: Record<string, unknown>;
  readonly error?: { readonly code: string; readonly details?: Record<string, unknown> };
}

async function readJson(response: { json(): Promise<unknown> }): Promise<JsonBody> {
  return (await response.json()) as JsonBody;
}

function recordByUsername(harness: AdminHarness, username: string): MemoryAdminUserState | undefined {
  return [...harness.adminStore.records.values()].find((record) => record.username === username);
}

describe("GET /admin/imports/template (E3 §f)", () => {
  it("BOM'lu, başlık ve sentetik örnek satır taşıyan CSV indirir", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/imports/template", {
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    // `Response.text()` UTF-8 BOM'unu kendiliğinden atar; baytlara bakılır.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const second = await harness.app.request("/admin/imports/template", {
      headers: admin.headers,
    });
    const text = await second.text();
    expect(text).toContain(HEADER);
    expect(text).toContain("ornek.ogrenci;ornek.ogrenci@example.invalid;");
  });
});

describe("yükleme ve doğrulama (E3 §d, §f)", () => {
  it("yükler, doğrular, önizleme döner; ikinci doğrulama idempotenttir", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["yeni.bir", "yeni.bir@example.invalid", "Yeni Bir", "kullanici", UNIT_CODE, "pulse,opaca", "sso"],
      ["yeni.iki", "yeni.iki@example.invalid", "Yeni İki", "", "", "", ""],
    ]);
    const uploaded = await upload(harness, admin, csv, "?fileName=ogrenciler.csv&mode=ekle");
    expect(uploaded.status).toBe(201);
    const batch = (await readJson(uploaded)).data as Record<string, unknown>;
    expect(batch).toMatchObject({
      status: "uploaded",
      fileName: "ogrenciler.csv",
      mode: "ekle",
      rowCount: 2,
      validCount: 0,
      errorCount: 0,
    });
    expect(auditActions(harness)).toEqual(["import.upload"]);

    const validated = await validateBatch(harness, admin, batch.id as string);
    expect(validated.status).toBe(200);
    const validatedBody = (await readJson(validated)).data as Record<string, unknown>;
    expect(validatedBody).toMatchObject({
      status: "validated",
      rowCount: 2,
      validCount: 2,
      errorCount: 0,
    });
    expect(validatedBody.preview).toEqual([
      { rowNo: 1, status: "valid", errors: [], matchedUserId: null },
      { rowNo: 2, status: "valid", errors: [], matchedUserId: null },
    ]);
    expect(auditActions(harness)).toEqual(["import.upload", "import.validate"]);

    const again = await validateBatch(harness, admin, batch.id as string);
    expect(again.status).toBe(200);
    expect((await readJson(again)).data).toMatchObject({ validCount: 2 });
    expect(auditActions(harness)).toHaveLength(2);

    const detail = await harness.app.request(`/admin/imports/${batch.id}`, {
      headers: admin.headers,
    });
    expect((await readJson(detail)).data).toMatchObject({ status: "validated", validCount: 2 });
  });

  it("doğrulanmadan uygulanamaz: 409 conflict", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const id = await uploadOk(
      harness,
      admin,
      buildCsv([["yeni.bir", "", "Yeni Bir", "", "", "", ""]]),
    );
    const response = await applyBatch(harness, admin, id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } });
  });

  it("satır bazlı doğrulama hatalarını tek tek raporlar", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["tekrar.eden", "tekrar@example.invalid", "Birinci", "kullanici", "", "", ""],
      ["tekrar.eden", "ikinci@example.invalid", "İkinci", "kullanici", "", "", ""],
      ["ali.veli", "baska@example.invalid", "Var Olan", "kullanici", "", "", ""],
      ["kodlu.kisi", "kodlu@example.invalid", "Kodlu", "kullanici", "yok-birim", "", ""],
      ["rol.veren", "rol@example.invalid", "Rol Veren", "admin", "", "", ""],
      ["gecersiz.eposta", "gecersiz-eposta", "Geçersiz", "kullanici", "", "", ""],
      ["", "", "Kimliksiz", "kullanici", "", "", ""],
      ["fazla.alan", "fazla@example.invalid", "Fazla Alan", "kullanici", "", "", "", "ekstra"],
      ["bilinmeyen.rol", "bilinmeyen.rol@example.invalid", "Bilinmeyen", "denetci", "", "", ""],
    ]);
    const id = await uploadOk(harness, admin, csv);
    const validated = await validateBatch(harness, admin, id);
    expect(validated.status).toBe(200);
    const body = (await readJson(validated)).data as Record<string, unknown>;
    expect(body).toMatchObject({ validCount: 0, errorCount: 9, rowCount: 9 });

    const rowsResponse = await harness.app.request(
      `/admin/imports/${id}/rows?status=error&pageSize=100`,
      { headers: admin.headers },
    );
    expect(rowsResponse.status).toBe(200);
    const rowsBody = await readJson(rowsResponse);
    const rows = rowsBody.data as unknown as { rowNo: number; errors: { code: string }[] }[];
    expect(rowsBody.meta).toEqual({ page: 1, pageSize: 100, total: 9 });
    const codes = new Map(rows.map((row) => [row.rowNo, row.errors.map((issue) => issue.code)]));
    expect(codes.get(1)).toEqual(["duplicate_mapping_key"]);
    expect(codes.get(2)).toEqual(["duplicate_mapping_key"]);
    expect(codes.get(3)).toEqual(["duplicate_mapping_key"]);
    expect(codes.get(4)).toEqual(["unknown_unit"]);
    expect(codes.get(5)).toEqual(["role_not_permitted"]);
    expect(codes.get(6)).toEqual(["invalid_format"]);
    expect(codes.get(7)).toEqual(["mapping_key_required"]);
    expect(codes.get(8)).toEqual(["malformed_row"]);
    expect(codes.get(9)).toEqual(["invalid_value"]);
  });

  it("BOM ve tırnaklı alanları RFC 4180 ile çözer", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = `\uFEFF${buildCsv([['"ali.veli"', "ali.veli@example.invalid", '"Veli; Ali"', "", "", "", ""]])}`;
    const id = await uploadOk(harness, admin, csv, "?fileName=alinti.csv&mode=guncelle");
    const validated = await validateBatch(harness, admin, id);
    expect((await readJson(validated)).data).toMatchObject({ validCount: 1, errorCount: 0 });
    const applied = await applyBatch(harness, admin, id);
    expect(applied.status).toBe(200);
    expect(recordByUsername(harness, "ali.veli")?.displayName).toBe("Veli; Ali");
  });

  it("başlık eşleşmezse 422 invalid_header; failed batch açılır", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await upload(harness, admin, "ad;soyad\nAli;Veli\n", "?fileName=h.csv");
    expect(response.status).toBe(422);
    const body = await readJson(response);
    expect(body).toMatchObject({
      error: {
        code: "import_validation_failed",
        details: { issues: [{ code: "invalid_header" }] },
      },
    });
    const details = body.error?.details as { batchId?: string } | undefined;
    expect(harness.importStore.batches.get(details?.batchId ?? "")?.status).toBe("failed");
    expect(auditActions(harness)).toEqual(["import.upload"]);
  });

  it("bozuk tırnaklamayı 422 invalid_csv ile reddeder", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await upload(
      harness,
      admin,
      `${HEADER}\n"kapanmayan;x;y;z;q;w;e\n`,
      "?fileName=q.csv",
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "import_validation_failed",
        details: { issues: [{ code: "invalid_csv" }] },
      },
    });
  });

  it("2 MB gövde sınırını uygular", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const huge = `${HEADER}\n${"a".repeat(CSV_MAX_BYTES + 1)}`;
    const response = await upload(harness, admin, huge, "?fileName=buyuk.csv");
    expect(response.status).toBe(422);
    const body = await readJson(response);
    expect(body).toMatchObject({
      error: { code: "import_validation_failed", details: { issues: [{ code: "file_too_large" }] } },
    });
  });

  it("5.000 satır sınırını uygular", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, (_, index) => [
      `kisi.${index}`,
      `kisi.${index}@example.invalid`,
      `Kişi ${index}`,
      "",
      "",
      "",
      "",
    ]);
    const response = await upload(harness, admin, buildCsv(rows), "?fileName=cok-satir.csv");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "import_validation_failed",
        details: { issues: [{ code: "too_many_rows" }] },
      },
    });
  });

  it("production ortamında dev giriş tipini satır hatası sayar", async () => {
    const repo = {
      findUsersByMappingKeys: () => Promise.resolve([]),
      findUnitByCode: () => Promise.resolve(null),
    };
    const rows = [
      { rowNo: 1, raw: ["dev.kisi", "dev@example.invalid", "Dev Kişi", "kullanici", "", "", "dev"] },
    ];
    const production = await validateImportRows(
      { repo, institutionId: INSTITUTION_ID, nodeEnv: "production", mode: "ekle" },
      rows,
    );
    expect(production[0]?.status).toBe("error");
    expect(production[0]?.errors).toEqual([
      { column: "giris_tipi", code: "dev_not_allowed", message: expect.any(String) },
    ]);
    const development = await validateImportRows(
      { repo, institutionId: INSTITUTION_ID, nodeEnv: "development", mode: "ekle" },
      rows,
    );
    expect(development[0]?.status).toBe("valid");
  });
});

describe("apply (E3 §d, §f)", () => {
  it("ekle modunda kullanıcıları tek işlemde oluşturur; ikinci çağrı idempotenttir", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["yeni.bir", "yeni.bir@example.invalid", "Yeni Bir", "kullanici", UNIT_CODE, "pulse,opaca", "sso"],
      ["yeni.iki", "", "Yeni İki", "", "", "pulse", ""],
    ]);
    const id = await uploadOk(harness, admin, csv);
    await validateBatch(harness, admin, id);
    const before = harness.adminStore.records.size;

    const applied = await applyBatch(harness, admin, id);
    expect(applied.status).toBe(200);
    expect((await readJson(applied)).data).toMatchObject({
      alreadyApplied: false,
      rowCount: 2,
      validCount: 2,
      errorCount: 0,
      applied: 2,
    });
    expect(harness.adminStore.records.size).toBe(before + 2);
    expect(recordByUsername(harness, "yeni.bir")).toMatchObject({
      status: "invited",
      roles: ["kullanici"],
      unitId: UNIT_ID,
      simAccess: ["pulse", "opaca"],
      authMethod: "sso",
      createdAt: FIXED_NOW,
    });
    expect(recordByUsername(harness, "yeni.iki")).toMatchObject({
      unitId: null,
      simAccess: ["pulse"],
      authMethod: "sso",
      roles: ["kullanici"],
    });
    expect(harness.importStore.batches.get(id)?.status).toBe("applied");
    expect(harness.authStore.auditEntries.at(-1)).toMatchObject({
      action: "import.apply",
      targetType: "import_batch",
      targetId: id,
      summaryAfter: { appliedCount: "2", errorCount: "0" },
    });

    const again = await applyBatch(harness, admin, id);
    expect(again.status).toBe(200);
    expect((await readJson(again)).data).toMatchObject({ alreadyApplied: true, applied: 2 });
    expect(harness.adminStore.records.size).toBe(before + 2);
    expect(harness.authStore.auditEntries.filter((entry) => entry.action === "import.apply")).toHaveLength(
      1,
    );

    const afterApply = await validateBatch(harness, admin, id);
    expect(afterApply.status).toBe(409);
  });

  it("guncelle modunda mevcut kullanıcıyı günceller, olmayanı oluşturur", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["ali.veli", "ali.veli@example.invalid", "Ali Veli Güncel", "kullanici", "", "opaca", ""],
      ["yeni.uc", "yeni.uc@example.invalid", "Yeni Üç", "kullanici", UNIT_CODE, "ausculta", ""],
    ]);
    const id = await uploadOk(harness, admin, csv, "?fileName=guncel.csv&mode=guncelle");
    const validated = await validateBatch(harness, admin, id);
    const preview = (await readJson(validated)).data["preview"] as { matchedUserId: string | null }[];
    expect(preview[0]?.matchedUserId).toBe(ALI_ID);
    expect(preview[1]?.matchedUserId).toBeNull();

    const applied = await applyBatch(harness, admin, id);
    expect(applied.status).toBe(200);
    expect((await readJson(applied)).data).toMatchObject({ applied: 2 });
    expect(harness.adminStore.records.get(ALI_ID)).toMatchObject({
      displayName: "Ali Veli Güncel",
      unitId: null,
      simAccess: ["opaca"],
      roles: ["kullanici"],
      status: "active",
    });
    expect(recordByUsername(harness, "yeni.uc")).toMatchObject({
      unitId: UNIT_ID,
      simAccess: ["ausculta"],
      status: "invited",
    });
  });

  it("doğrulamadan sonra oluşan çakışmada geri alınır: 409, kısmi yazım yok", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["yaris.bir", "yaris.bir@example.invalid", "Yarış Bir", "", "", "", ""],
      ["yaris.iki", "yaris.iki@example.invalid", "Yarış İki", "", "", "", ""],
    ]);
    const id = await uploadOk(harness, admin, csv);
    await validateBatch(harness, admin, id);

    const racerId = "20000000-0000-4000-8000-000000000001";
    const racer: MemoryAdminUserState = {
      id: racerId,
      institutionId: INSTITUTION_ID,
      unitId: null,
      username: "yaris.iki",
      email: null,
      displayName: "Çakışan Kayıt",
      status: "active",
      authMethod: "sso",
      roles: ["kullanici"],
      simAccess: [],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      lastLoginAt: null,
      deletedAt: null,
    };
    harness.adminStore.records.set(racerId, racer);

    const applied = await applyBatch(harness, admin, id);
    expect(applied.status).toBe(409);
    expect(await applied.json()).toMatchObject({
      error: { code: "duplicate_mapping_key", details: { field: "username" } },
    });
    expect(recordByUsername(harness, "yaris.bir")).toBeUndefined();
    const batch = harness.importStore.batches.get(id);
    expect(batch?.status).toBe("validated");
    expect(batch?.appliedCount).toBe(0);
    expect(
      harness.authStore.auditEntries.filter((entry) => entry.action === "import.apply"),
    ).toEqual([]);
  });
});

describe("hata raporu CSV'si (E3 §f)", () => {
  it("satir_no;kolon;kod;aciklama başlığı taşır ve hatalı satırları listeler", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const csv = buildCsv([
      ["kodlu.kisi", "kodlu@example.invalid", "Kodlu", "", "yok-birim", "", ""],
      ["gecersiz.rol", "rol@example.invalid", "Rol", '"a;b"', "", "", ""],
    ]);
    const id = await uploadOk(harness, admin, csv);
    await validateBatch(harness, admin, id);
    const response = await harness.app.request(`/admin/imports/${id}/result`, {
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    const body = (await readJson(response)).data as Record<string, unknown>;
    expect(body).toMatchObject({ status: "validated", errorCount: 2 });
    const errorsCsv = body.errorsCsv as string;
    const lines = errorsCsv.trimEnd().split("\n");
    expect(lines[0]).toBe("satir_no;kolon;kod;aciklama");
    expect(lines[1]).toBe("1;birim_kodu;unknown_unit;Bilinmeyen birim kodu");
    // Hücre içindeki ayraç RFC 4180 gereği tırnaklanır.
    expect(lines[2]).toBe('2;rol;invalid_value;"Geçersiz değer: a;b"');
  });

  it("formül benzeri hücreleri kaçırır", () => {
    for (const value of ["=1+1", "+1", "-1", "@toplam", "\tx"]) {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    }
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell("düz metin")).toBe("düz metin");

    const row: ImportRowRecord = {
      rowNo: 3,
      raw: ["a", "b", "c", "d", "e", "f", "g"],
      status: "error",
      normalized: null,
      errors: [
        { column: "rol", code: "invalid_value", message: '=HYPERLINK("http://x")' },
      ],
      matchedUserId: null,
      createdAt: FIXED_NOW,
      appliedAt: null,
    };
    const report = buildErrorReportCsv([row]);
    expect(report.split("\n")[1]).toContain(`'=HYPERLINK`);
  });
});

describe("yetki (E3 §b)", () => {
  it("kullanici rolü içe aktarma uçlarına giremez: 403", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const response = await upload(harness, ali, buildCsv([["x.y", "", "X Y", "", "", "", ""]]), "?fileName=x.csv");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(auditActions(harness)).toEqual([]);
  });

  it("kapsam dışı batch 404 döner", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request(
      "/admin/imports/30000000-0000-4000-8000-000000000001",
      { headers: admin.headers },
    );
    expect(response.status).toBe(404);
  });
});

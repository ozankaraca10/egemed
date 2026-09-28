import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../../packages/ui/src/primitives/Dialog";
import { Select } from "../../packages/ui/src/primitives/Select";
import { ADMIN_IMPORT_PATH, adminImportHref, isAdminProtected, resolveRoute } from "../../apps/shell/src/routes";
import {
  autoMapHeaders,
  buildCsv,
  buildErrorReportCsv,
  buildTemplateCsv,
  checkUploadConstraints,
  createMockImportsSource,
  escapeCsvField,
  existingMappingKeys,
  parseCsv,
  rowsFromMapping,
  TEMPLATE_COLUMNS,
  templateFileName,
  validateImportRow,
  validateImportRows,
  type ImportRow,
  type TemplateColumn,
} from "../../apps/shell/src/admin/importsDataSource";
import { ImportWizardPage, ImportWizardView, type ImportWizardViewProps } from "../../apps/shell/src/admin/ImportWizardPage";
import type { AdminUser } from "../../apps/shell/src/admin/usersDataSource";
import { t } from "../../packages/ui/i18n/tr";

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

/** React eleman ağacını DOM'suz gezer (UsersPage.tsx test deseni, T156). `Field`
 *  çocuğunu render-prop olarak alır; sahte bir `control` ile çağrılıp içine girilir.
 *  `Dialog` (Radix Portal) ve `Select`in açılır listesi (Portal) DOM'suz ortamda
 *  boş çizildiğinden ilgili öğelerin prop'ları doğrudan ağaçtan okunur (T163). */
function collectElements(
  node: unknown,
  predicate: (element: ReactElement) => boolean,
  results: ReactElement[] = [],
): ReactElement[] {
  if (node === null || node === undefined || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, results);
    return results;
  }
  const element = node as ReactElement;
  if (element.type === undefined) return results;
  if (predicate(element)) results.push(element);
  const children = (element.props as { children?: unknown } | undefined)?.children;
  if (typeof children === "function") {
    collectElements((children as (control: unknown) => unknown)({}), predicate, results);
  } else if (children !== undefined) {
    collectElements(children, predicate, results);
  }
  return results;
}

interface DialogLikeProps {
  readonly title: unknown;
  readonly open: boolean;
  readonly footer?: unknown;
  readonly children?: unknown;
}

function dialogPropsOf(tree: ReactElement): DialogLikeProps {
  const [dialogElement] = collectElements(tree, (element) => element.type === Dialog);
  if (dialogElement === undefined) throw new Error("Dialog öğesi bulunamadı");
  return dialogElement.props as DialogLikeProps;
}

function noop(): void {
  // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
}

function emptyRaw(): Record<TemplateColumn, string> {
  return { ad_soyad: "", birim_kodu: "", eposta: "", giris_tipi: "", kullanici_adi: "", rol: "", sim_erisimi: "" };
}

const EXISTING_USER: AdminUser = {
  authMethod: "sso",
  createdAt: "2026-01-10T09:00:00.000+03:00",
  displayName: "Var Olan Kullanıcı",
  id: "user-existing",
  lastLoginAt: null,
  role: "kullanici",
  status: "active",
  unitId: "unit-1",
  username: "var.olan.kullanici",
};

describe("CSV ayrıştırma/üretme (RFC 4180 benzeri)", () => {
  it("parseCsv tırnaklı alanları, iç içe ayraçları ve satır sonlarını doğru çözer", () => {
    const text = 'a;"b;c";d\r\ne;"f""g";h\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b;c", "d"],
      ["e", 'f"g', "h"],
    ]);
  });

  it("boş metinde boş dizi, tek boş satırda da boş dizi döner", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n")).toEqual([]);
  });

  it("escapeCsvField formül enjeksiyonu önekini tek tırnakla etkisizleştirir", () => {
    expect(escapeCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvField("+1")).toBe("'+1");
    expect(escapeCsvField("-1")).toBe("'-1");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("normal")).toBe("normal");
  });

  it("escapeCsvField ayraç/tırnak/satır sonu içeren hücreleri tırnaklar", () => {
    expect(escapeCsvField("a;b")).toBe('"a;b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("buildCsv satırları ; ile birleştirir, CRLF ile sonlandırır ve formül önekini kaçışlar", () => {
    const csv = buildCsv([["ad", "deger"], ["x", "=1+1"]]);
    expect(csv).toBe('ad;deger\r\nx;\'=1+1\r\n');
  });

  it("buildTemplateCsv E3 §f sütun sırasını ve tek sentetik örnek satırı taşır", () => {
    const csv = buildTemplateCsv();
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...TEMPLATE_COLUMNS]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[0]).toBe("ornek.ogrenci");
    expect(csv).not.toContain("gerçek");
  });

  it("templateFileName sürüm bilgisi taşır", () => {
    expect(templateFileName()).toMatch(/^sablon-kullanicilar-.+\.csv$/);
  });
});

describe("sütun eşleme (autoMapHeaders / rowsFromMapping)", () => {
  it("başlıkları büyük/küçük harf duyarsız, tam eşleşmeyle eşler", () => {
    const headers = ["KULLANICI_ADI", "eposta", "Ad_Soyad", "rol", "birim_kodu", "sim_erisimi", "giris_tipi"];
    const mapping = autoMapHeaders(headers);
    expect(mapping.kullanici_adi).toBe("KULLANICI_ADI");
    expect(mapping.eposta).toBe("eposta");
    expect(mapping.ad_soyad).toBe("Ad_Soyad");
  });

  it("eşleşmeyen sütun mapping'te yer almaz", () => {
    const mapping = autoMapHeaders(["kullanici_adi", "bilinmeyen_sutun"]);
    expect(mapping.eposta).toBeUndefined();
    expect(mapping.kullanici_adi).toBe("kullanici_adi");
  });

  it("rowsFromMapping eşlemeye göre sütun adlı kayıtlar üretir; eşleşmeyen alan boştur", () => {
    const headers = ["ad", "kadi"];
    const dataRows = [["Örnek Ad", "ornek.kadi"]];
    const mapping = { ad_soyad: "ad", kullanici_adi: "kadi" };
    const [row] = rowsFromMapping(headers, dataRows, mapping);
    expect(row).toEqual({ ...emptyRaw(), ad_soyad: "Örnek Ad", kullanici_adi: "ornek.kadi" });
  });
});

describe("existingMappingKeys", () => {
  it("kullanıcı adlarını küçük harfle kümeye ekler", () => {
    const keys = existingMappingKeys([EXISTING_USER]);
    expect(keys.has("var.olan.kullanici")).toBe(true);
    expect(keys.has("bilinmeyen")).toBe(false);
  });
});

describe("validateImportRow (E3 §f satır kuralları)", () => {
  function context(mode: "ekle" | "guncelle" = "ekle") {
    return { existingKeys: new Set<string>(), mode, seenKeys: new Set<string>() };
  }

  it("hem kullanıcı adı hem e-posta boşsa key_required", () => {
    const row = validateImportRow({ ...emptyRaw(), ad_soyad: "Ad Soyad" }, 1, context());
    expect(row.status).toBe("error");
    expect(row.errors.map((e) => e.code)).toContain("key_required");
  });

  it("geçersiz kullanıcı adı deseni username_invalid döner", () => {
    const row = validateImportRow({ ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "AB" }, 1, context());
    expect(row.errors.map((e) => e.code)).toContain("username_invalid");
  });

  it("geçersiz e-posta email_invalid döner", () => {
    const row = validateImportRow({ ...emptyRaw(), ad_soyad: "Ad Soyad", eposta: "gecersiz" }, 1, context());
    expect(row.errors.map((e) => e.code)).toContain("email_invalid");
  });

  it("ad_soyad 2 karakterden azsa display_name_invalid döner", () => {
    const row = validateImportRow({ ...emptyRaw(), ad_soyad: "A", kullanici_adi: "gecerli.kullanici" }, 1, context());
    expect(row.errors.map((e) => e.code)).toContain("display_name_invalid");
  });

  it("rol 'admin' ise role_forbidden döner (CSV ile admin atanamaz)", () => {
    const row = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "gecerli.kullanici", rol: "admin" },
      1,
      context(),
    );
    expect(row.errors.map((e) => e.code)).toContain("role_forbidden");
  });

  it("rol 'ogretim_uyesi' hatasızdır (T184: kullanici veya ogretim_uyesi kabul edilir)", () => {
    const row = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "gecerli.ogretim.uyesi", rol: "ogretim_uyesi" },
      1,
      context(),
    );
    expect(row.errors.map((e) => e.code)).not.toContain("role_forbidden");
    expect(row.status).toBe("valid");
  });

  it("rol 'uzmanlik_ogrencisi' hatasızdır (T219: atanabilir roller genişledi)", () => {
    const row = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "gecerli.uzmanlik.ogrencisi", rol: "uzmanlik_ogrencisi" },
      1,
      context(),
    );
    expect(row.errors.map((e) => e.code)).not.toContain("role_forbidden");
    expect(row.status).toBe("valid");
  });

  it("bilinmeyen birim kodu unknown_unit döner; bilinen kod hatasızdır", () => {
    const unknown = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", birim_kodu: "yok-boyle-birim", kullanici_adi: "gecerli.kullanici" },
      1,
      context(),
    );
    expect(unknown.errors.map((e) => e.code)).toContain("unknown_unit");
    const known = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", birim_kodu: "3-sinif", kullanici_adi: "gecerli.kullanici" },
      1,
      context(),
    );
    expect(known.status).toBe("valid");
  });

  it("bilinmeyen sim erişimi unknown_sim döner", () => {
    const row = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "gecerli.kullanici", sim_erisimi: "pulse,bilinmeyen" },
      1,
      context(),
    );
    expect(row.errors.map((e) => e.code)).toContain("unknown_sim");
  });

  it("giris_tipi sso/dev dışındaysa auth_method_invalid döner", () => {
    const row = validateImportRow(
      { ...emptyRaw(), ad_soyad: "Ad Soyad", giris_tipi: "yanlis", kullanici_adi: "gecerli.kullanici" },
      1,
      context(),
    );
    expect(row.errors.map((e) => e.code)).toContain("auth_method_invalid");
  });

  it("dosya içinde tekrar eden anahtar iki satırda da duplicate_in_file döner", () => {
    const ctx = context();
    const raw = { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "tekrar.eden" };
    const first = validateImportRow(raw, 1, ctx);
    const second = validateImportRow(raw, 2, ctx);
    expect(first.status).toBe("valid");
    expect(second.errors.map((e) => e.code)).toContain("duplicate_in_file");
  });

  it("'ekle' modunda mevcut anahtar already_exists döner; 'guncelle' modunda hatasızdır", () => {
    const raw = { ...emptyRaw(), ad_soyad: "Ad Soyad", kullanici_adi: "var.olan.kullanici" };
    const existingKeys = new Set(["var.olan.kullanici"]);
    const inEkle = validateImportRow(raw, 1, { existingKeys, mode: "ekle", seenKeys: new Set() });
    expect(inEkle.errors.map((e) => e.code)).toContain("already_exists");
    const inGuncelle = validateImportRow(raw, 1, { existingKeys, mode: "guncelle", seenKeys: new Set() });
    expect(inGuncelle.status).toBe("valid");
  });

  it("tüm alanlar geçerliyse hata yoktur (status valid)", () => {
    const row = validateImportRow(
      {
        ad_soyad: "Örnek Öğrenci",
        birim_kodu: "1-sinif",
        eposta: "",
        giris_tipi: "sso",
        kullanici_adi: "ornek.ogrenci",
        rol: "kullanici",
        sim_erisimi: "pulse,opaca",
      },
      1,
      context(),
    );
    expect(row).toEqual({ errors: [], raw: row.raw, rowNo: 1, status: "valid" });
  });
});

describe("validateImportRows / checkUploadConstraints / buildErrorReportCsv", () => {
  it("validCount/errorCount toplamı satır sayısına eşittir", () => {
    const rows = [
      { ...emptyRaw(), ad_soyad: "Geçerli Satır", kullanici_adi: "gecerli.satir" },
      { ...emptyRaw(), ad_soyad: "A" },
    ];
    const result = validateImportRows(rows, new Set(), "ekle");
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.rows).toHaveLength(2);
  });

  it("checkUploadConstraints satır sayısı sınırını ve dosya boyutu sınırını uygular", () => {
    expect(checkUploadConstraints("kısa", 10)).toBeNull();
    expect(checkUploadConstraints("kısa", 5_001)).toBe("too_many_rows");
    expect(checkUploadConstraints("a".repeat(3 * 1024 * 1024), 1)).toBe("file_too_large");
  });

  it("buildErrorReportCsv her satır hatasını kendi satırında, sabit başlıkla üretir", () => {
    const rows: readonly ImportRow[] = [
      { errors: [{ code: "display_name_invalid", column: "ad_soyad", message: "Ad soyad 2-120 karakter olmalıdır." }], raw: emptyRaw(), rowNo: 3, status: "error" },
    ];
    const csv = buildErrorReportCsv(rows);
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual(["satir_no", "kolon", "kod", "aciklama"]);
    expect(parsed[1]).toEqual(["3", "ad_soyad", "display_name_invalid", "Ad soyad 2-120 karakter olmalıdır."]);
  });
});

describe("createMockImportsSource (T71 sentetik kaynak)", () => {
  const header = [...TEMPLATE_COLUMNS];
  const validRow = ["yeni.kullanici", "", "Yeni Öğrenci", "", "1-sinif", "pulse,opaca", "sso"];
  const duplicateRow = ["var.olan.kullanici", "", "Deneme Kullanıcı", "", "", "", ""];
  const csvText = [header.join(";"), validRow.join(";"), duplicateRow.join(";")].join("\n");

  it("template() sözleşmeye uygun dosya adı ve CSV döner", async () => {
    const source = createMockImportsSource([EXISTING_USER], () => 0);
    const { csv, fileName } = await source.template();
    expect(fileName).toMatch(/\.csv$/);
    expect(parseCsv(csv)[0]).toEqual(header);
  });

  it("upload → validate → apply tam akışı; ikinci apply idempotent döner (alreadyApplied)", async () => {
    const source = createMockImportsSource([EXISTING_USER], () => 0);
    const uploaded = await source.upload({ csvText, fileName: "kullanicilar.csv", mode: "ekle" });
    expect(uploaded.batch.status).toBe("uploaded");
    expect(uploaded.batch.rowCount).toBe(2);
    expect(uploaded.headers).toEqual(header);

    const mapping = autoMapHeaders(uploaded.headers);
    const validated = await source.validate(uploaded.batch.id, mapping);
    expect(validated.batch.status).toBe("validated");
    expect(validated.batch.validCount).toBe(1);
    expect(validated.batch.errorCount).toBe(1);
    expect(validated.rows.find((row) => row.status === "error")?.errors.map((e) => e.code)).toContain("already_exists");

    const applied = await source.apply(uploaded.batch.id);
    expect(applied).toEqual({ alreadyApplied: false, appliedCount: 1, batchId: uploaded.batch.id, errorCount: 1 });

    const again = await source.apply(uploaded.batch.id);
    expect(again).toEqual({ alreadyApplied: true, appliedCount: 1, batchId: uploaded.batch.id, errorCount: 1 });
  });

  it("apply, validate edilmemiş batch'te reddeder; bilinmeyen batch'te her uçta reddeder", async () => {
    const source = createMockImportsSource([EXISTING_USER], () => 0);
    const uploaded = await source.upload({ csvText, fileName: "kullanicilar.csv", mode: "ekle" });
    await expect(source.apply(uploaded.batch.id)).rejects.toThrow("not_validated");
    await expect(source.apply("yok")).rejects.toThrow("not_found");
    await expect(source.validate("yok", {})).rejects.toThrow("not_found");
  });

  it("boş dosya empty_file, aşırı satır too_many_rows ile reddedilir", async () => {
    const source = createMockImportsSource([EXISTING_USER], () => 0);
    await expect(source.upload({ csvText: "", fileName: "x.csv", mode: "ekle" })).rejects.toThrow("empty_file");
    const tooMany = [header.join(";"), ...Array.from({ length: 5_001 }, () => validRow.join(";"))].join("\n");
    await expect(source.upload({ csvText: tooMany, fileName: "x.csv", mode: "ekle" })).rejects.toThrow("too_many_rows");
  });

  it("Date.now hiçbir yerde kullanılmaz (now enjeksiyonuyla çalışır)", async () => {
    const spy = vi.spyOn(Date, "now");
    const source = createMockImportsSource([EXISTING_USER], () => 12345);
    const uploaded = await source.upload({ csvText, fileName: "kullanicilar.csv", mode: "guncelle" });
    await source.validate(uploaded.batch.id, autoMapHeaders(uploaded.headers));
    await source.apply(uploaded.batch.id);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("#/admin/ice-aktar rotası ve koruması (T71)", () => {
  it("yolu 'adminImport' olarak çözer; sondaki '/' ve sorgu yok sayılır", () => {
    for (const hash of [`#${ADMIN_IMPORT_PATH}`, `#${ADMIN_IMPORT_PATH}/`, `#${ADMIN_IMPORT_PATH}?x=1`]) {
      expect(resolveRoute(hash), hash).toEqual({ kind: "adminImport", titleKey: "admin.import.title" });
    }
  });

  it("adminImportHref kendi yoluna çözülür; admin korumasına dahildir", () => {
    expect(adminImportHref()).toBe(`#${ADMIN_IMPORT_PATH}`);
    expect(resolveRoute(adminImportHref())).toEqual({ kind: "adminImport", titleKey: "admin.import.title" });
    expect(isAdminProtected({ kind: "adminImport", titleKey: "admin.import.title" })).toBe(true);
  });
});

function baseViewProps(overrides: Partial<ImportWizardViewProps>): ImportWizardViewProps {
  return {
    applyConfirmOpen: false,
    applyResult: null,
    applyStatus: "idle",
    batch: null,
    csvText: "",
    fileNameInput: "kullanicilar.csv",
    headers: [],
    mapping: {},
    mode: "ekle",
    onBack: noop,
    onCancelApply: noop,
    onConfirmApply: noop,
    onCsvTextChange: noop,
    onDownloadErrors: noop,
    onDownloadTemplate: noop,
    onFileNameChange: noop,
    onMappingChange: noop,
    onModeChange: noop,
    onNext: noop,
    onRequestApply: noop,
    onRestart: noop,
    onUploadRequest: noop,
    onValidateRetry: noop,
    rows: [],
    step: "template",
    uploadErrorCode: null,
    uploadStatus: "idle",
    validateStatus: "idle",
    ...overrides,
  };
}

describe("ImportWizardView işaretlemesi (E3 §e.4)", () => {
  it("adım göstergesi yedi adımı sıralar; etkin adım aria-current taşır", () => {
    const html = render(createElement(ImportWizardView, baseViewProps({ step: "validate" })));
    for (const key of [
      "admin.import.step.template",
      "admin.import.step.upload",
      "admin.import.step.map",
      "admin.import.step.validate",
      "admin.import.step.preview",
      "admin.import.step.apply",
      "admin.import.step.result",
    ] as const) {
      expect(html).toContain(t(key));
    }
    expect(html).toContain('aria-current="step"');
    expect(html.match(/aria-current="step"/g) ?? []).toHaveLength(1);
  });

  it("şablon adımı indirme eylemini ve 'İleri' düğmesini gösterir", () => {
    const html = render(createElement(ImportWizardView, baseViewProps({ step: "template" })));
    expect(html).toContain(t("admin.import.template.download"));
    expect(html).toContain(t("admin.import.action.next"));
  });

  it("yükle adımında mod seçimi, dosya adı ve CSV alanını gösterir; hata kodunu Türkçeye çevirir", () => {
    const props = baseViewProps({ step: "upload", uploadErrorCode: "too_many_rows", uploadStatus: "error" });
    const html = render(createElement(ImportWizardView, props));
    expect(html).toContain(t("admin.import.upload.error.too_many_rows"));
    expect(html).toMatch(/role="alert"/);
    // Mod seçimi bir `Select`tir (Radix); açılır liste Portal ile çizilir ve
    // DOM'suz test ortamında boş döner (T163) — seçenekler ağaçtan doğrudan okunur.
    const tree = ImportWizardView(props) as ReactElement;
    const [modeSelect] = collectElements(tree, (element) => element.type === Select);
    const options = (modeSelect?.props as { options: readonly { label: string; value: string }[] }).options;
    expect(options).toEqual([
      { label: t("admin.import.upload.mode.ekle"), value: "ekle" },
      { label: t("admin.import.upload.mode.guncelle"), value: "guncelle" },
    ]);
  });

  it("eşle adımında yedi hedef alanı ve algılanan başlıkları seçenek olarak gösterir", () => {
    const props = baseViewProps({ headers: ["kullanici_adi", "ad_soyad"], mapping: { kullanici_adi: "kullanici_adi" }, step: "map" });
    const html = render(createElement(ImportWizardView, props));
    for (const key of [
      "admin.import.field.kullanici_adi",
      "admin.import.field.eposta",
      "admin.import.field.ad_soyad",
      "admin.import.field.rol",
      "admin.import.field.birim_kodu",
      "admin.import.field.sim_erisimi",
      "admin.import.field.giris_tipi",
    ] as const) {
      expect(html).toContain(t(key));
    }
    // Eşleme seçimleri `Select` (Radix, Portal) ile çizilir; algılanan başlıklar
    // seçeneklerde ağaçtan doğrudan doğrulanır (T163).
    const tree = ImportWizardView(props) as ReactElement;
    const selects = collectElements(tree, (element) => element.type === Select);
    expect(selects).toHaveLength(7);
    const usernameSelect = selects.find((select) => (select.props as { "aria-label"?: string })["aria-label"] === t("admin.import.field.kullanici_adi"));
    const options = (usernameSelect?.props as { options: readonly { label: string; value: string }[] }).options;
    expect(options).toEqual([
      { label: t("admin.import.map.column.placeholder"), value: "" },
      { label: "kullanici_adi", value: "kullanici_adi" },
      { label: "ad_soyad", value: "ad_soyad" },
    ]);
  });

  it("doğrulama adımında sayıları ve satır hatalarını gösterir; hata yoksa 'Hata yok.' gösterir", () => {
    const errorRow: ImportRow = {
      errors: [{ code: "display_name_invalid", column: "ad_soyad", message: "Ad soyad 2-120 karakter olmalıdır." }],
      raw: emptyRaw(),
      rowNo: 5,
      status: "error",
    };
    const withErrors = render(
      createElement(
        ImportWizardView,
        baseViewProps({
          batch: { appliedCount: 0, errorCount: 1, fileName: "x.csv", id: "import-1", mode: "ekle", rowCount: 2, status: "validated", templateVersion: "2026-09", validCount: 1 },
          rows: [errorRow],
          step: "validate",
        }),
      ),
    );
    expect(withErrors).toContain("Ad soyad 2-120 karakter olmalıdır.");
    expect(withErrors).toContain(t("admin.import.validate.download"));

    const noErrors = render(
      createElement(
        ImportWizardView,
        baseViewProps({
          batch: { appliedCount: 0, errorCount: 0, fileName: "x.csv", id: "import-2", mode: "ekle", rowCount: 1, status: "validated", templateVersion: "2026-09", validCount: 1 },
          step: "validate",
        }),
      ),
    );
    expect(noErrors).toContain(t("admin.import.validate.none"));
  });

  it("uygula adımı onay diyaloğunu açık/kapalı gösterir; onaylama düğmesi mevcuttur", () => {
    // `Dialog` (Radix Portal) DOM'suz ortamda boş çizilir (T163); `ImportWizardView`
    // durumsuzdur (hook'suz), doğrudan çağrılıp `Dialog` prop'ları ağaçtan okunur.
    const props = baseViewProps({
      applyConfirmOpen: true,
      batch: { appliedCount: 0, errorCount: 0, fileName: "x.csv", id: "import-3", mode: "ekle", rowCount: 3, status: "validated", templateVersion: "2026-09", validCount: 3 },
      step: "apply",
    });
    const tree = ImportWizardView(props) as ReactElement;
    const dialog = dialogPropsOf(tree);
    expect(dialog.open).toBe(true);
    expect(dialog.title).toBe(t("admin.import.apply.confirm.title"));
    const bodyHtml = render(dialog.children as ReturnType<typeof createElement>);
    expect(bodyHtml).toContain(t("admin.import.apply.confirm.body.ekle"));
    const footerHtml = render(dialog.footer as ReturnType<typeof createElement>);
    expect(footerHtml).toContain(t("admin.import.apply.action"));
  });

  it("sonuç adımı uygulanan/hatalı sayılarını ve yeniden başlatma eylemini gösterir", () => {
    const html = render(
      createElement(
        ImportWizardView,
        baseViewProps({
          applyResult: { alreadyApplied: false, appliedCount: 5, batchId: "import-4", errorCount: 1 },
          step: "result",
        }),
      ),
    );
    expect(html).toContain("5");
    expect(html).toContain(t("admin.import.result.applied"));
    expect(html).toContain(t("admin.import.result.restart"));
    expect(html).toContain(t("admin.import.validate.download"));
  });
});

describe("ImportWizardPage kabı", () => {
  it("varsayılan (dataSource'suz) çağrıldığında ilk render'da şablon adımını gösterir", () => {
    const html = render(createElement(ImportWizardPage));
    expect(html).toContain(t("admin.import.title"));
    expect(html).toContain(t("admin.import.template.download"));
  });

  it("enjekte edilen kaynakla da ilk render şablon adımını gösterir", () => {
    const source = createMockImportsSource([EXISTING_USER], () => 0);
    const html = render(createElement(ImportWizardPage, { dataSource: source }));
    expect(html).toContain(t("admin.import.template.download"));
  });
});

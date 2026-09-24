import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  CSV_DELIMITER,
  CSV_ERROR_COLUMNS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  csvRowSchema,
  csvSimAccessSchema,
  isCsvHeader,
} from "../../packages/contracts/src/index";

const validRow = () => ({
  kullanici_adi: "ornek.ogrenci",
  eposta: "ornek.ogrenci@example.invalid",
  ad_soyad: "Örnek Öğrenci",
  rol: "kullanici",
  birim_kodu: "3-a",
  sim_erisimi: "pulse, opaca",
  giris_tipi: "sso",
});

describe("CSV satır şeması (§f)", () => {
  it("geçerli satırı kabul eder; sim erişimini listeye çevirir", () => {
    const parsed = csvRowSchema.safeParse(validRow());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sim_erisimi).toEqual(["pulse", "opaca"]);
      expect(parsed.data.rol).toBe("kullanici");
      expect(parsed.data.giris_tipi).toBe("sso");
    }
  });

  it("admin rolünü satır hatası olarak reddeder (CSV ile yasak)", () => {
    const parsed = csvRowSchema.safeParse({ ...validRow(), rol: "admin" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["rol"]);
  });

  it("boş hücrelerde varsayılanı uygular; boş sim erişimi erişimsizliktir", () => {
    const parsed = csvRowSchema.safeParse({
      kullanici_adi: "ornek.ogrenci",
      eposta: "",
      ad_soyad: "Örnek Öğrenci",
      rol: "",
      birim_kodu: "",
      sim_erisimi: "",
      giris_tipi: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.eposta).toBeUndefined();
      expect(parsed.data.rol).toBe("kullanici");
      expect(parsed.data.giris_tipi).toBe("sso");
      expect(parsed.data.sim_erisimi).toEqual([]);
    }
  });

  it("e-postayı normalleştirir; iki anahtar da boşsa satırı reddeder", () => {
    const parsed = csvRowSchema.safeParse({
      ...validRow(),
      kullanici_adi: "",
      eposta: "  Ornek.Ogrenci@Example.INVALID ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.eposta).toBe("ornek.ogrenci@example.invalid");

    const missing = csvRowSchema.safeParse({ ...validRow(), kullanici_adi: "", eposta: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.message)).toContain("mapping_key_required");
    }
  });

  it("bilinmeyen simi, kolonu, birim kodunu ve giriş tipini reddeder", () => {
    expect(csvRowSchema.safeParse({ ...validRow(), sim_erisimi: "pulse, kalp" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ ...validRow(), bilinmeyen: "x" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ ...validRow(), birim_kodu: "3 A" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ ...validRow(), giris_tipi: "parola" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ ...validRow(), ad_soyad: "" }).success).toBe(false);
  });

  it("başlık ve sınır sabitlerini dışa aktarır", () => {
    expect(isCsvHeader([...CSV_COLUMNS])).toBe(true);
    expect(isCsvHeader([...CSV_COLUMNS].reverse())).toBe(false);
    expect(isCsvHeader(CSV_COLUMNS.slice(0, -1))).toBe(false);
    expect(CSV_DELIMITER).toBe(";");
    expect(CSV_MAX_ROWS).toBe(5000);
    expect(CSV_MAX_BYTES).toBe(2_000_000);
    expect(CSV_ERROR_COLUMNS).toEqual(["satir_no", "kolon", "kod", "aciklama"]);
    expect(csvSimAccessSchema.parse("")).toEqual([]);
    expect(csvSimAccessSchema.parse("ausculta")).toEqual(["ausculta"]);
  });
});

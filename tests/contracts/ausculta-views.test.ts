import { describe, expect, it } from "vitest";
import { allowedAuscultaViews, auscultaViewCategory, preferredAuscultaViews } from "../../packages/contracts/src/index";

// T233: gövde görünümü izin kuralı — depo sahibi kararı (28 Eyl 2026):
// kalp → ön, akciğer → arka, karma → ikisi; sunulabilir noktası olmayan görünüm düşer.

describe("T233 görünüm kuralı (saf fonksiyon)", () => {
  it("tercih sırası kategoriye göre belirlenir", () => {
    expect(preferredAuscultaViews("heart")).toEqual(["front"]);
    expect(preferredAuscultaViews("lung")).toEqual(["back"]);
    expect(preferredAuscultaViews("mixed")).toEqual(["front", "back"]);
    // Bilinmeyen kategori karma gibi davranır (kütüphane kategori alanı serbest metindir).
    expect(preferredAuscultaViews("other")).toEqual(["front", "back"]);
  });

  it("vaka kategorisi atamalardan türetilir: tümü aynıysa o, değilse mixed", () => {
    expect(auscultaViewCategory(["heart", "heart"])).toBe("heart");
    expect(auscultaViewCategory(["lung"])).toBe("lung");
    expect(auscultaViewCategory(["lung", "heart"])).toBe("mixed");
    expect(auscultaViewCategory(["mixed", "lung"])).toBe("mixed");
    expect(auscultaViewCategory([])).toBe("mixed");
  });

  it("kalp yalnız ön, akciğer yalnız arka, karma iki görünümde açılır", () => {
    expect(allowedAuscultaViews("heart", ["front", "back"], ["front", "back"])).toEqual(["front"]);
    expect(allowedAuscultaViews("lung", ["front", "back"], ["front"])).toEqual(["back"]);
    expect(allowedAuscultaViews("mixed", ["front", "back"], ["front", "back"])).toEqual(["front", "back"]);
  });

  it("sunulabilir olmayan görünüm düşer; boşalan görünüm geri düşüşle açılır", () => {
    // Akciğer vakası yalnız ön nokta taşıyorsa arka sunulamaz → ön açılır.
    expect(allowedAuscultaViews("lung", ["front"], ["front", "back"])).toEqual(["front"]);
    expect(allowedAuscultaViews("heart", ["back"], ["front", "back"])).toEqual(["back"]);
    // Karma vakada yalnız bir görünümde nokta varsa o görünüm kalır.
    expect(allowedAuscultaViews("mixed", ["back"], ["front", "back"])).toEqual(["back"]);
  });

  it("değerlendirmede O7 ile boşalan görünüm (posterior plevral sürtünme) öne düşer", () => {
    // Arka sunulabilir değil (posterior kayıtlar O7 süzgeciyle düştü), ön gerçek kayıt taşır.
    expect(allowedAuscultaViews("lung", ["front"], ["front", "back"])).toEqual(["front"]);
    // İki görünüm de boşsa vakanın bildirdiği görünümler korunur.
    expect(allowedAuscultaViews("lung", [], ["front", "back"])).toEqual(["front", "back"]);
    expect(allowedAuscultaViews("heart", [], ["back"])).toEqual(["back"]);
  });
});

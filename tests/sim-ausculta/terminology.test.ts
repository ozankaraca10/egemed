import { describe, expect, it } from "vitest";
import { libraryShortTitle, libraryTitle } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:1077-1091 (3 test → 3 test). */

/* ---------------- madde 4 (wave 2): kütüphane kısa başlık ---------------- */
describe("libraryShortTitle (madde 4, wave 2)", () => {
  it("üfürüm kalemleri için kısa başlık üretir (tam ad ile aynı değildir)", () => {
    expect(libraryShortTitle("heart.murmur.early_systolic")).toBe("Erken sistolik üfürüm");
    expect(libraryTitle("heart.murmur.early_systolic")).toBe("Sistolik Üfürüm (Erken Sistolik)");
    expect(libraryShortTitle("heart.murmur.early_systolic")).not.toBe(libraryTitle("heart.murmur.early_systolic"));
  });
  it("akciğer kalemleri için kısa başlık üretir", () => {
    expect(libraryShortTitle("lung.fine_crackles")).toBe("İnce Raller");
    expect(libraryShortTitle("lung.coarse_crackles")).toBe("Kaba Raller");
  });
  it("bilinmeyen anahtar için çökmeden yedek metin döner", () => {
    expect(libraryShortTitle("mixed.msm_wheezing")).toBeTruthy();
    expect(() => libraryShortTitle("bilinmeyen.key")).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { libraryShortTitle } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:1077-1091 (3 test → 3 test). */

/* ---------------- madde 4 (wave 2): kütüphane kısa başlık ---------------- */
describe("libraryShortTitle (madde 4, wave 2)", () => {
  it("bilinmeyen anahtar için çökmeden yedek metin döner", () => {
    expect(libraryShortTitle("mixed.msm_wheezing")).toMatch(/wheezing/i);
    expect(libraryShortTitle("bilinmeyen.key")).toMatch(/ses/i);
  });
});

import { describe, expect, it } from "vitest";
import { isTimedOut, modeLearnLocked, modePickTarget, remainingSec } from "../../../packages/sim-opaca/src/index";

/** Akış grubu — kaynak egemed-opaca tests/core.test.ts `describe('akış')` portu (5 test).
 *  Saf fonksiyonlar; durum taşımaz, tüm girdi (süre, telemetri, tohum) parametreyle gelir. */

describe("akış (kaynak davranışı)", () => {

  it("süre sınırı", () => {
    expect(isTimedOut(179_000, 180)).toBe(false);
    expect(isTimedOut(180_000, 180)).toBe(true);
    expect(isTimedOut(999_000, undefined)).toBe(false);
    expect(remainingSec(1500, 180)).toBe(179);
    expect(remainingSec(999_000, 180)).toBe(0);
    expect(remainingSec(0, undefined)).toBeNull();
  });

  it("T218: öğrenme kilidi tamamlanmadan hedefi öğrenmeye çevirir (öneri değil)", () => {
    expect(modeLearnLocked(false, true)).toBe(true);
    expect(modeLearnLocked(true, true)).toBe(false);
    expect(modeLearnLocked(false, false)).toBe(false);
    expect(modePickTarget("practice", false, true)).toBe("learn");
    expect(modePickTarget("assessment", false, true)).toBe("learn");
    expect(modePickTarget("learn", false, true)).toBe("learn");
    expect(modePickTarget("practice", true, true)).toBe("practice");
    expect(modePickTarget("assessment", true, true)).toBe("assessment");
    // Havuz boşken kilit değil, veri eksikliği devrededir.
    expect(modePickTarget("practice", false, false)).toBe("practice");
  });
});

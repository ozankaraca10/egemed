import { describe, expect, it } from "vitest";
import {
  firstWeakLibraryKey,
  isTimedOut,
  needsExitConfirm,
  nextActionForSubmit,
  remainingSec,
  stepBackTarget,
  stepProgress,
  tutorialProgress,
  weakDomainKeys,
  zoneChipState,
} from "../../../packages/sim-opaca/src/index";

/** Akış grubu — kaynak egemed-opaca tests/core.test.ts `describe('akış')` portu (5 test).
 *  Saf fonksiyonlar; durum taşımaz, tüm girdi (süre, telemetri, tohum) parametreyle gelir. */

describe("akış (kaynak davranışı)", () => {
  it("yanıt eylemi", () => {
    expect(nextActionForSubmit("practice", false, false)).toBe("submit");
    expect(nextActionForSubmit("practice", true, false)).toBe("advance");
    expect(nextActionForSubmit("practice", true, true)).toBe("finish");
    expect(nextActionForSubmit("assessment", false, false)).toBe("submit-then-advance");
    expect(nextActionForSubmit("assessment", false, true)).toBe("submit-then-finish");
  });

  it("bölge çipi ve adım ilerlemesi", () => {
    const visits = { a: { dwellMs: 900 }, b: { dwellMs: 100 } };
    expect(zoneChipState("b", ["b"], visits, 500)).toBe("active");
    expect(zoneChipState("a", [], visits, 500)).toBe("inspected");
    expect(zoneChipState("b", [], visits, 500)).toBe("default");
    const p = stepProgress(
      [
        { id: "a", step: "A" },
        { id: "b", step: "A" },
        { id: "c", step: "B" },
      ],
      visits,
      500
    );
    expect(p).toEqual({ A: { done: 1, total: 2 }, B: { done: 0, total: 1 } });
  });

  it("öğretici ilerlemesi", () => {
    expect(tutorialProgress([]).currentStep).toBe(0);
    expect(tutorialProgress(["window"]).currentStep).toBe(0);
    expect(tutorialProgress(["zoom", "window"]).currentStep).toBe(2);
    expect(tutorialProgress(["mark", "zoom", "window"]).allDone).toBe(true);
  });

  it("süre sınırı", () => {
    expect(isTimedOut(179_000, 180)).toBe(false);
    expect(isTimedOut(180_000, 180)).toBe(true);
    expect(isTimedOut(999_000, undefined)).toBe(false);
    expect(remainingSec(1500, 180)).toBe(179);
    expect(remainingSec(999_000, 180)).toBe(0);
    expect(remainingSec(0, undefined)).toBeNull();
  });

  it("zayıf alanlar ve öğrenme odağı", () => {
    expect(
      weakDomainKeys({
        a: { earned: 5, max: 10 },
        b: { earned: 9, max: 10 },
        c: { earned: 0, max: 0 },
      })
    ).toEqual(["a"]);
    expect(weakDomainKeys(null)).toEqual([]);
    const res = [
      { caseId: "x", answers: [{ correct: true }] },
      { caseId: "y", answers: [{ correct: false }] },
    ];
    expect(firstWeakLibraryKey(res, (id) => (id === "y" ? "finding.pneumothorax" : null))).toBe("finding.pneumothorax");
    expect(firstWeakLibraryKey(res, () => null)).toBeNull();
  });

  it("T183: header adım geri navigasyonu yalnız adım 0'ı (mod seçimi) hedef alır", () => {
    expect(stepBackTarget(0)).toBe("modes");
    expect(stepBackTarget(1)).toBeNull();
    expect(stepBackTarget(2)).toBeNull();
    expect(stepBackTarget(-1)).toBeNull();
  });

  it("T183: yalnız etkin oturum (simulation ekranı) mod seçimine dönüşte onay ister", () => {
    expect(needsExitConfirm("simulation")).toBe(true);
    expect(needsExitConfirm("learn")).toBe(false);
    expect(needsExitConfirm("modes")).toBe(false);
    expect(needsExitConfirm("results")).toBe(false);
    expect(needsExitConfirm("start")).toBe(false);
  });
});

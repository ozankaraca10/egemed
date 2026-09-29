import { describe, expect, it } from "vitest";
import {
  BEST_SCORE_KEY,
  initialState,
  loadBestScore,
  reducer,
  saveBestScore,
} from "../../packages/sim-ausculta/src/index";
import type { AppState, CaseResult, StoragePort } from "../../packages/sim-ausculta/src/index";

/** bestScore `StoragePort` arkasında (S8c, K-P3 açık). `localStorage` yok.
 *  `landingSound` / `fsPromptDone` bu dilimde yok (kaynak chrome; kabuk tercihi). */

const DOMAIN_KEYS = ["technique", "localization", "recognition", "interpretation", "diagnosis", "systematic"] as const;

function result(earned: number): CaseResult {
  return {
    caseId: "c",
    total: earned,
    max: 100,
    mastery: earned >= 80,
    domains: Object.fromEntries(DOMAIN_KEYS.map((k) => [k, { earned: k === "technique" ? earned : 0, max: k === "technique" ? 100 : 0 }])) as CaseResult["domains"],
    answers: [],
    hintsUsed: 0,
  };
}

describe("en iyi puan (bestScore, StoragePort)", () => {

  it("practice ve assessment birbirini etkilemez", () => {
    let s: AppState = { ...initialState, mode: "practice" };
    s = reducer(s, { type: "setResults", results: [result(100)] });
    s = reducer({ ...s, mode: "assessment" }, { type: "setResults", results: [result(0)] });
    expect(s.bestScore).toEqual({ practice: 100, assessment: 0 });
  });

  it("başlangıç sıfırdır; anahtar ausculta.bestScore", () => {
    expect(initialState.bestScore).toEqual({ practice: 0, assessment: 0 });
    expect(BEST_SCORE_KEY).toBe("ausculta.bestScore");
  });

  it("erişim engelinde sessizce yutulur", () => {
    const broken: StoragePort = {
      get() {
        throw new Error("erişim engelli");
      },
      set() {
        throw new Error("erişim engelli");
      },
    };
    expect(loadBestScore(broken)).toEqual({ practice: 0, assessment: 0 });
    expect(() => saveBestScore(broken, { practice: 10, assessment: 10 })).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildSuspend, deserializeSuspend, initialState, reducer, sampleSession, serializeSuspend } from "../../packages/sim-ausculta/src/index";
import type { CaseDef, CaseResult } from "../../packages/sim-ausculta/src/index";
import { ALL_CASES, poolFor } from "./bank-cases";

/** Kaynak tests/core.test.ts:148-234 (7 test → 7 test). */

function caseNormalHeart() {
  const def = ALL_CASES.find((c) => c.id === "case_normal_heart");
  if (!def) throw new Error("case_normal_heart yok");
  return def;
}

describe("reducer: yeni oturum ve devam ettirme", () => {

  it("madde 5: sunucu vaka sonucu sonrası nextCase caseIndex'i ilerletir ve pendingSummary'yi temizler", () => {
    // ADR-009 (T313): vaka sonucu yalnız sunucudan gelir (`serverCaseResult`).
    let state = reducer({ ...initialState, mode: "practice" as const }, { type: "serverStarted", sessionId: "s1", mode: "practice", caseCount: 2 });
    const result = { caseId: "c1", total: 90, max: 100, mastery: true, domains: {}, answers: [], hintsUsed: 0 } as unknown as CaseResult;
    state = reducer(state, { type: "serverCaseResult", result, meta: null });
    expect(state.pendingSummary?.total).toBe(90);
    expect(state.caseIndex).toBe(0);
    const next = reducer(state, { type: "nextCase" });
    expect(next.pendingSummary).toBeNull();
    expect(next.caseIndex).toBe(1);
    expect(next.step).toBe(0);
  });

  it("K3: serialize → deserialize → restore sonrası aynı oturum vaka listesi korunur", () => {
    const pool = poolFor("assessment");
    const seed = 555;
    const ids = sampleSession(pool, seed);
    const state = {
      ...initialState,
      mode: "assessment" as const,
      session: { practiceIds: [], assessmentIds: ids, seed },
    };
    const payload = buildSuspend(state);
    const raw = serializeSuspend(payload);
    const restored = deserializeSuspend(raw);
    if (!restored) throw new Error("suspend çözülemedi");
    const next = reducer(state, { type: "restore", payload: restored });
    expect(next.session.assessmentIds).toEqual(ids);
    expect(next.session.seed).toBe(seed);
    expect(next.session.practiceIds).toEqual([]);
  });

  it("T233: caseMount izinli ilk görünümü açar; izinli arka vaka arkaya geçer", () => {
    const heart = caseNormalHeart();
    const backOnly = { ...heart, id: "srv-1", views: ["back"] as CaseDef["views"] };
    const mounted = reducer(initialState, { type: "caseMount", caseDef: backOnly });
    expect(mounted.view).toBe("back");
    // Açılış görünümü her vakada izinli ilk görünümdür; önceki görünüm taşınmaz.
    const frontOnly = { ...heart, id: "srv-2", views: ["front"] as CaseDef["views"] };
    expect(reducer(mounted, { type: "caseMount", caseDef: frontOnly }).view).toBe("front");
    // Aynı vaka ve aynı görünüm: gereksiz durum üretilmez.
    const stable = reducer(mounted, { type: "caseMount", caseDef: { ...backOnly } });
    expect(stable).toBe(mounted);
    expect(stable.view).toBe("back");
  });
});

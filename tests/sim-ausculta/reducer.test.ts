import { describe, expect, it } from "vitest";
import { buildSuspend, deserializeSuspend, initialState, reducer, sampleSession, serializeSuspend } from "../../packages/sim-ausculta/src/index";
import type { CaseDef } from "../../packages/sim-ausculta/src/index";
import { ALL_CASES, poolFor } from "./bank-cases";

/** Kaynak tests/core.test.ts:148-234 (7 test → 7 test). */

function caseNormalHeart() {
  const def = ALL_CASES.find((c) => c.id === "case_normal_heart");
  if (!def) throw new Error("case_normal_heart yok");
  return def;
}

/** T196: reducer etkin vakayı yalnız sunucu oturumundan okur (istemcide havuz yok). */
function serverWith(def: ReturnType<typeof caseNormalHeart>) {
  return { server: { currentCase: def } as unknown as typeof initialState.server };
}

describe("reducer: yeni oturum ve devam ettirme", () => {

  it("O9: uygulama modunda ipucu cezası vaka sonucuna uygulanır (değerlendirmede uygulanmaz)", () => {
    const def = caseNormalHeart();
    const allCorrect = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]));
    const telemetry = {
      visits: Object.fromEntries(
        def.technique.requiredPoints.map((p, i) => [p, { dwellMs: 99999, listenMs: 99999, visits: 1, firstOrder: i }]),
      ),
      order: [...def.technique.requiredPoints],
      headChanges: 0,
      headUse: { bell: 0, diaphragm: 0 } as const,
      replayCount: 0,
    };
    const baseState = {
      ...initialState,
      ...serverWith(def),
      currentCaseId: def.id,
      step: def.questions.length - 1,
      answers: allCorrect,
      telemetry,
      hintsUsed: 2,
    };
    const practiceNext = reducer({ ...baseState, mode: "practice" as const }, { type: "finishCase" });
    const practiceResult = practiceNext.caseResults[0];
    if (!practiceResult) throw new Error("practice sonucu yok");
    expect(practiceResult.total).toBe(90);
    expect(practiceResult.mastery).toBe(true);
    expect(practiceNext.pendingSummary?.total).toBe(90);

    const assessmentNext = reducer({ ...baseState, mode: "assessment" as const }, { type: "finishCase" });
    const assessmentResult = assessmentNext.caseResults[0];
    if (!assessmentResult) throw new Error("assessment sonucu yok");
    expect(assessmentResult.total).toBe(100);
  });

  it("madde 5: finishCase sonrası nextCase caseIndex'i ilerletir ve pendingSummary'yi temizler", () => {
    const def = caseNormalHeart();
    const allCorrect = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]));
    const baseState = {
      ...initialState,
      mode: "practice" as const,
      ...serverWith(def),
      currentCaseId: def.id,
      step: def.questions.length - 1,
      answers: allCorrect,
    };
    const finished = reducer(baseState, { type: "finishCase" });
    expect(finished.pendingSummary).not.toBeNull();
    expect(finished.caseIndex).toBe(0);
    const next = reducer(finished, { type: "nextCase" });
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

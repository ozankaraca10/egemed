import { describe, expect, it } from "vitest";
import {
  ALL_CASES,
  buildSuspend,
  deserializeSuspend,
  initialState,
  poolFor,
  reducer,
  sampleSession,
  serializeSuspend,
} from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:148-234 (7 test → 7 test). */

function caseNormalHeart() {
  const def = ALL_CASES.find((c) => c.id === "case_normal_heart");
  if (!def) throw new Error("case_normal_heart yok");
  return def;
}

describe("reducer: yeni oturum ve devam ettirme", () => {
  it('öğretici "Atla" ile oturum içinde görüldü sayılır; kalıcı tutorialDone değişmez', () => {
    const seen = reducer(initialState, { type: "tutorialSeen" });
    expect(seen.tutorialSeen).toBe(true);
    expect(seen.tutorialDone).toBe(false);
    expect(buildSuspend(seen).tutorialDone).toBe(false);
  });

  it("K4: startMode eski vaka sonuçlarını ve zamanlayıcıyı sıfırlar", () => {
    const dirty = {
      ...initialState,
      caseResults: [
        { caseId: "x", total: 90, max: 100, mastery: true, domains: {} as never, answers: [], hintsUsed: 0 },
      ],
      assessmentTimer: 45000,
      attempts: 2,
    };
    const next = reducer(dirty, { type: "startMode", mode: "assessment" });
    expect(next.caseResults).toEqual([]);
    expect(next.assessmentTimer).toBe(0);
    expect(next.attempts).toBe(3);
  });

  it("K3: buildSuspend yalnız aktif modun oturum listesini yazar", () => {
    const state = {
      ...initialState,
      mode: "assessment" as const,
      session: { practiceIds: ["p1", "p2"], assessmentIds: ["a1", "a2"], seed: 9 },
    };
    const payload = buildSuspend(state);
    expect(payload.sessionIds).toEqual(["a1", "a2"]);
    expect(payload.sessionSeed).toBe(9);
  });

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

  it("madde 1/5: advance son soruda vakayı bitirmez — finishCase/nextCase gerekir", () => {
    const def = caseNormalHeart();
    const baseState = {
      ...initialState,
      mode: "practice" as const,
      currentCaseId: def.id,
      step: def.questions.length - 1,
    };
    const afterAdvance = reducer(baseState, { type: "advance" });
    expect(afterAdvance).toBe(baseState);
    expect(afterAdvance.caseResults).toEqual([]);
  });

  it("madde 5: finishCase sonrası nextCase caseIndex'i ilerletir ve pendingSummary'yi temizler", () => {
    const def = caseNormalHeart();
    const allCorrect = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]));
    const baseState = {
      ...initialState,
      mode: "practice" as const,
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
});

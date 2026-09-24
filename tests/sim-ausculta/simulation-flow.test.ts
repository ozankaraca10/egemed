import { describe, expect, it } from "vitest";
import {
  CASE_FLASH_MS,
  CASE_TRANSITION_MS,
  computeQuestionLatency,
  hasSessionProgress,
  isAnswerCorrect,
  planAssessmentAutoAdvance,
  planK3SessionRegeneration,
  planPrimaryAction,
  planSessionAction,
  planSessionCompletion,
  questionCursor,
  resolveSimulationSession,
  sessionSeed,
  shouldStartCaseTransition,
  showCaseEndCard,
  simulationPointIds,
} from "../../packages/sim-ausculta/src/index";
import type { CaseDef, CaseResult, Question, ScoringWeights } from "../../packages/sim-ausculta/src/index";

/** S15a — SimulationScreen akış/skor türetme. Sentetik vaka; DOM yok. */

function caseDef(id: string): CaseDef {
  return {
    id,
    title: "Fixture",
    modes: ["practice", "assessment"],
    patient: { age: 54, sex: "kadın" },
    chiefComplaint: "Nefes darlığı",
    history: "İki gündür.",
    vitalSigns: {},
    objectives: [],
    tasks: [],
    views: ["front"],
    allowedHeads: ["diaphragm"],
    soundAssignments: [],
    primaryAcousticFinding: "normal",
    clinicalDiagnosis: null,
    mappingValidation: "validated",
    technique: { requiredPoints: [], minPointsVisited: 0, minDwellMs: 1500, minListenMsPerPoint: 2000 },
    questions: [],
    feedback: { summary: "Özet" },
    references: [],
  };
}

function question(id: string, correct: string[] = ["a"]): Question {
  return {
    id,
    type: "single_choice",
    domain: "recognition",
    prompt: "Bulgu?",
    options: [
      { id: "a", label: "Normal" },
      { id: "b", label: "Üfürüm" },
    ],
    correct,
    feedbackCorrect: "Doğru",
    feedbackIncorrect: "Yanlış",
  };
}

function result(): CaseResult {
  const domains = {
    technique: { earned: 20, max: 20 },
    localization: { earned: 0, max: 0 },
    recognition: { earned: 25, max: 25 },
    interpretation: { earned: 20, max: 20 },
    diagnosis: { earned: 10, max: 10 },
    systematic: { earned: 5, max: 5 },
  } satisfies Record<keyof ScoringWeights, { earned: number; max: number }>;
  return { caseId: "c1", total: 100, max: 100, mastery: true, domains, answers: [], hintsUsed: 0 };
}

describe("simulation-flow (S15a)", () => {
  const pool = [caseDef("c1"), caseDef("c2"), caseDef("c3")];
  const qs = [question("q1"), question("q2")];
  const shownAt = { q1: 100, q2: 0 };

  it("oturum listesini çözer ve boş oturumda havuza düşer", () => {
    const resolved = resolveSimulationSession({
      mode: "assessment",
      practiceIds: ["c1"],
      assessmentIds: ["c3", "missing", "c1"],
      caseIndex: 1,
      allCases: pool,
      pool,
    });
    expect(resolved.sessionCases.map((c) => c.id)).toEqual(["c3", "c1"]);
    expect(resolved.currentCase?.id).toBe("c1");
    const empty = resolveSimulationSession({
      mode: "practice",
      practiceIds: [],
      assessmentIds: ["c2"],
      caseIndex: 9,
      allCases: pool,
      pool,
    });
    expect(empty.sessionCases).toHaveLength(0);
    expect(empty.caseList).toHaveLength(3);
    expect(empty.currentCase?.id).toBe("c1");
  });

  it("K3 boş listede tohumu korur; learn ve dolu liste null", () => {
    const plan = planK3SessionRegeneration({
      mode: "practice",
      sessionCasesCount: 0,
      seed: 42,
      practiceIds: [],
      assessmentIds: ["keep"],
      pool,
      now: 99,
    });
    expect(plan?.seed).toBe(42);
    expect(plan?.assessmentIds).toEqual(["keep"]);
    const again = planK3SessionRegeneration({
      mode: "practice",
      sessionCasesCount: 0,
      seed: 42,
      practiceIds: [],
      assessmentIds: [],
      pool,
      now: 1,
    });
    expect(again?.practiceIds).toEqual(plan?.practiceIds);
    expect(
      planK3SessionRegeneration({
        mode: "assessment",
        sessionCasesCount: 0,
        seed: 0,
        practiceIds: ["p"],
        assessmentIds: [],
        pool,
        now: 1_700_000_000_123,
      })?.seed,
    ).toBe(1_700_000_000_123);
    expect(
      planK3SessionRegeneration({ mode: "learn", sessionCasesCount: 0, seed: 1, practiceIds: [], assessmentIds: [], pool, now: 1 }),
    ).toBeNull();
    expect(
      planK3SessionRegeneration({ mode: "practice", sessionCasesCount: 2, seed: 1, practiceIds: ["c1"], assessmentIds: [], pool, now: 1 }),
    ).toBeNull();
  });

  it("nokta listesi, imleç, doğruluk ve gecikme", () => {
    const assignments = [
      { pointId: "cardiac_mitral", category: "heart" as const, acousticFinding: "normal" },
      { pointId: "lung_left_upper_posterior", category: "lung" as const, acousticFinding: "normal" },
    ];
    expect(simulationPointIds(false, assignments)).toEqual(["cardiac_mitral", "lung_left_upper_posterior"]);
    expect(simulationPointIds(true, assignments)).toEqual(["cardiac_mitral"]);
    expect(questionCursor(qs, 0, { q1: ["a"] }, { q1: true })).toEqual({ question: qs[0], canSubmit: true, revealed: true });
    expect(isAnswerCorrect(qs[0]!, ["b"])).toBe(false);
    expect(isAnswerCorrect(question("q2", ["a", "b"]), ["a", "b"])).toBe(true);
    expect(computeQuestionLatency(qs, shownAt, 4500)).toEqual({ q1: 4400 });
  });

  it("birincil eylem uygulama ve değerlendirme planı üretir", () => {
    expect(
      planPrimaryAction({
        mode: "practice",
        question: qs[0],
        questions: qs,
        revealed: false,
        canSubmit: true,
        given: ["a"],
        shownAt,
        now: 500,
      }),
    ).toEqual({ dispatches: [{ type: "submitAnswer", qid: "q1", correct: true }], saveInteractions: false, latency: null });
    expect(
      planPrimaryAction({
        mode: "practice",
        question: qs[1],
        questions: qs,
        revealed: true,
        canSubmit: true,
        given: ["a"],
        shownAt,
        now: 500,
      }).dispatches,
    ).toEqual([{ type: "finishCase" }]);
    const last = planPrimaryAction({
      mode: "assessment",
      question: qs[1],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ["b"],
      shownAt: { q1: 100, q2: 200 },
      now: 900,
    });
    expect(last.dispatches).toEqual([
      { type: "submitAnswer", qid: "q2", correct: false },
      { type: "finishCase" },
    ]);
    expect(last.saveInteractions).toBe(true);
    expect(last.latency).toEqual({ q1: 800, q2: 700 });
    expect(
      planPrimaryAction({ mode: "assessment", question: qs[0], questions: qs, revealed: false, canSubmit: false, given: [], shownAt, now: 1 })
        .dispatches,
    ).toEqual([]);
  });

  it("örneklem diğer modu korur; yeniden başlatma yalnız startMode eder", () => {
    expect(hasSessionProgress({}, 0, 0)).toBe(false);
    expect(hasSessionProgress({}, 1, 0)).toBe(true);
    const now = 2_147_483_647 + 99;
    const resampled = planSessionAction({ kind: "resample", mode: "practice", practiceIds: ["old"], assessmentIds: ["a_keep"], pool, now });
    expect(resampled[0]).toMatchObject({ type: "startSession", assessmentIds: ["a_keep"], seed: sessionSeed(now) });
    expect(resampled[1]).toEqual({ type: "startMode", mode: "practice" });
    expect(
      planSessionAction({ kind: "restart", mode: "assessment", practiceIds: ["p"], assessmentIds: ["a"], pool, now }),
    ).toEqual([{ type: "startMode", mode: "assessment" }]);
  });

  it("vaka sonu, geçiş ve oturum tamamlanma skoru", () => {
    const summary = result();
    expect(showCaseEndCard("practice", summary)).toBe(true);
    expect(showCaseEndCard("assessment", summary)).toBe(false);
    expect(planAssessmentAutoAdvance(true, summary)).toEqual({ type: "nextCase" });
    expect(shouldStartCaseTransition(true, true)).toBe(false);
    expect(shouldStartCaseTransition(true, false)).toBe(true);
    expect(CASE_FLASH_MS).toBe(600);
    expect(CASE_TRANSITION_MS).toBe(1400);
    expect(planSessionCompletion({ caseIndex: 0, caseCount: 1, mode: "assessment", caseResults: [summary], now: 5 })).toBeNull();
    const done = planSessionCompletion({ caseIndex: 1, caseCount: 1, mode: "assessment", caseResults: [summary], now: 50 });
    expect(done?.reportScore).toBe(true);
    expect(done?.completedAt).toBe(50);
    expect(done?.aggregate.total).toBe(100);
    expect(done?.aggregate.mastery).toBe(true);
    expect(done?.dispatch).toEqual({ type: "setResults", results: [summary] });
    expect(planSessionCompletion({ caseIndex: 1, caseCount: 1, mode: "practice", caseResults: [summary], now: 50 })?.completedAt).toBeNull();
  });
});

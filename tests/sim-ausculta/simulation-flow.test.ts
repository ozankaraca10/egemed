import { describe, expect, it } from "vitest";
import { CASE_FLASH_MS, CASE_TRANSITION_MS, computeQuestionLatency, isAnswerCorrect, planAssessmentAutoAdvance, questionCursor, shouldStartCaseTransition, showCaseEndCard } from "../../packages/sim-ausculta/src/index";
import type { CaseResult, Question, ScoringWeights } from "../../packages/sim-ausculta/src/index";

/** S15a — SimulationScreen akış/skor türetme. Sentetik vaka; DOM yok. */

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
  const qs = [question("q1"), question("q2")];
  const shownAt = { q1: 100, q2: 0 };

  it("imleç, doğruluk ve gecikme", () => {
    expect(questionCursor(qs, 0, { q1: ["a"] }, { q1: true })).toEqual({ question: qs[0], canSubmit: true, revealed: true });
    expect(isAnswerCorrect(qs[0]!, ["b"])).toBe(false);
    expect(isAnswerCorrect(question("q2", ["a", "b"]), ["a", "b"])).toBe(true);
    expect(computeQuestionLatency(qs, shownAt, 4500)).toEqual({ q1: 4400 });
  });

  it("vaka sonu ve geçiş kararları", () => {
    const summary = result();
    expect(showCaseEndCard("practice", summary)).toBe(true);
    expect(showCaseEndCard("assessment", summary)).toBe(false);
    expect(planAssessmentAutoAdvance(true, summary)).toEqual({ type: "nextCase" });
    expect(shouldStartCaseTransition(true, true)).toBe(false);
    expect(shouldStartCaseTransition(true, false)).toBe(true);
    expect(CASE_FLASH_MS).toBe(600);
    expect(CASE_TRANSITION_MS).toBe(1400);
  });
});

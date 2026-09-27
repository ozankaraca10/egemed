/** SimulationScreen saf türetme (S15a). React/DOM yok; zaman `now` parametresidir.
 *  Kaynak: egemed-ausculta `screens/SimulationScreen.tsx` akış ve skor kararları.
 *  Ekran gövdesi S15b, rapor ve dinleyici S15c. */

import { nextActionForSubmit } from "../../core/flow";
import type { CaseResult, Mode, Question } from "../../core/types";

export const CASE_FLASH_MS = 600;
export const CASE_TRANSITION_MS = 1400;

export type SimulationDispatch =
  | { type: "advance" }
  | { type: "finishCase" }
  | { type: "nextCase" }
  | { type: "submitAnswer"; qid: string; correct: boolean }
  | { type: "startSession"; practiceIds: string[]; assessmentIds: string[]; seed: number }
  | { type: "startMode"; mode: Mode }
  | { type: "setResults"; results: CaseResult[] };

export interface PrimaryActionPlan {
  dispatches: SimulationDispatch[];
  saveInteractions: boolean;
  latency: Record<string, number> | null;
}

export interface QuestionCursor {
  question: Question | undefined;
  canSubmit: boolean;
  revealed: boolean;
}

/** Kaynak satır 62–64. */
export function questionCursor(
  questions: readonly Question[],
  step: number,
  answers: Readonly<Record<string, readonly string[] | undefined>>,
  revealed: Readonly<Record<string, boolean | undefined>>,
): QuestionCursor {
  const question = questions[step];
  return {
    question,
    canSubmit: !!question && (answers[question.id]?.length ?? 0) > 0,
    revealed: question ? !!revealed[question.id] : false,
  };
}

/** Kaynak satır 546–548. */
export function isAnswerCorrect(q: Question, given: readonly string[]): boolean {
  return given.length > 0 && q.correct.length === given.length && given.every((g) => q.correct.includes(g));
}

/** Kaynak satır 550–552. */
export function isLastQuestion(questions: readonly Question[], q: Question | undefined): boolean {
  return !!q && questions[questions.length - 1]?.id === q.id;
}

/** Kaynak satır 140–144. Sıfır zaman damgası yok sayılır. */
export function computeQuestionLatency(
  questions: readonly Question[],
  shownAt: Readonly<Record<string, number>>,
  now: number,
): Record<string, number> {
  const latency: Record<string, number> = {};
  for (const qq of questions) {
    const t0 = shownAt[qq.id];
    if (t0) latency[qq.id] = now - t0;
  }
  return latency;
}

/** Kaynak satır 122–150. Son sorunun gönderiminde her iki modda etkileşim kaydı planlanır. */
export function planPrimaryAction(params: {
  mode: Mode;
  question: Question | undefined;
  questions: readonly Question[];
  revealed: boolean;
  canSubmit: boolean;
  given: readonly string[];
  shownAt: Readonly<Record<string, number>>;
  now: number;
}): PrimaryActionPlan {
  const q = params.question;
  if (!q) return { dispatches: [], saveInteractions: false, latency: null };
  const last = isLastQuestion(params.questions, q);
  const action = nextActionForSubmit(params.mode, params.revealed, last);
  if (action === "advance") return { dispatches: [{ type: "advance" }], saveInteractions: false, latency: null };
  if (action === "finish") return { dispatches: [{ type: "finishCase" }], saveInteractions: false, latency: null };
  if (!params.canSubmit) return { dispatches: [], saveInteractions: false, latency: null };
  const dispatches: SimulationDispatch[] = [{ type: "submitAnswer", qid: q.id, correct: isAnswerCorrect(q, params.given) }];
  if (action === "submit-then-finish") dispatches.push({ type: "finishCase" });
  else if (action === "submit-then-advance") dispatches.push({ type: "advance" });
  return {
    dispatches,
    saveInteractions: last,
    latency: last ? computeQuestionLatency(params.questions, params.shownAt, params.now) : null,
  };
}

/** Kaynak satır 153. */
export function hasSessionProgress(
  answers: Readonly<Record<string, readonly string[]>>,
  hintsUsed: number,
  caseResultsCount: number,
): boolean {
  return caseResultsCount > 0 || Object.keys(answers).length > 0 || hintsUsed > 0;
}

/** Kaynak satır 172. */
export function showCaseEndCard(mode: Mode, pendingSummary: CaseResult | null): boolean {
  return mode === "practice" && !!pendingSummary;
}

/** Kaynak satır 116–118. */
export function planAssessmentAutoAdvance(isAssessment: boolean, pendingSummary: CaseResult | null): SimulationDispatch | null {
  return isAssessment && pendingSummary ? { type: "nextCase" } : null;
}

/** Kaynak satır 102–108. İlk vaka geçiş paneli açmaz. */
export function shouldStartCaseTransition(isAssessment: boolean, isFirstCase: boolean): boolean {
  return isAssessment && !isFirstCase;
}

/** SimulationScreen saf türetme (S15a). React/DOM yok; zaman `now` parametresidir.
 *  Kaynak: egemed-ausculta `screens/SimulationScreen.tsx` akış ve skor kararları.
 *  Ekran gövdesi S15b, rapor ve dinleyici S15c. */

import { nextActionForSubmit, resampleActiveMode } from "../../core/flow";
import { assessmentPointFilter } from "../../core/resolver";
import { SESSION_SIZE, sampleSession } from "../../core/session";
import { aggregateResults } from "../../core/scoring";
import type { CaseDef, CaseResult, Mode, Question, SoundAssignment } from "../../core/types";
import { sessionSeed } from "../entry";

export const CASE_FLASH_MS = 600;
export const CASE_TRANSITION_MS = 1400;

export interface ResolvedSimulationSession {
  sessionCases: CaseDef[];
  caseList: CaseDef[];
  currentCase: CaseDef | undefined;
}

export interface SessionIdPlan {
  practiceIds: string[];
  assessmentIds: string[];
  seed: number;
}

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

export interface SessionCompletionPlan {
  aggregate: ReturnType<typeof aggregateResults>;
  reportScore: boolean;
  completedAt: number | null;
  dispatch: Extract<SimulationDispatch, { type: "setResults" }>;
}

export type SessionActionKind = "resample" | "restart";

/** Kaynak satır 28–33. Boş oturum `pool`a düşer; SESSION_SIZE dilimi uygulanmaz. */
export function resolveSimulationSession(params: {
  mode: Mode;
  practiceIds: readonly string[];
  assessmentIds: readonly string[];
  caseIndex: number;
  allCases: readonly CaseDef[];
  pool: readonly CaseDef[];
}): ResolvedSimulationSession {
  const sessionIds = params.mode === "assessment" ? params.assessmentIds : params.practiceIds;
  const byId = new Map(params.allCases.map((c) => [c.id, c]));
  const sessionCases = sessionIds.map((id) => byId.get(id)).filter((c): c is CaseDef => !!c);
  const caseList = sessionCases.length ? sessionCases : [...params.pool];
  return { sessionCases, caseList, currentCase: caseList[params.caseIndex] ?? caseList[0] };
}

/** Kaynak satır 37–46. Tohum 0 ise `now` aynen kullanılır. */
export function planK3SessionRegeneration(params: {
  mode: Mode;
  sessionCasesCount: number;
  seed: number;
  practiceIds: readonly string[];
  assessmentIds: readonly string[];
  pool: readonly CaseDef[];
  now: number;
}): SessionIdPlan | null {
  if (params.sessionCasesCount > 0 || params.mode === "learn") return null;
  const seed = params.seed || params.now;
  const ids = sampleSession([...params.pool], seed, SESSION_SIZE);
  return {
    practiceIds: params.mode === "practice" ? ids : [...params.practiceIds],
    assessmentIds: params.mode === "assessment" ? ids : [...params.assessmentIds],
    seed,
  };
}

/** Kaynak satır 58–61. */
export function simulationPointIds(isAssessment: boolean, assignments: readonly SoundAssignment[]): string[] {
  const list = [...assignments];
  return isAssessment ? assessmentPointFilter(list) : list.map((a) => a.pointId);
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

/** Kaynak satır 158–169. Örneklem tohumu `sessionSeed(now)`; her iki tür `startMode` ile biter. */
export function planSessionAction(params: {
  kind: SessionActionKind;
  mode: Mode;
  practiceIds: readonly string[];
  assessmentIds: readonly string[];
  pool: readonly CaseDef[];
  now: number;
}): SimulationDispatch[] {
  const dispatches: SimulationDispatch[] = [];
  if (params.kind === "resample") {
    const seed = sessionSeed(params.now);
    const ids = sampleSession([...params.pool], seed, SESSION_SIZE);
    const next = resampleActiveMode(
      params.mode,
      { practiceIds: [...params.practiceIds], assessmentIds: [...params.assessmentIds] },
      ids,
    );
    dispatches.push({ type: "startSession", ...next, seed });
  }
  dispatches.push({ type: "startMode", mode: params.mode });
  return dispatches;
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

/** Kaynak satır 67–75. `reportScore` ve `completedAt` raporu S15c uygular. */
export function planSessionCompletion(params: {
  caseIndex: number;
  caseCount: number;
  mode: Mode;
  caseResults: readonly CaseResult[];
  now: number;
}): SessionCompletionPlan | null {
  if (params.caseIndex < params.caseCount) return null;
  const results = [...params.caseResults];
  const reportScore = params.mode === "assessment";
  return {
    aggregate: aggregateResults(results),
    reportScore,
    completedAt: reportScore ? params.now : null,
    dispatch: { type: "setResults", results },
  };
}

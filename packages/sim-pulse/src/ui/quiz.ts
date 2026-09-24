import type { PulseCurriculumItem } from "../data/curriculum";
import { SESSION_COUNT } from "../engine/sample";
import type { EventListenerLike, ListenerTarget, PulseLifecycle } from "../host/lifecycle";

export const QUIZ_SESSION_SIZE = SESSION_COUNT;
const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
const PASS_THRESHOLD = 80;

type QuizChoiceLetter = (typeof OPTION_LETTERS)[number];
type QuizItemLike = Pick<PulseCurriculumItem, "id" | "title" | "question" | "options" | "correct" | "explanations">;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const toChoice = (value: number | null): number | null =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < OPTION_LETTERS.length ? value : null;

export interface QuizFlowView {
  readonly index: number;
  readonly total: number;
  readonly label: string;
  readonly answered: number;
  readonly completed: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly canPrev: boolean;
  readonly canNext: boolean;
}

/** 10 soruluk değerlendirme akışında sayfa/ilerleme durumunu saf olarak üretir. */
export function createQuizFlowView(currentIndex: number, submitted: readonly boolean[], total = QUIZ_SESSION_SIZE): QuizFlowView {
  const safeTotal = Math.max(1, Math.trunc(total));
  const index = clamp(Math.trunc(currentIndex), 0, safeTotal - 1);
  const answered = Array.from({ length: safeTotal }, (_, i) => submitted[i] === true).filter(Boolean).length;
  const completed = answered === safeTotal;
  return {
    index,
    total: safeTotal,
    label: `${index + 1} /${safeTotal}`,
    answered,
    completed,
    isFirst: index === 0,
    isLast: index === safeTotal - 1,
    canPrev: index > 0,
    canNext: index < safeTotal - 1,
  };
}

export interface QuizOptionView {
  readonly index: number;
  readonly letter: QuizChoiceLetter;
  readonly text: string;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly status: "neutral" | "correct" | "wrong";
}

export interface QuizFeedbackView {
  readonly ok: boolean;
  readonly title: "Doğru!" | "Yanlış";
  readonly explanation: string;
  readonly answerLabel: string | null;
  readonly correctLabel: string | null;
}

export interface QuizQuestionView {
  readonly answer: number | null;
  readonly submitted: boolean;
  readonly canSubmit: boolean;
  readonly canContinue: boolean;
  readonly options: readonly QuizOptionView[];
  readonly feedback: QuizFeedbackView | null;
}

/** Pedagojik gereklilik: soru gönderiminden sonra yanıt güncelleme açıktır (kilit yok). */
export function createQuizQuestionView(item: QuizItemLike, answer: number | null, submitted: boolean): QuizQuestionView {
  const selectedAnswer = toChoice(answer);
  const options = item.options.map((text, index) => {
    const selected = selectedAnswer === index;
    return {
      index,
      letter: OPTION_LETTERS[index] ?? "A",
      text,
      selected,
      locked: false,
      status: submitted ? (index === item.correct ? "correct" : selected ? "wrong" : "neutral") : "neutral",
    } satisfies QuizOptionView;
  });
  const canSubmit = selectedAnswer !== null;
  const feedback = submitted && selectedAnswer !== null ? createQuizFeedback(item, selectedAnswer) : null;
  return {
    answer: selectedAnswer,
    submitted,
    canSubmit,
    canContinue: submitted,
    options,
    feedback,
  };
}

function createQuizFeedback(item: QuizItemLike, answer: number): QuizFeedbackView {
  const ok = answer === item.correct;
  const answerLetter = OPTION_LETTERS[answer];
  const correctLetter = OPTION_LETTERS[item.correct];
  return {
    ok,
    title: ok ? "Doğru!" : "Yanlış",
    explanation: item.explanations[item.correct] ?? "",
    answerLabel: answerLetter === undefined ? null : `${answerLetter}. ${item.options[answer] ?? ""}`,
    correctLabel: correctLetter === undefined ? null : `${correctLetter}. ${item.options[item.correct] ?? ""}`,
  };
}

export interface QuizGradeSource {
  readonly ids: readonly string[];
  readonly answers: ReadonlyArray<number | null>;
  readonly submitted: readonly boolean[];
  readonly byId: Readonly<Record<string, Pick<PulseCurriculumItem, "title" | "correct" | "objectiveIds"> | undefined>>;
}

export interface QuizGradeRow {
  readonly index: number;
  readonly id: string;
  readonly title: string;
  readonly area: string;
  readonly submitted: boolean;
  readonly correct: boolean;
}

export interface QuizGradeView {
  readonly rows: readonly QuizGradeRow[];
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly score: number;
  readonly threshold: number;
  readonly passed: boolean;
}

/** Quiz notlandırması: 10 soruda doğru sayısından yüzde puan üretir ve 80 eşiğini uygular. */
export function gradeQuiz(source: QuizGradeSource, total = QUIZ_SESSION_SIZE, threshold = PASS_THRESHOLD): QuizGradeView {
  const safeTotal = Math.max(1, Math.trunc(total));
  const safeThreshold = clamp(Math.trunc(threshold), 0, 100);
  const rows: QuizGradeRow[] = [];
  let answered = 0;
  let correct = 0;
  for (let i = 0; i < safeTotal; i += 1) {
    const id = source.ids[i] ?? `Q${String(i + 1).padStart(3, "0")}`;
    const item = source.byId[id];
    const answer = toChoice(source.answers[i] ?? null);
    const submitted = source.submitted[i] === true && answer !== null;
    const isCorrect = submitted && answer === item?.correct;
    if (submitted) answered += 1;
    if (isCorrect) correct += 1;
    rows.push({
      index: i,
      id,
      title: item?.title ?? id,
      area: item?.objectiveIds[0] ?? "GENEL",
      submitted,
      correct: isCorrect,
    });
  }
  const score = Math.round((correct * 100) / safeTotal);
  return {
    rows,
    total: safeTotal,
    answered,
    correct,
    score,
    threshold: safeThreshold,
    passed: answered === safeTotal && score >= safeThreshold,
  };
}

/** S12 sözleşmesindeki `grade` adı için uyumluluk alias'ı. */
export const grade = gradeQuiz;

function quizFeedbackMarkup(feedback: QuizFeedbackView): string {
  return `<div class="feedback-head ${feedback.ok ? "good" : "bad"}"><h2>${feedback.title}</h2></div>${feedback.ok ? "" : `<p class="feedback-verdict">Yanıtınız: ${feedback.answerLabel ?? "—"}</p><p class="feedback-verdict feedback-verdict-good">Doğru yanıt: ${feedback.correctLabel ?? "—"}</p>`}<p class="feedback-text">${feedback.explanation}</p>`;
}

export interface QuizQuestionMarkupOptions {
  readonly index: number;
  readonly total: number;
  readonly last: boolean;
}

/** Quiz kartı markup'ı; gönderim sonrası güncelleme açık olduğundan seçenekler kilitlenmez. */
export function quizQuestionCardMarkup(item: QuizItemLike, view: QuizQuestionView, options: QuizQuestionMarkupOptions): string {
  const optionMarkup = view.options.map((option) => {
    const classes = [
      "opt",
      option.status === "correct" ? "is-correct" : "",
      option.status === "wrong" ? "is-wrong" : "",
    ].filter(Boolean).join(" ");
    return `<label class="${classes}" role="radio" aria-checked="${option.selected}"><input type="radio" name="activeQuiz" value="${option.index}" ${option.selected ? "checked" : ""}><span class="opt-radio" aria-hidden="true"></span><span class="opt-text">${option.text}</span></label>`;
  }).join("");
  const submitLabel = view.submitted ? "Yanıtı güncelle" : "Yanıtı gönder";
  const nextLabel = options.last ? "Sonuçları gör" : "Sonraki soruya geç";
  const feedbackMarkup = view.feedback === null
    ? '<div class="q-feedback" id="quizFeedback" role="status" aria-live="polite"></div>'
    : `<div class="q-feedback quiz-feedback-v2" id="quizFeedback" role="status" aria-live="polite">${quizFeedbackMarkup(view.feedback)}</div>`;
  return `<article class="q-card-dark" id="quizQuestionCard" aria-labelledby="quizQuestionTitle"><header class="q-head"><span class="eyebrow">DEĞERLENDİRME · ${item.id}</span><span class="q-count">Soru ${Math.trunc(options.index) + 1} / ${Math.max(1, Math.trunc(options.total))}</span></header><fieldset class="q-body"><legend id="quizQuestionTitle">${item.question}</legend>${optionMarkup}</fieldset>${feedbackMarkup}<div class="quiz-actions"><button type="button" class="btn primary" data-quiz-action="submit" ${view.canSubmit ? "" : "disabled"}>${submitLabel}</button><button type="button" class="secondary-btn" data-quiz-action="${options.last ? "results" : "next"}" ${view.canContinue ? "" : "disabled"}>${nextLabel}</button></div></article>`;
}

export const QUIZ_ACTIONS = ["prev", "next", "submit", "results", "reset"] as const;
export type QuizAction = (typeof QUIZ_ACTIONS)[number];

const isQuizAction = (value: unknown): value is QuizAction =>
  typeof value === "string" && (QUIZ_ACTIONS as readonly string[]).includes(value);

export interface QuizActionTarget {
  readonly dataset?: Record<string, string | undefined>;
}

export interface QuizActionEvent {
  readonly target: QuizActionTarget | null;
  preventDefault(): void;
}

export interface BindQuizActionsOptions {
  readonly lifecycle: PulseLifecycle;
  readonly target: ListenerTarget;
  readonly dispatch: (action: QuizAction) => void;
}

export function bindQuizActions(options: BindQuizActionsOptions): void {
  options.lifecycle.listen(options.target, "click", ((event: QuizActionEvent) => {
    const action = event.target?.dataset?.quizAction;
    if (!isQuizAction(action)) return;
    event.preventDefault();
    options.dispatch(action);
  }) as unknown as EventListenerLike);
}

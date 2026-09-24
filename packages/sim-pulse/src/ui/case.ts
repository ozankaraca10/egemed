import type { PulseCurriculumItem } from "../data/curriculum";
import { SESSION_COUNT } from "../engine/sample";
import type { EventListenerLike, ListenerTarget, PulseLifecycle } from "../host/lifecycle";

export const CASE_SESSION_SIZE = SESSION_COUNT;
const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
const FEEDBACK_ICONS = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none"/><path d="m8 12.5 2.6 2.6L16.5 9"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
} as const;

type CaseChoiceLetter = (typeof OPTION_LETTERS)[number];
type CaseItemLike = Pick<PulseCurriculumItem, "id" | "title" | "question" | "options" | "correct" | "explanations">;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const toChoice = (value: number | null): number | null => Number.isInteger(value) && (value as number) >= 0 && (value as number) < OPTION_LETTERS.length ? value : null;

export interface CaseFlowView {
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

/** 10 vakalık akışta pager, ilerleme ve tamamlanma durumunu saf olarak hesaplar. */
export function createCaseFlowView(currentIndex: number, submitted: readonly boolean[], total = CASE_SESSION_SIZE): CaseFlowView {
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

export interface CaseOptionView {
  readonly index: number;
  readonly letter: CaseChoiceLetter;
  readonly text: string;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly suggested: boolean;
  readonly status: "neutral" | "correct" | "wrong";
}

export interface CaseFeedbackView {
  readonly ok: boolean;
  readonly title: "Doğru!" | "Yanlış";
  readonly explanation: string;
  readonly answerLabel: string | null;
  readonly correctLabel: string | null;
  readonly wrongReason: string | null;
}

export interface CaseQuestionView {
  readonly answer: number | null;
  readonly submitted: boolean;
  readonly canSubmit: boolean;
  readonly canContinue: boolean;
  readonly canOpenSimulator: boolean;
  readonly options: readonly CaseOptionView[];
  readonly feedback: CaseFeedbackView | null;
}

/** Kilit (submitted) durumu ile öneri (suggested) durumunu kasıtlı olarak ayrık taşır. */
export function createCaseQuestionView(
  item: CaseItemLike,
  answer: number | null,
  submitted: boolean,
  suggested: number | null = null,
): CaseQuestionView {
  const selectedAnswer = toChoice(answer);
  const suggestedAnswer = toChoice(suggested);
  const options = item.options.map((text, index) => {
    const selected = selectedAnswer === index;
    return {
      index,
      letter: OPTION_LETTERS[index] ?? "A",
      text,
      selected,
      locked: submitted,
      suggested: !submitted && suggestedAnswer === index,
      status: submitted ? (index === item.correct ? "correct" : selected ? "wrong" : "neutral") : "neutral",
    } satisfies CaseOptionView;
  });
  const canSubmit = !submitted && selectedAnswer !== null;
  const feedback = submitted && selectedAnswer !== null ? createCaseFeedback(item, selectedAnswer) : null;
  return {
    answer: selectedAnswer,
    submitted,
    canSubmit,
    canContinue: submitted,
    canOpenSimulator: submitted && selectedAnswer === item.correct,
    options,
    feedback,
  };
}

function createCaseFeedback(item: CaseItemLike, answer: number): CaseFeedbackView {
  const ok = answer === item.correct;
  const answerLetter = OPTION_LETTERS[answer];
  const correctLetter = OPTION_LETTERS[item.correct];
  return {
    ok,
    title: ok ? "Doğru!" : "Yanlış",
    explanation: item.explanations[item.correct] ?? "",
    answerLabel: answerLetter === undefined ? null : `${answerLetter}. ${item.options[answer] ?? ""}`,
    correctLabel: correctLetter === undefined ? null : `${correctLetter}. ${item.options[item.correct] ?? ""}`,
    wrongReason: ok ? null : item.explanations[answer] ?? "",
  };
}

export interface CaseReportSource {
  readonly ids: readonly string[];
  readonly answers: ReadonlyArray<number | null>;
  readonly submitted: readonly boolean[];
  readonly byId: Readonly<Record<string, Pick<PulseCurriculumItem, "title" | "correct"> | undefined>>;
}

export interface CaseReportRow {
  readonly index: number;
  readonly id: string;
  readonly title: string;
  readonly submitted: boolean;
  readonly correct: boolean;
}

export interface CaseReportView {
  readonly rows: readonly CaseReportRow[];
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly firstWrongIndex: number | null;
}

/** Rapor ve "yanlışları gözden geçir" başlangıç indisinin tek kaynaktan türetimi. */
export function buildCaseReport(source: CaseReportSource, total = CASE_SESSION_SIZE): CaseReportView {
  const safeTotal = Math.max(1, Math.trunc(total));
  const rows: CaseReportRow[] = [];
  let answered = 0;
  let correct = 0;
  let firstWrongIndex: number | null = null;
  for (let i = 0; i < safeTotal; i += 1) {
    const id = source.ids[i] ?? `C${String(i + 1).padStart(3, "0")}`;
    const item = source.byId[id];
    const submitted = source.submitted[i] === true;
    const answer = toChoice(source.answers[i] ?? null);
    const isCorrect = submitted && answer === item?.correct;
    if (submitted) answered += 1;
    if (isCorrect) correct += 1;
    if (submitted && !isCorrect && firstWrongIndex === null) firstWrongIndex = i;
    rows.push({ index: i, id, title: item?.title ?? id, submitted, correct: isCorrect });
  }
  return { rows, total: safeTotal, answered, correct, firstWrongIndex };
}

export function reviewCaseIndex(report: CaseReportView): number {
  return report.firstWrongIndex ?? 0;
}

export interface CaseStageMarkupOptions {
  readonly index: number;
  readonly itemId: string;
  readonly compare: boolean;
  readonly canOpenSimulator: boolean;
  readonly ecgMarkup: string;
}

/** Vaka sahnesi markup'ını üretir; "Simülatörde aç" yalnız doğru gönderimde görünür. */
export function caseStageMarkup(options: CaseStageMarkupOptions): string {
  return `<section class="stage-card" aria-label="Vaka EKG sahnesi"><div class="stage-top"><span class="stage-badge">● Sentetik kayıt</span><span class="stage-id">VAKA ${String(options.index + 1).padStart(2, "0")} /10 · ${options.itemId}</span></div>${options.ecgMarkup}<div class="toolbar case-toolbar"><div class="tool-group"><button type="button" class="tool-btn${options.compare ? " active" : ""}" data-case-action="toggle-compare" aria-pressed="${options.compare}">≋ Normalle karşılaştır</button></div>${options.canOpenSimulator ? '<button type="button" class="secondary-btn" data-case-action="open-simulator">Simülatörde aç ↗</button>' : ""}</div></section>`;
}

function caseFeedbackMarkup(feedback: CaseFeedbackView): string {
  return `<div class="feedback-head ${feedback.ok ? "good" : "bad"}"><span class="ic ${feedback.ok ? "good" : "bad"}" aria-hidden="true">${feedback.ok ? FEEDBACK_ICONS.good : FEEDBACK_ICONS.bad}</span><h2>${feedback.title}</h2></div>${feedback.ok ? "" : `<p class="feedback-verdict">Yanıtınız: ${feedback.answerLabel ?? "—"}</p><p class="feedback-verdict feedback-verdict-good">Doğru yanıt: ${feedback.correctLabel ?? "—"}</p>`}<p class="feedback-text">${feedback.explanation}</p>${feedback.ok ? "" : `<p class="feedback-text">Seçtiğiniz seçenek neden değil: ${feedback.wrongReason ?? ""}</p>`}`;
}

export interface CaseQuestionMarkupOptions {
  readonly last: boolean;
}

export function caseQuestionCardMarkup(item: CaseItemLike, view: CaseQuestionView, options: CaseQuestionMarkupOptions): string {
  const optionMarkup = view.options.map((option) => {
    const classes = [
      "opt",
      option.status === "correct" ? "is-correct" : "",
      option.status === "wrong" ? "is-wrong" : "",
      option.suggested ? "is-suggested" : "",
      option.locked ? "is-locked" : "",
    ].filter(Boolean).join(" ");
    return `<label class="${classes}" role="radio" aria-checked="${option.selected}"><input type="radio" name="activeCase" value="${option.index}" ${option.selected ? "checked" : ""} ${option.locked ? "disabled" : ""}><span class="opt-radio" aria-hidden="true"></span><span class="opt-text">${option.text}</span></label>`;
  }).join("");

  const actionMarkup = view.submitted
    ? `<button type="button" class="btn primary" data-case-action="continue">${options.last ? "Vakayı tamamla" : "Devam Et"}</button>`
    : `<button type="button" class="btn primary" data-case-action="check" ${view.canSubmit ? "" : "disabled"}>Yanıtla →</button>`;
  const feedbackMarkup = view.feedback === null
    ? '<div class="q-feedback" id="caseFeedback" role="status" aria-live="polite"></div>'
    : `<div class="q-feedback case-feedback-v2" id="caseFeedback" role="status" aria-live="polite">${caseFeedbackMarkup(view.feedback)}</div>`;
  return `<article class="q-card-dark" id="caseQuestionCard" aria-labelledby="caseQuestionTitle"><header class="q-head"><span class="eyebrow">EKG YORUMU · ${item.id}</span><span class="q-count">Soru 1 / 1</span></header><fieldset class="q-body"><legend id="caseQuestionTitle">${item.question}</legend>${optionMarkup}</fieldset>${feedbackMarkup}${actionMarkup}</article>`;
}

export function caseEndMarkup(report: CaseReportView): string {
  const rows = report.rows.map((row) => {
    const stateClass = row.correct ? "ok" : row.submitted ? "no" : "pending";
    const icon = row.correct ? "✓" : row.submitted ? "✗" : "•";
    const verdict = row.correct ? "doğru" : row.submitted ? "yanlış" : "yanıtlanmadı";
    return `<button type="button" class="dot ${stateClass}" data-case-index="${row.index}" aria-label="Vaka ${row.index + 1}: ${row.title} — ${verdict}">${icon}</button>`;
  }).join("");
  return `<article class="case-end" id="caseEnd"><header><span class="eyebrow">VAKA OTURUMU</span><h2>Oturum tamamlandı · ${report.correct}/${report.total} doğru</h2></header><div class="case-end-strip">${rows}</div><div class="case-end-actions"><button type="button" class="secondary-btn" data-case-action="report">Raporu gör →</button><button type="button" class="secondary-btn" data-case-action="review-wrong">Yanlışları gözden geçir</button><button type="button" class="btn primary" data-case-action="assessment">Değerlendirmeye gir →</button><button type="button" class="secondary-btn" data-case-action="new-session">Yeni 10 vaka örneklemi</button><button type="button" class="secondary-btn" data-case-action="retry-session">Aynı vakaları tekrar dene</button></div></article>`;
}

export const CASE_ACTIONS = [
  "check",
  "continue",
  "toggle-compare",
  "open-simulator",
  "report",
  "review-wrong",
  "assessment",
  "new-session",
  "retry-session",
] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

const isCaseAction = (value: unknown): value is CaseAction =>
  typeof value === "string" && (CASE_ACTIONS as readonly string[]).includes(value);

export interface CaseActionTarget {
  readonly dataset?: Record<string, string | undefined>;
}

export interface CaseActionEvent {
  readonly target: CaseActionTarget | null;
  preventDefault(): void;
}

export interface BindCaseActionsOptions {
  readonly lifecycle: PulseLifecycle;
  readonly target: ListenerTarget;
  readonly dispatch: (action: CaseAction) => void;
}

/** S6 kuralına uygun tek listener delegasyonu; lifecycle dispose tüm bağları temizler. */
export function bindCaseActions(options: BindCaseActionsOptions): void {
  options.lifecycle.listen(options.target, "click", ((event: CaseActionEvent) => {
    const action = event.target?.dataset?.caseAction;
    if (!isCaseAction(action)) return;
    event.preventDefault();
    options.dispatch(action);
  }) as unknown as EventListenerLike);
}

import type { Session } from "../engine/state";
import type { QuizGradeView } from "./quiz";

export const RESULTS_PASS_THRESHOLD = 80;
export const RESULTS_CSV_DELIMITER = ";";

export interface ResultsSummaryView {
  readonly score: number;
  readonly correct: number;
  readonly answered: number;
  readonly total: number;
  readonly threshold: number;
  readonly passed: boolean;
  readonly completion: "passed" | "failed";
  readonly title: "Başarılı" | "Hedefin altında";
}

export interface ResultsAreaRow {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly score: number;
}

export interface QuizResultsView {
  readonly summary: ResultsSummaryView;
  readonly areas: readonly ResultsAreaRow[];
  readonly rows: QuizGradeView["rows"];
}

interface MutableAreaBucket {
  readonly key: string;
  readonly label: string;
  total: number;
  answered: number;
  correct: number;
}

/** Quiz notunu alan (objective) kırılımına döker; default etiket alan anahtarıdır. */
export function buildQuizResultsView(
  grade: QuizGradeView,
  labels: Readonly<Record<string, string>> = {},
  threshold = RESULTS_PASS_THRESHOLD,
): QuizResultsView {
  const safeThreshold = Math.max(0, Math.min(100, Math.trunc(threshold)));
  const areas = new Map<string, MutableAreaBucket>();
  for (const row of grade.rows) {
    const key = row.area || "GENEL";
    const bucket = areas.get(key) ?? { key, label: labels[key] ?? key, total: 0, answered: 0, correct: 0 };
    bucket.total += 1;
    if (row.submitted) bucket.answered += 1;
    if (row.correct) bucket.correct += 1;
    areas.set(key, bucket);
  }
  const summaryScore = grade.score;
  const summary: ResultsSummaryView = {
    score: summaryScore,
    correct: grade.correct,
    answered: grade.answered,
    total: grade.total,
    threshold: safeThreshold,
    passed: grade.answered === grade.total && summaryScore >= safeThreshold,
    completion: grade.answered === grade.total && summaryScore >= safeThreshold ? "passed" : "failed",
    title: grade.answered === grade.total && summaryScore >= safeThreshold ? "Başarılı" : "Hedefin altında",
  };
  return {
    summary,
    areas: [...areas.values()]
      .map((bucket) => ({
        ...bucket,
        score: bucket.total === 0 ? 0 : Math.round((bucket.correct * 100) / bucket.total),
      }))
      .sort((a, b) => a.key.localeCompare(b.key, "tr")),
    rows: grade.rows,
  };
}

/**
 * CSV hücresi: `=`,`+`,`-`,`@`, tab veya CR ile başlayan değer formül
 * sayılmasın diye tek tırnakla kaçırılır.
 */
export function escapeResultsCsvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, "\"\"")}"` : guarded;
}

export interface BuildResultsCsvOptions {
  readonly includeBom?: boolean;
}

/** Sonuç özetini ve soru kırılımını tek CSV metnine dönüştürür. */
export function buildResultsCsv(results: QuizResultsView, options: BuildResultsCsvOptions = {}): string {
  const lines: string[] = [];
  lines.push(["puan", "dogru", "yanitlanan", "toplam", "esik", "durum"]
    .map(escapeResultsCsvCell)
    .join(RESULTS_CSV_DELIMITER));
  lines.push([
    String(results.summary.score),
    String(results.summary.correct),
    String(results.summary.answered),
    String(results.summary.total),
    String(results.summary.threshold),
    results.summary.title,
  ].map(escapeResultsCsvCell).join(RESULTS_CSV_DELIMITER));
  lines.push("");
  lines.push(["alan", "dogru", "yanitlanan", "toplam", "puan"]
    .map(escapeResultsCsvCell)
    .join(RESULTS_CSV_DELIMITER));
  for (const area of results.areas) {
    lines.push([
      area.label,
      String(area.correct),
      String(area.answered),
      String(area.total),
      String(area.score),
    ].map(escapeResultsCsvCell).join(RESULTS_CSV_DELIMITER));
  }
  lines.push("");
  lines.push(["soru_no", "soru_id", "alan", "baslik", "durum"]
    .map(escapeResultsCsvCell)
    .join(RESULTS_CSV_DELIMITER));
  for (const row of results.rows) {
    const status = row.submitted ? (row.correct ? "dogru" : "yanlis") : "yanitlanmadi";
    lines.push([
      String(row.index + 1),
      row.id,
      row.area,
      row.title,
      status,
    ].map(escapeResultsCsvCell).join(RESULTS_CSV_DELIMITER));
  }
  const csv = `${lines.join("\n")}\n`;
  return options.includeBom === false ? csv : `\uFEFF${csv}`;
}

export interface SessionCompletionPayload {
  readonly completion: "passed" | "failed";
  readonly passed: boolean;
  readonly score: number;
  readonly totalScore: number;
  readonly attemptScore: number;
  readonly threshold: number;
}

/** `cardai:session` olayında sözleşmeye uygun score/passed alanlarını taşır. */
export function buildSessionCompletionPayload(summary: ResultsSummaryView): SessionCompletionPayload {
  return {
    completion: summary.completion,
    passed: summary.passed,
    score: summary.score,
    totalScore: summary.score,
    attemptScore: summary.score,
    threshold: summary.threshold,
  };
}

export interface ResetQuizProgressResult {
  readonly quizSession: Session;
  readonly assessed: false;
  readonly score: null;
  readonly attemptScore: null;
  readonly passed: false;
}

/** Sonuç ekranı "reset" akışı: aynı soru setini korur, yanıt/submit/interaction bayraklarını temizler. */
export function resetQuizProgress(quizSession: Session): ResetQuizProgressResult {
  return {
    quizSession: {
      ...quizSession,
      answers: quizSession.answers.map(() => null),
      submitted: quizSession.submitted.map(() => false),
      interactionIndices: quizSession.interactionIndices.map(() => null),
    },
    assessed: false,
    score: null,
    attemptScore: null,
    passed: false,
  };
}

import type { PulsePublicCase, SimCaseResult, SimSessionMode } from "@egemed/contracts";
import type { PulseItem } from "./data";

/**
 * A3.1 (ADR-009): anahtarlı Pulse maddesinden istemciye giden anahtarsız görünüm ve
 * sunucu notlandırması. Seçenekler oturuma özel sırayla karıştırılır ve OPAK
 * jetonlara çevrilir; jeton → özgün indeks eşlemesi (`PulseCaseKeys`) yalnız
 * sunucuda saklanır (tohumlu üreteç yerine kriptografik `newToken`).
 *
 * BİLİNEN SINIR: `ecg.mode` doğru cevabı ele verebilir (tanı soruları). Pulse'ta
 * öğrenci EKG'yi görmek zorundadır ve istemci kaydı `mode`dan üretir; bu yüzden
 * `mode` opak takma adla değil gerçek adıyla gönderilir. A3.3 motor
 * parametrelerini sunucudan göndermeyi değerlendirecek.
 */

export const MASTERY_THRESHOLD = 80;
/** Pulse maddeleri tek soruludur; sabit soru kimliği. */
export const QUESTION_ID = "q";

export interface PulseCaseKeys {
  readonly caseId: string;
  /** jeton → özgün seçenek indeksi (yalnız sunucuda). */
  readonly options: Readonly<Record<string, number>>;
}

export interface BuildCaseInput {
  readonly index: number;
  readonly mode: SimSessionMode;
  readonly openedAt: string;
  /** Kriptografik rastgele opak jeton (ör. base64url 16 bayt). */
  readonly newToken: () => string;
  /** [0,1) rastgele (seçenek sırası); kriptografik kaynaktan türetilmesi önerilir. */
  readonly random: () => number;
}

export function buildPublicCase(item: PulseItem, input: BuildCaseInput): { readonly publicCase: PulsePublicCase; readonly keys: PulseCaseKeys } {
  const order = item.options.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(input.random() * (i + 1));
    const tmp = order[i] as number;
    order[i] = order[j] as number;
    order[j] = tmp;
  }
  const options: Record<string, number> = {};
  const publicOptions = order.map((original) => {
    const token = input.newToken();
    options[token] = original;
    return { id: token, label: item.options[original] as string };
  });
  const publicCase: PulsePublicCase = {
    simId: "pulse",
    index: input.index,
    label: `Vaka ${input.index}`,
    section: item.section,
    stem: item.stem,
    question: item.question,
    vitals: item.vitals.map(({ k, v }) => ({ label: k, value: v })),
    options: publicOptions,
    ecg: {
      mode: item.ecg.mode,
      options: { ...item.ecg.options },
      leads: [...item.ecg.leads],
      start: item.ecg.start,
      seconds: item.ecg.seconds,
    },
    openedAt: input.openedAt,
  };
  return { publicCase, keys: { caseId: item.id, options } };
}

/** Jetonlu yanıtı özgün seçenek indekslerine çevirir; tanınmayan jeton yok sayılır. */
function decodeAnswer(keys: PulseCaseKeys, answer: readonly string[]): number[] {
  return [...new Set(answer)].flatMap((token) => {
    const original = keys.options[token];
    return original === undefined ? [] : [original];
  });
}

/** Özgün seçenek indeksinin jetonu (geri bildirimde doğru seçenek). */
function tokenOf(keys: PulseCaseKeys, originalIndex: number): string[] {
  const token = Object.keys(keys.options).find((key) => keys.options[key] === originalIndex);
  return token === undefined ? [] : [token];
}

/** Yanlışta seçilen şıkkın gerekçesi, doğruda madde geri bildirimi (tek soruluk madde). */
function feedbackFor(item: PulseItem, given: readonly number[], correct: boolean): string {
  if (correct) return item.feedback;
  const chosen = given.length === 1 ? given[0] : undefined;
  const explanation = chosen === undefined ? undefined : item.explanations[chosen];
  return explanation ?? item.feedback;
}

export interface QuestionCheck {
  readonly questionId: string;
  readonly correct: boolean;
  readonly correctOptionIds: string[];
  readonly feedback: string;
}

/** Uygulamada anında geri bildirim (tek soru); jetonlu yanıt anahtarla çözülür. */
export function checkQuestion(item: PulseItem, keys: PulseCaseKeys, answer: readonly string[]): QuestionCheck {
  const given = decodeAnswer(keys, answer);
  const correct = given.length === 1 && given[0] === item.correct;
  return {
    questionId: QUESTION_ID,
    correct,
    correctOptionIds: tokenOf(keys, item.correct),
    feedback: feedbackFor(item, given, correct),
  };
}

/** Pulse'ta ipucu yoktur (uygulamada da değerlendirmede de). */
export function hintFor(): string | null {
  return null;
}

export interface GradeInput {
  readonly index: number;
  readonly mode: SimSessionMode;
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly hintsUsed: number;
}

/** Madde başlığı: "Sentetik vaka C0xx" biçiminde, tanı içermez. */
function titleFor(item: PulseItem): string {
  return item.section === "case" ? `Sentetik vaka ${item.id}` : `Sentetik değerlendirme ${item.id}`;
}

/**
 * Sunucu notlandırması: tek soruluk madde; doğruysa 100, değilse 0. `mode` puanı
 * değiştirmez (Pulse'ta ipucu yok); yüzey uyumu için girdide taşınır.
 */
export function gradeCase(item: PulseItem, keys: PulseCaseKeys, input: GradeInput): SimCaseResult {
  const check = checkQuestion(item, keys, input.answers[QUESTION_ID] ?? []);
  const total = check.correct ? 100 : 0;
  return {
    index: input.index,
    title: titleFor(item),
    diagnosis: null,
    summary: item.feedback,
    total,
    max: 100,
    mastery: total >= MASTERY_THRESHOLD,
    domains: { recognition: { earned: total, max: 100 } },
    hintsUsed: input.hintsUsed,
    questions: [check],
  };
}

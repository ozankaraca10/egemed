import type { OpacaPublicCase, SimCaseResult, SimSessionMode, SimTelemetry } from "@egemed/contracts";
import { ZONES, imageById } from "./data";
import { isAnswerCorrect, practiceAdjusted, scoreCase } from "./scoring";
import type { CaseDef, Question, Telemetry } from "./types";

/**
 * A2.1 (ADR-009): anahtarlı vakadan istemciye giden anahtarsız görünüm ve sunucu
 * notlandırması. Görüntü yolları ve seçenek kimlikleri oturuma özel OPAK jetonlara
 * çevrilir; jetonlar kriptografik rastgele üreticiyle (enjekte `newToken`) üretilir.
 * Eşleme (`OpacaCaseKeys`) yalnız sunucuda saklanır.
 */

export interface OpacaCaseKeys {
  readonly caseId: string;
  /** Lokalizasyon puanlaması için (uzman kutuları bu kayıttan okunur). */
  readonly imageId: string;
  /** qid → jeton → özgün seçenek kimliği */
  readonly options: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** görüntü/kare jetonu → çalışma zamanı yol (istemciye asla gitmez) */
  readonly images: Readonly<Record<string, string>>;
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

/** Vaka `objectives` metinleri tanı içerdiğinden gönderilmez; yalnız genel yönergeler. */
const PUBLIC_TASKS = ["Grafiyi sistematik (ABCDE) okuyun.", "Soruları yanıtlayın."] as const;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

export function buildPublicCase(caseDef: CaseDef, input: BuildCaseInput): { readonly publicCase: OpacaPublicCase; readonly keys: OpacaCaseKeys } {
  const record = imageById(caseDef.imageId);
  if (record === undefined) throw new Error(`opaca görüntü kaydı yok: ${caseDef.imageId}`);
  const images: Record<string, string> = {};
  const imageToken = input.newToken();
  images[imageToken] = record.runtimeUrl;
  const stack = record.stack?.map((group) => {
    const frames = group.frames.map((frame) => {
      const token = input.newToken();
      images[token] = frame;
      return token;
    });
    return { window: group.window, ...(group.label === undefined ? {} : { label: group.label }), frames };
  });
  const options: Record<string, Record<string, string>> = {};
  const questions = caseDef.questions.map((question: Question) => {
    const tokens: Record<string, string> = {};
    const mapped = shuffled(question.options, input.random).map((option) => {
      const token = input.newToken();
      tokens[token] = option.id;
      return { id: token, label: option.label };
    });
    options[question.id] = tokens;
    return {
      id: question.id,
      type: question.type,
      domain: question.domain,
      prompt: question.prompt,
      ...(question.help === undefined ? {} : { help: question.help }),
      multiple: question.correct.length > 1,
      hintAvailable: !!question.hint && input.mode === "practice",
      options: mapped,
    };
  });
  const publicCase: OpacaPublicCase = {
    simId: "opaca",
    index: input.index,
    label: `Vaka ${input.index}`,
    patient: { age: caseDef.patient.age, sex: caseDef.patient.sex },
    population: caseDef.population === "pediatrik" ? "pediatrik" : null,
    chiefComplaint: caseDef.chiefComplaint,
    history: caseDef.history,
    vitalSigns: { ...caseDef.vitalSigns },
    tasks: [...PUBLIC_TASKS],
    image: {
      token: imageToken,
      width: record.width,
      height: record.height,
      modality: record.modality ?? "XR",
      bodyPart: record.bodyPart ?? "toraks",
      ...(stack === undefined || stack.length === 0 ? {} : { stack }),
    },
    questions,
    technique: { requiredZoneCount: caseDef.technique.requiredZones.length, systematicOrder: caseDef.technique.systematicOrder === true },
    openedAt: input.openedAt,
  };
  return { publicCase, keys: { caseId: caseDef.id, imageId: caseDef.imageId, options, images } };
}

/** Jetonlu yanıtı özgün değerlere çevirir; lokalizasyon işareti (`pt:`) aynen geçer,
 *  tanınmayan jeton yok sayılır. */
function decodeAnswers(keys: OpacaCaseKeys, answers: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const decoded: Record<string, string[]> = {};
  for (const [qid, values] of Object.entries(answers)) {
    const map = keys.options[qid];
    if (map === undefined) continue;
    decoded[qid] = [...new Set(values)].flatMap((value) => {
      const mapped = map[value];
      if (mapped !== undefined) return [mapped];
      return value.startsWith("pt:") ? [value] : [];
    });
  }
  return decoded;
}

/** Özgün seçenek kimliğini jetona çevirir (geri bildirimde doğru seçenekler). */
function encodeOption(keys: OpacaCaseKeys, qid: string, optionId: string): string | null {
  const map = keys.options[qid] ?? {};
  return Object.keys(map).find((token) => map[token] === optionId) ?? null;
}

/** Sözleşme telemetrisi (Ausculta biçimi; `simTelemetrySchema`) opaca skorlayıcısına uyarlanır.
 *  Skor yalnız `visits.dwellMs` ve `order` kullanır; araç kullanımı sözleşmede henüz yoktur. */
function toTelemetry(telemetry: SimTelemetry): Telemetry {
  return {
    visits: telemetry.visits,
    order: telemetry.order,
    toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 },
  };
}

export interface GradeInput {
  readonly index: number;
  readonly mode: SimSessionMode;
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly telemetry: SimTelemetry;
  readonly hintsUsed: number;
}

/** Sunucu notlandırması: `scoreCase` (anahtarlı) + soru başına geri bildirim (jetonlu doğru seçenekler). */
export function gradeCase(caseDef: CaseDef, keys: OpacaCaseKeys, input: GradeInput): SimCaseResult {
  const result = scoreCase(caseDef, decodeAnswers(keys, input.answers), toTelemetry(input.telemetry), input.hintsUsed, imageById(keys.imageId), [...ZONES]);
  const total = input.mode === "practice" ? practiceAdjusted(result.total, input.hintsUsed) : result.total;
  return {
    index: input.index,
    title: caseDef.title,
    diagnosis: caseDef.clinicalDiagnosis,
    summary: caseDef.feedback.summary,
    total,
    max: result.max,
    mastery: result.mastery,
    // sorusu olmayan alanlar (max = 0) sonuçta taşınmaz
    domains: Object.fromEntries(
      Object.entries(result.domains)
        .filter(([, value]) => value.max > 0)
        .map(([key, value]) => [key, { earned: value.earned, max: value.max }]),
    ),
    hintsUsed: input.hintsUsed,
    questions: caseDef.questions.map((question) => {
      const answer = result.answers.find((entry) => entry.qid === question.id);
      const correct = answer?.correct === true;
      return {
        questionId: question.id,
        correct,
        correctOptionIds: question.correct.flatMap((optionId) => {
          const token = encodeOption(keys, question.id, optionId);
          return token === null ? [] : [token];
        }),
        feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
      };
    }),
  };
}

/** Uygulamada ipucu metni (değerlendirmede yoktur). */
export function hintFor(caseDef: CaseDef, questionId: string): string | null {
  return caseDef.questions.find((question) => question.id === questionId)?.hint ?? null;
}

/** Uygulamada tek soru kontrolü (anında geri bildirim). Soru yoksa null; lokalizasyon
 *  işareti uzman kutusuna göre ölçülür. */
export function checkQuestion(
  caseDef: CaseDef,
  keys: OpacaCaseKeys,
  questionId: string,
  answer: readonly string[],
): { readonly questionId: string; readonly correct: boolean; readonly correctOptionIds: string[]; readonly feedback: string } | null {
  const question = caseDef.questions.find((q) => q.id === questionId);
  if (question === undefined) return null;
  const given = decodeAnswers(keys, { [questionId]: answer })[questionId] ?? [];
  const correct = isAnswerCorrect(question, given, imageById(keys.imageId));
  return {
    questionId,
    correct,
    correctOptionIds: question.correct.flatMap((optionId) => {
      const token = encodeOption(keys, questionId, optionId);
      return token === null ? [] : [token];
    }),
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

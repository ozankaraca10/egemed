import type { AuscultaPublicCase, SimCaseResult, SimSessionMode, SimTelemetry } from "@egemed/contracts";
import { assessmentPointFilter, resolveCaseSoundsEx } from "./resolver";
import { practiceAdjusted, scoreCase } from "./scoring";
import type { CaseDef, Question } from "./types";

/**
 * A1 (ADR-009): anahtarlı vakadan istemciye giden anahtarsız görünüm ve sunucu
 * notlandırması. Seçenek ve ses kimlikleri oturuma özel OPAK jetonlara çevrilir;
 * jetonlar kriptografik rastgele üreticiyle (enjekte `newToken`) üretilir — tohumlu
 * üreteç kullanılmaz (tohum kaba kuvvetle çözülüp eşleme geri kazanılabilirdi).
 * Eşleme (`AuscultaCaseKeys`) yalnız sunucuda saklanır.
 */

export interface AuscultaCaseKeys {
  readonly caseId: string;
  /** qid → jeton → özgün seçenek kimliği */
  readonly options: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** ses jetonu → çalışma zamanı ses yolu (istemciye asla gitmez) */
  readonly audio: Readonly<Record<string, { readonly runtimeUrl: string; readonly pointId: string }>>;
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

export function buildPublicCase(caseDef: CaseDef, input: BuildCaseInput): { readonly publicCase: AuscultaPublicCase; readonly keys: AuscultaCaseKeys } {
  const { sounds: records } = resolveCaseSoundsEx(caseDef.soundAssignments);
  // Değerlendirmede bildirimsiz yedek (posterior→anterior) sunumu yapılmaz (O7).
  const pointIds =
    input.mode !== "practice" ? assessmentPointFilter(caseDef.soundAssignments) : caseDef.soundAssignments.map((a) => a.pointId);
  const audio: Record<string, { runtimeUrl: string; pointId: string }> = {};
  const points = pointIds.flatMap((pointId) => {
    const record = records[pointId];
    if (record === null || record === undefined) return [];
    const token = input.newToken();
    audio[token] = { runtimeUrl: record.runtimeUrl, pointId };
    // Tek kayıt; bell/diyafram süzgeci istemcide uygulanır — iki başlık aynı jetonu paylaşır.
    const heads: { bell?: string; diaphragm?: string } = {};
    for (const head of caseDef.allowedHeads) heads[head] = token;
    return [{ pointId, audio: heads }];
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
      multiple: question.type === "multi_choice" || question.type === "sequence" || question.correct.length > 1,
      hintAvailable: input.mode === "practice" && question.hint !== undefined && question.hint.length > 0,
      options: mapped,
    };
  });
  const publicCase: AuscultaPublicCase = {
    simId: "ausculta",
    index: input.index,
    label: `Vaka ${input.index}`,
    patient: { age: caseDef.patient.age, sex: caseDef.patient.sex },
    chiefComplaint: caseDef.chiefComplaint,
    history: caseDef.history,
    vitalSigns: { ...caseDef.vitalSigns },
    tasks: [...caseDef.tasks],
    views: [...caseDef.views],
    allowedHeads: [...caseDef.allowedHeads],
    points,
    questions,
    technique: { minPointsVisited: caseDef.technique.minPointsVisited },
    openedAt: input.openedAt,
  };
  return { publicCase, keys: { caseId: caseDef.id, options, audio } };
}

/** Jetonlu yanıtı özgün seçenek kimliklerine çevirir; tanınmayan jeton yok sayılır. */
function decodeAnswers(keys: AuscultaCaseKeys, answers: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const decoded: Record<string, string[]> = {};
  for (const [qid, tokens] of Object.entries(answers)) {
    const map = keys.options[qid];
    if (map === undefined) continue;
    decoded[qid] = [...new Set(tokens)].flatMap((token) => (map[token] === undefined ? [] : [map[token] as string]));
  }
  return decoded;
}

/** Özgün seçenek kimliğini jetona çevirir (geri bildirimde doğru seçenekler). */
function encodeOption(keys: AuscultaCaseKeys, qid: string, optionId: string): string | null {
  const map = keys.options[qid] ?? {};
  return Object.keys(map).find((token) => map[token] === optionId) ?? null;
}

export interface GradeInput {
  readonly index: number;
  readonly mode: SimSessionMode;
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly telemetry: SimTelemetry;
  readonly hintsUsed: number;
}

/** Sunucu notlandırması: `scoreCase` (anahtarlı) + soru başına geri bildirim (jetonlu doğru seçenekler). */
export function gradeCase(caseDef: CaseDef, keys: AuscultaCaseKeys, input: GradeInput): SimCaseResult {
  const result = scoreCase(caseDef, decodeAnswers(keys, input.answers), input.telemetry, input.hintsUsed);
  const total = input.mode === "practice" ? practiceAdjusted(result.total, input.hintsUsed) : result.total;
  return {
    index: input.index,
    title: caseDef.title,
    diagnosis: caseDef.clinicalDiagnosis,
    summary: caseDef.feedback.summary,
    total,
    max: result.max,
    mastery: result.mastery,
    domains: Object.fromEntries(Object.entries(result.domains).map(([key, value]) => [key, { earned: value.earned, max: value.max }])),
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

/** Uygulamada tek soru kontrolü (anında geri bildirim; A1.4). Soru yoksa null. */
export function checkQuestion(
  caseDef: CaseDef,
  keys: AuscultaCaseKeys,
  questionId: string,
  answer: readonly string[],
): { readonly questionId: string; readonly correct: boolean; readonly correctOptionIds: string[]; readonly feedback: string } | null {
  const question = caseDef.questions.find((q) => q.id === questionId);
  if (question === undefined) return null;
  const given = decodeAnswers(keys, { [questionId]: answer })[questionId] ?? [];
  const correct = question.correct.length > 0 && given.length === question.correct.length && given.every((g) => question.correct.includes(g));
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

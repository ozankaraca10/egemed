import type { OpacaPublicCase, SimCaseResult, SimSessionMode } from "@egemed/contracts";
import type { CaseDef, CaseResult, ImageRecord, Question, QuestionType } from "./types";
import { SESSION_ASSET_PREFIX } from "./images";

/**
 * A2.3 (ADR-009): sunucu vaka oturumu ile istemci arasındaki uyarlayıcılar. Sunucu
 * anahtarsız vaka (`OpacaPublicCase`) gönderir; ekranlar ise `CaseDef` biçimini
 * bekler. Uyarlanmış vakada doğru seçenek, geri bildirim, tanı, ana bulgu ve
 * görüntü kaydı YOKTUR: `correct` boş, geri bildirim sunucu yanıtından gelir,
 * görüntü oturum jetonuyla vekilden çekilir; genişlik/yükseklik/modality/bölge
 * public vakadan gelir, bulgu katmanları (annotation/overlay) hiç taşınmaz.
 */

/** Sunucu vakası kimliği öneki (yerel vaka kimliğiyle karışmaz). */
export const SERVER_CASE_PREFIX = "srv-";
/** Uygulamada ipucu var ama metni henüz istenmedi (araç çubuğu düğmesini göstermek için). */
export const SERVER_HINT_PLACEHOLDER = "İpucu yükleniyor…";

export interface ServerCaseMeta {
  readonly title: string;
  readonly diagnosis: string | null;
  readonly summary: string;
  /** Soru başına doğru seçenek jetonları ve açıklama (yanıttan/bitişten sonra). */
  readonly questions?: Readonly<Record<string, { readonly correctOptionIds: readonly string[]; readonly feedback: string }>>;
}

/** Gönderilen vakanın soru metni/seçenekleri ve verilen yanıtlar (sonuç ekranı ayrıntısı için). */
export interface ServerCaseSnapshot {
  readonly title: string;
  readonly questions: readonly { readonly id: string; readonly prompt: string; readonly options: readonly { readonly id: string; readonly label: string }[] }[];
  readonly given: Readonly<Record<string, readonly string[]>>;
}

export interface ServerQuestionFeedback {
  readonly correct: boolean;
  readonly correctOptionIds: readonly string[];
  readonly feedback: string;
}

export interface ServerSessionState {
  readonly sessionId: string;
  readonly mode: SimSessionMode;
  readonly caseCount: number;
  /** Değerlendirme/düelloda vaka başı süre (ms); uygulamada null. */
  readonly perCaseLimitMs: number | null;
  /** 1 tabanlı yüklü vaka; yüklenmediyse 0. */
  readonly loadedIndex: number;
  readonly currentCase: ServerClientCase | null;
  /** Yüklenmiş istemci vakaları (vaka kimliği → vaka); yalnız sunucudan gelenler. */
  readonly cases: Readonly<Record<string, ServerClientCase>>;
  readonly feedback: Readonly<Record<string, ServerQuestionFeedback>>;
  readonly hints: Readonly<Record<string, string>>;
  readonly metas: Readonly<Record<string, ServerCaseMeta>>;
  readonly snapshots: Readonly<Record<string, ServerCaseSnapshot>>;
  readonly status: "loading" | "ready" | "submitting" | "finished" | "error";
  readonly error: string | null;
}

/** `CaseDef` uyumlu, anahtarsız istemci vakası + sunucu görüntüsü. */
export type ServerClientCase = CaseDef & {
  readonly serverIndex: number;
  /** Görüntüleyicinin kullandığı oturum jetonlu görüntü kaydı (bulgu/işaret katmanı yok). */
  readonly serverImage: ImageRecord;
};

export function serverCaseId(index: number): string {
  return `${SERVER_CASE_PREFIX}${index}`;
}

export function isServerCaseId(id: string): boolean {
  return id.startsWith(SERVER_CASE_PREFIX);
}

/** Anahtarsız görüntüyü görüntüleyicinin beklediği kayda çevirir; adresler oturum jetonludur. */
function serverImageRecord(publicCase: OpacaPublicCase, sessionId: string, imageUrl: (sessionId: string, token: string) => string): ImageRecord {
  const image = publicCase.image;
  const stack = image.stack?.map((group) => ({
    window: group.window,
    ...(group.label === undefined ? {} : { label: group.label }),
    frames: group.frames.map((token) => `${SESSION_ASSET_PREFIX}${imageUrl(sessionId, token)}`),
  }));
  return {
    id: `srv-img-${publicCase.index}`,
    sourceDataset: "session",
    sourceFile: "",
    viewPosition: "unknown",
    ageYears: publicCase.patient.age,
    sex: publicCase.patient.sex === "kadın" ? "F" : publicCase.patient.sex === "erkek" ? "M" : null,
    population: publicCase.population === "pediatrik" ? "pediatrik" : "yetiskin",
    width: image.width,
    height: image.height,
    originalWidth: null,
    originalHeight: null,
    findings: {},
    negatives: {},
    annotations: [],
    quality: null,
    runtimeUrl: `${SESSION_ASSET_PREFIX}${imageUrl(sessionId, image.token)}`,
    bytes: 0,
    validationStatus: "validated",
    clinicalReview: "beklemede",
    issues: [],
    bodyPart: image.bodyPart,
    modality: image.modality,
    ...(stack === undefined || stack.length === 0 ? {} : { stack }),
  };
}

/** Anahtarsız vakayı ekranların beklediği `CaseDef` biçimine çevirir. */
export function toClientCase(
  publicCase: OpacaPublicCase,
  mode: SimSessionMode,
  sessionId: string,
  imageUrl: (sessionId: string, token: string) => string,
): ServerClientCase {
  const questions: Question[] = publicCase.questions.map((question) => ({
    id: question.id,
    type: question.type,
    domain: question.domain,
    prompt: question.prompt,
    ...(question.help === undefined ? {} : { help: question.help }),
    options: question.options.map((option) => ({ id: option.id, label: option.label })),
    correct: [],
    feedbackCorrect: "",
    feedbackIncorrect: "",
    ...(question.hintAvailable ? { hint: SERVER_HINT_PLACEHOLDER } : {}),
  }));
  const serverImage = serverImageRecord(publicCase, sessionId, imageUrl);
  return {
    id: serverCaseId(publicCase.index),
    title: publicCase.label,
    modes: [mode === "practice" ? "practice" : "assessment"],
    population: publicCase.population === "pediatrik" ? "pediatrik" : "yetiskin",
    patient: { ...publicCase.patient },
    chiefComplaint: publicCase.chiefComplaint,
    history: publicCase.history,
    vitalSigns: Object.fromEntries(Object.entries(publicCase.vitalSigns).filter(([, value]) => value !== undefined)) as CaseDef["vitalSigns"],
    objectives: [],
    imageId: serverImage.id,
    primaryFinding: "",
    clinicalDiagnosis: null,
    mappingValidation: "validated",
    technique: { requiredZones: [], minDwellMs: 1, systematicOrder: publicCase.technique.systematicOrder },
    questions,
    feedback: { summary: "" },
    references: [],
    serverIndex: publicCase.index,
    serverImage,
  };
}

/** Sunucu sonucunu ekranların beklediği `CaseResult` biçimine çevirir (+ başlık/tanı/özet). */
export function fromServerResult(result: SimCaseResult): { readonly result: CaseResult; readonly meta: ServerCaseMeta } {
  const domain = (key: string) => result.domains[key] ?? { earned: 0, max: 0 };
  return {
    result: {
      caseId: serverCaseId(result.index),
      total: result.total,
      max: result.max,
      mastery: result.mastery,
      domains: {
        technique: domain("technique"),
        systematic: domain("systematic"),
        quality: domain("quality"),
        localization: domain("localization"),
        recognition: domain("recognition"),
        interpretation: domain("interpretation"),
        diagnosis: domain("diagnosis"),
      },
      answers: result.questions.map((question) => ({ qid: question.questionId, correct: question.correct, given: [] })),
      hintsUsed: result.hintsUsed,
    },
    meta: {
      title: result.title,
      diagnosis: result.diagnosis,
      summary: result.summary,
      questions: Object.fromEntries(
        result.questions.map((question) => [question.questionId, { correctOptionIds: [...question.correctOptionIds], feedback: question.feedback }]),
      ),
    },
  };
}

/** Gönderim anındaki vaka anlık görüntüsü (soru metni, seçenekler, verilen yanıtlar). */
export function snapshotOf(clientCase: ServerClientCase, given: Readonly<Record<string, readonly string[]>>): ServerCaseSnapshot {
  return {
    title: clientCase.title,
    questions: clientCase.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map((option) => ({ id: option.id, label: option.label })),
    })),
    given: Object.fromEntries(Object.entries(given).map(([qid, values]) => [qid, [...values]])),
  };
}

/** Sonuç ekranındaki soru görünümü (sunucu anlık görüntüsü + sonuç meta verisi). */
export interface ServerReviewQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly correct: readonly string[];
  readonly feedbackIncorrect: string;
  /** Lokalizasyon ayrımı için istemci vakasından; vaka yüklü değilse null. */
  readonly type: QuestionType | null;
}

export interface ServerReview {
  readonly title: string;
  readonly questions: readonly ServerReviewQuestion[];
}

/** Sonuç satırı görünümü: gönderim anlık görüntüsü + bitiş meta verisi (A2.3). */
export function reviewOf(server: ServerSessionState, caseId: string): ServerReview {
  const snapshot = server.snapshots[caseId];
  const meta = server.metas[caseId];
  if (snapshot === undefined) return meta === undefined ? { title: caseId, questions: [] } : { title: meta.title, questions: [] };
  const types = server.cases[caseId]?.questions;
  return {
    title: meta?.title ?? snapshot.title,
    questions: snapshot.questions.map((question) => ({
      ...question,
      correct: meta?.questions?.[question.id]?.correctOptionIds ?? [],
      feedbackIncorrect: meta?.questions?.[question.id]?.feedback ?? "",
      type: types?.find((item) => item.id === question.id)?.type ?? null,
    })),
  };
}

/** Değerlendirmede vaka sonucu bitişe dek bilinmez; otomatik ilerleme için yer tutucu. */
export function pendingAssessmentResult(index: number): CaseResult {
  const empty = { earned: 0, max: 0 };
  return {
    caseId: serverCaseId(index),
    total: 0,
    max: 100,
    mastery: false,
    domains: { technique: empty, systematic: empty, quality: empty, localization: empty, recognition: empty, interpretation: empty, diagnosis: empty },
    answers: [],
    hintsUsed: 0,
  };
}

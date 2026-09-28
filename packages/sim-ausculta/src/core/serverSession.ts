import type { AuscultaPublicCase, SimCaseResult, SimSessionMode } from "@egemed/contracts";
import type { CaseDef, CaseResult, Question, SoundRecord } from "./types";

/**
 * A1.4 (ADR-009): sunucu vaka oturumu ile istemci arasındaki uyarlayıcılar. Sunucu
 * anahtarsız vaka (`AuscultaPublicCase`) gönderir; ekranlar ise `CaseDef` biçimini
 * bekler. Uyarlanmış vakada doğru seçenek, geri bildirim, tanı ve ses dosyası YOKTUR:
 * `correct` boş, geri bildirim sunucu yanıtından gelir, ses oturum jetonuyla çalınır.
 */

/** Sunucu vakası kimliği öneki (yerel vaka kimliğiyle karışmaz). */
export const SERVER_CASE_PREFIX = "srv-";
/** Sunucu ses adresi işareti (SimModule `resolveAuscultaAssetUrl` aynen geçirir). */
export const SESSION_AUDIO_PREFIX = "egemed-session:";
/** Uygulamada ipucu var ama metni henüz istenmedi (araç çubuğu düğmesini göstermek için). */
export const SERVER_HINT_PLACEHOLDER = "İpucu yükleniyor…";

export interface ServerCaseMeta {
  readonly title: string;
  readonly diagnosis: string | null;
  readonly summary: string;
  /** T214: sunucunun vaka bittiğinde döndürdüğü öğrenme kütüphanesi odak anahtarı
   *  (ör. "heart.normal"); eşleşme yoksa null. Vaka açılışında gelmez. */
  readonly libraryKey?: string | null;
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
  /** 1 tabanlı yüklü vaka; yüklenmediyse 0. */
  readonly loadedIndex: number;
  readonly currentCase: ServerClientCase | null;
  readonly feedback: Readonly<Record<string, ServerQuestionFeedback>>;
  readonly hints: Readonly<Record<string, string>>;
  readonly metas: Readonly<Record<string, ServerCaseMeta>>;
  readonly snapshots: Readonly<Record<string, ServerCaseSnapshot>>;
  readonly status: "loading" | "ready" | "submitting" | "finished" | "error";
  readonly error: string | null;
}

/** `CaseDef` uyumlu, anahtarsız istemci vakası + sunucu ses jetonları. */
export type ServerClientCase = CaseDef & {
  readonly serverIndex: number;
  /** nokta kimliği → oturum ses jetonu */
  readonly serverAudio: Readonly<Record<string, string>>;
  /** §14 dürüstlük: karma vakada akciğer bileşeninin gerçek kaydı çalınan posterior noktalar. */
  readonly serverComponents: Readonly<Record<string, "lung">>;
  readonly population?: string;
};

export function serverCaseId(index: number): string {
  return `${SERVER_CASE_PREFIX}${index}`;
}

export function isServerCaseId(id: string): boolean {
  return id.startsWith(SERVER_CASE_PREFIX);
}

/** Anahtarsız vakayı ekranların beklediği `CaseDef` biçimine çevirir. */
export function toClientCase(publicCase: AuscultaPublicCase, mode: SimSessionMode): ServerClientCase {
  const questions: Question[] = publicCase.questions.map((question) => ({
    id: question.id,
    type: question.type,
    domain: question.domain === "quality" ? "recognition" : question.domain,
    prompt: question.prompt,
    ...(question.help === undefined ? {} : { help: question.help }),
    options: question.options.map((option) => ({ id: option.id, label: option.label })),
    correct: [],
    feedbackCorrect: "",
    feedbackIncorrect: "",
    ...(question.hintAvailable ? { hint: SERVER_HINT_PLACEHOLDER } : {}),
  }));
  const serverAudio: Record<string, string> = {};
  const serverComponents: Record<string, "lung"> = {};
  for (const point of publicCase.points) {
    const token = point.audio.diaphragm ?? point.audio.bell;
    if (token !== undefined) serverAudio[point.pointId] = token;
    if (point.component !== undefined) serverComponents[point.pointId] = point.component;
  }
  return {
    id: serverCaseId(publicCase.index),
    title: publicCase.label,
    modes: [mode === "practice" ? "practice" : "assessment"],
    patient: { ...publicCase.patient },
    chiefComplaint: publicCase.chiefComplaint,
    history: publicCase.history,
    vitalSigns: Object.fromEntries(Object.entries(publicCase.vitalSigns).filter(([, value]) => value !== undefined)) as CaseDef["vitalSigns"],
    objectives: [],
    tasks: [...publicCase.tasks],
    views: [...publicCase.views],
    allowedHeads: [...publicCase.allowedHeads],
    soundAssignments: [],
    primaryAcousticFinding: "",
    clinicalDiagnosis: null,
    mappingValidation: "validated",
    technique: { requiredPoints: [], minPointsVisited: publicCase.technique.minPointsVisited, minDwellMs: 0, minListenMsPerPoint: 0 },
    questions,
    feedback: { summary: "" },
    references: [],
    serverIndex: publicCase.index,
    serverAudio,
    serverComponents,
    ...(publicCase.population === "pediatrik" ? { population: "pediatrik" } : {}),
  };
}

/** Sunucu vakasındaki nokta sırası (atanmış noktalar). */
export function serverPointIds(clientCase: ServerClientCase): string[] {
  return Object.keys(clientCase.serverAudio);
}

/** Motorun beklediği yalın kayıt: yalnız `id` ve `runtimeUrl` kullanılır. */
export function serverSoundRecord(pointId: string, token: string, url: string): SoundRecord {
  return {
    id: `${SERVER_CASE_PREFIX}${token}`,
    category: pointId.startsWith("cardiac") ? "heart" : "lung",
    acousticFinding: "",
    sourceDataset: "session",
    sourceFile: "",
    durationSec: 0,
    sampleRate: 0,
    channels: 1,
    peak: 0,
    rms: 0,
    recordedLocation: "",
    anatomicalLocation: "",
    simulationLocation: pointId,
    nativeFilter: "",
    gender: "any",
    runtimeUrl: `${SESSION_AUDIO_PREFIX}${url}`,
    validationStatus: "validated",
    gainApplied: 0,
    rmsNormalized: 0,
    peakNormalized: 0,
    issues: [],
  } as unknown as SoundRecord;
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
        localization: domain("localization"),
        recognition: domain("recognition"),
        interpretation: domain("interpretation"),
        diagnosis: domain("diagnosis"),
        systematic: domain("systematic"),
      },
      answers: result.questions.map((question) => ({ qid: question.questionId, correct: question.correct, given: [] })),
      hintsUsed: result.hintsUsed,
    },
    meta: {
      title: result.title,
      diagnosis: result.diagnosis,
      summary: result.summary,
      libraryKey: result.libraryKey ?? null,
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

/** Değerlendirmede vaka sonucu bitişe dek bilinmez; otomatik ilerleme için yer tutucu. */
export function pendingAssessmentResult(index: number): CaseResult {
  const empty = { earned: 0, max: 0 };
  return {
    caseId: serverCaseId(index),
    total: 0,
    max: 100,
    mastery: false,
    domains: { technique: empty, localization: empty, recognition: empty, interpretation: empty, diagnosis: empty, systematic: empty },
    answers: [],
    hintsUsed: 0,
  };
}

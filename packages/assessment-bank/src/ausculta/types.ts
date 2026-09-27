/**
 * Ausculta vaka tipleri — SUNUCU TARAFI kopya (A1, ADR-009). Anahtarlı vaka
 * tanımı yalnız bu pakette yaşar; A1.4'te sim paketindeki karşılıkları kaldırılır.
 * Kaynak: packages/sim-ausculta/src/core/types.ts (27 Eyl 2026).
 */

export type Mode = "learn" | "practice" | "assessment";
export type PatientView = "front" | "back";
export type StethHead = "bell" | "diaphragm";
export type ValidationStatus = "validated" | "educational_mapping" | "experimental";
export type SoundCategory = "heart" | "lung" | "mixed";

/** Bir noktaya atanacak ses arama şartı (id verilmezse resolver deterministik seçer) */
/** sounds.json kaydı (import üretimi) */
export interface SoundRecord {
  id: string;
  category: SoundCategory;
  acousticFinding: string;
  heartFinding?: string;
  lungFinding?: string;
  sourceDataset: string;
  sourceFile: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  peak: number;
  rms: number;
  recordedLocation: string;
  anatomicalLocation: string;
  simulationLocation: string | null;
  nativeFilter: "digital_filtered" | "bell" | "diaphragm" | "midrange" | "unspecified";
  gender: string;
  runtimeUrl: string;
  validationStatus: "validated" | "missing_asset";
  issues: string[];
}

export interface SoundsManifest {
  generatedAt: string;
  dataset: {
    id: string;
    title: string;
    doi: string;
    articleDoi: string;
    license: string;
    authors: string[];
  };
  count: number;
  records: SoundRecord[];
}

/** auscultation-points.json */

/** Bir noktaya atanacak ses arama şartı */
export interface SoundAssignment {
  pointId: string;
  category: SoundCategory;
  acousticFinding: string;
  recordedLocation?: string;
  gender?: "M" | "F" | "any";
  soundId?: string;
}

/** Soru tipi (§23) */
export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "sound_identify"
  | "localization"
  | "bell_diaphragm"
  | "interpretation"
  | "diagnosis"
  | "sequence";

export type QuestionDomain = "recognition" | "localization" | "interpretation" | "diagnosis";

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  domain: QuestionDomain;
  prompt: string;
  help?: string;
  options: QuestionOption[];
  correct: string[];
  feedbackCorrect: string;
  feedbackIncorrect: string;
  hint?: string;
}

/** Teknik rubriği (telemetri kaynaklı) */
export interface TechniqueRubric {
  requiredPoints: string[];
  minPointsVisited: number;
  minDwellMs: number;
  minListenMsPerPoint: number;
  systematicOrder?: boolean;
}

export interface ScoringWeights {
  technique: number;
  localization: number;
  recognition: number;
  interpretation: number;
  diagnosis: number;
  systematic: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  technique: 20,
  localization: 20,
  recognition: 25,
  interpretation: 20,
  diagnosis: 10,
  systematic: 5,
};

export interface VitalSigns {
  hr?: number;
  rr?: number;
  bp?: string;
  spo2?: number;
  temp?: string;
}

export interface CaseDef {
  id: string;
  title: string;
  modes: Mode[];
  patient: { age: number; sex: "kadın" | "erkek" };
  chiefComplaint: string;
  history: string;
  vitalSigns: VitalSigns;
  objectives: string[];
  tasks: string[];
  views: PatientView[];
  allowedHeads: StethHead[];
  soundAssignments: SoundAssignment[];
  /** Akustik ana bulgu — tanıdan bağımsız (§6) */
  primaryAcousticFinding: string;
  /** Klinik tanı ancak doğrulanmış eşlemeyle doldurulur (§6) */
  clinicalDiagnosis: string | null;
  /** diagnosis alanı için eşleme doğrulama durumu (§19) */
  /** hekim onay durumu: 'beklemede' | 'onayli' */
  clinicalReview?: "beklemede" | "onayli";
  mappingValidation: ValidationStatus;
  mappingNote?: string;
  technique: TechniqueRubric;
  questions: Question[];
  feedback: { summary: string; differential?: string; techniqueNotes?: string };
  references: string[];
  scoringWeights?: Partial<ScoringWeights>;
  /** Öğrenme modu kütüphane bağlantısı */
  libraryKey?: string;
  masteryThreshold?: number;
}

/** vaka çalışması raporu (results) */
export interface CaseResult {
  caseId: string;
  total: number;
  max: number;
  mastery: boolean;
  domains: Record<keyof ScoringWeights, { earned: number; max: number }>;
  answers: { qid: string; correct: boolean; given: string[] }[];
  hintsUsed: number;
}

export interface PointVisit {
  dwellMs: number;
  listenMs: number;
  visits: number;
  firstOrder: number;
}

export interface Telemetry {
  visits: Record<string, PointVisit>;
  order: string[];
  headChanges: number;
  headUse: Record<StethHead, number>;
  replayCount: number;
}

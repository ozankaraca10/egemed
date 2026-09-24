import type { SimulatorId } from "@egemed/sim-host";
import fixture from "./data/fixture.json";

export const SIM_ID = "ausculta" satisfies SimulatorId;

export const JSON_FIXTURE = fixture;

export { DEFAULT_WEIGHTS } from "./core/types";
export {
  HINT_PENALTY_PRACTICE,
  MASTERY_THRESHOLD,
  aggregateResults,
  practiceAdjusted,
  scoreCase,
} from "./core/scoring";
export {
  countUnlistenedInOtherView,
  firstWeakLibraryKey,
  libraryKeyForCase,
  nextActionForSubmit,
  otherViewHintText,
  regionChipState,
  resampleActiveMode,
  tutorialProgress,
  weakDomainKeys,
} from "./core/flow";
export type { RegionChipVisualState, SubmitAction, TutorialEvent, TutorialProgress } from "./core/flow";
export { SUSPEND_LIMIT_12, SUSPEND_LIMIT_2004, deserializeSuspend, serializeSuspend } from "./core/suspend";
export type {
  AuscultationPoint,
  CaseDef,
  CaseResult,
  Mode,
  PatientView,
  PointVisit,
  Question,
  QuestionDomain,
  QuestionOption,
  QuestionType,
  RuntimeFlags,
  ScoringWeights,
  Screen,
  SimEvent,
  SoundAssignment,
  SoundCategory,
  SoundRecord,
  SoundsManifest,
  StethHead,
  SuspendPayload,
  TechniqueRubric,
  Telemetry,
  ValidationStatus,
  VitalSigns,
} from "./core/types";

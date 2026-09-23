import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "opaca" satisfies SimulatorId;

export { isAnswerCorrect } from "./core/answers";
export { DEFAULT_WEIGHTS, EXPERT_SOURCES } from "./core/types";
export type {
  AbcdeStep,
  Annotation,
  BodyPart,
  Box,
  CaseDef,
  CaseResult,
  ImageRecord,
  ImagesManifest,
  LabelSource,
  Modality,
  Mode,
  Population,
  Question,
  QuestionDomain,
  QuestionOption,
  QuestionType,
  ReadingZone,
  RuntimeFlags,
  ScoringWeights,
  Screen,
  SimEvent,
  SuspendPayload,
  TechniqueRubric,
  Telemetry,
  ValidationStatus,
  ViewerTool,
  ViewPosition,
  VitalSigns,
  ZoneVisit,
} from "./core/types";

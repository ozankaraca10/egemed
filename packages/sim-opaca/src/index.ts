import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "opaca" satisfies SimulatorId;

export { isAnswerCorrect } from "./core/answers";
export {
  MARK_CENTER_DISTANCE_FRACTION,
  MARK_RADIUS_SHORT_EDGE_FRACTION,
  MAX_LOCALIZATION_BOX_AREA,
  boxArea,
  clamp,
  decodeMark,
  encodeMark,
  inBox,
  markHitsBox,
  markHitsFinding,
  markRadiusNorm,
  markToScorm,
  nearestFindingBoxCenter,
  ratio,
  zonesAt,
} from "./core/geometry";
export type { Point } from "./core/geometry";
export { HINT_PENALTY_PRACTICE, MASTERY_THRESHOLD, aggregateResults, practiceAdjusted, scoreCase } from "./core/scoring";
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

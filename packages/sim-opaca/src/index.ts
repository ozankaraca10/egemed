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
export { IMAGES, datasetCounts, examplesFor, expertPositive, getImage, isExpertSource } from "./core/images";
export { HINT_PENALTY_PRACTICE, MASTERY_THRESHOLD, aggregateResults, practiceAdjusted, scoreCase } from "./core/scoring";
export { filterAssessmentPool, validateCase } from "./core/validation";
export type { ValidationIssue } from "./core/validation";
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
export { ALL_CASES, AUTO_CASES, CORE_CASES, poolFor } from "./data/pool";
export { computeMetrics } from "./data/metrics";
export type { InventoryMetrics } from "./data/metrics";
export {
  FINDINGS,
  LABEL_SOURCE_TEXT,
  LIBRARY_GROUPS,
  LIBRARY_ITEMS,
  VIEW_TEXT,
  findingLabel,
  findingShort,
  libraryItem,
  libraryKeyForFinding,
} from "./data/terminology";
export type {
  FindingDef,
  InterpretationTemplate,
  LibraryGroup,
  LibraryItem,
  UcepMapping,
} from "./data/terminology";
export { STEP_TITLES, ZONES, ZONE_IDS, zoneById } from "./data/zones";

import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "pulse" satisfies SimulatorId;

export { BeatEngine } from "./engine/beats";
export type { AfProfile, Beat, BeatOptions, Checkpoint } from "./engine/beats";
export { CardiacModel } from "./engine/model";
export type { CardiacMetrics, CardiacSnapshot, MechanicalTimeline } from "./engine/model";
export { createCryptoRandomInt, createSeededRandomInt } from "./engine/rng";
export type { CryptoLike, RandomInt } from "./engine/rng";
export { createSessionId, sample } from "./engine/sample";
export { curriculumIndex, explanationsFor, freeze, optionsFor, seededPermutation } from "./engine/curriculumIndex";
export type { CurriculumBank } from "./engine/curriculumIndex";
export {
  LEADS,
  MODES,
  NO_P,
  SHAPES,
  anteriorST,
  bell,
  clamp,
  fiducials,
  hash,
  inferiorST,
  interpolate,
  leadShape,
  limb,
  pShape,
  tShape,
} from "./engine/shapes";
export type { Fiducials, Lead, LeadShape, Limb, Mode, ShapeKey, WaveformPoint } from "./engine/shapes";
export { ACTIVE_VIEWS, MAX_STATE_BYTES, SESSION_COUNT, STATE_VERSION, blank, decode, derive, encode } from "./engine/state";
export type { ActiveView, CurriculumItem, PulseCurriculum, PulseState, Section, Session, StateContext } from "./engine/state";

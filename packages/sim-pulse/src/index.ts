import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "pulse" satisfies SimulatorId;

export { BeatEngine } from "./engine/beats";
export type { AfProfile, Beat, BeatOptions, Checkpoint } from "./engine/beats";
export { CardiacModel } from "./engine/model";
export type { CardiacMetrics, CardiacSnapshot, MechanicalTimeline } from "./engine/model";
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

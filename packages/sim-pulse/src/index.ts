import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "pulse" satisfies SimulatorId;

export { getRootFlag, query, setRootFlag } from "./host/dom";
export type { PulseRoot } from "./host/dom";
export { createPulseEventEmitter, PULSE_EVENT_NAMES } from "./host/events";
export type {
  PulseEventEmitter,
  PulseEventListener,
  PulseEventName,
  PulseEventPayloads,
  PulseUnsubscribe,
} from "./host/events";
export { createPulseLifecycle } from "./host/lifecycle";
export type {
  AbortControllerLike,
  AbortSignalLike,
  Disconnectable,
  EventListenerLike,
  ListenerTarget,
  PulseLifecycle,
} from "./host/lifecycle";

export { BeatEngine } from "./engine/beats";
export type { AfProfile, Beat, BeatOptions, Checkpoint } from "./engine/beats";
export { CardiacModel } from "./engine/model";
export type { CardiacMetrics, CardiacSnapshot, MechanicalTimeline } from "./engine/model";
export { createPulseController } from "./engine/controller";
export type { PulseController, PulseControllerOptions } from "./engine/controller";
export { createPulseScheduler } from "./engine/scheduler";
export type { FrameCallback, FrameHandle, IntervalHandle, PulseScheduler, PulseSchedulerOptions } from "./engine/scheduler";
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
export { createLocalStoragePersistence } from "./persistence/localStorage";
export { createMemoryPersistence } from "./persistence/memory";
export { MAX_PERSISTENCE_BYTES, utf8ByteLength } from "./persistence/policy";
export { PULSE_LEGACY_STORAGE_KEYS, PULSE_STORAGE_KEY } from "./persistence/types";
export type { PersistenceErrorCode, PersistencePort, PersistenceResult, PersistenceStorage } from "./persistence/types";

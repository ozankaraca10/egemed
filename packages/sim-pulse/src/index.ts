import "@egemed/tokens/family-tokens.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sim.css";
import "./styles/explain.css";
import "./styles/case.css";
import "./styles/responsive.css";

import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "pulse" satisfies SimulatorId;

/**
 * Platform Pulse modülü: kaynak runtime (EGEMED_PULSE/cardai) gölge DOM'da
 * çalışır (PULSE-00). T201/T220: kabukta kullanılmayan eski TS ekran yolu
 * (mount + engine + ui) kaldırıldı; tek yol `runtime/module`dir.
 */
export { DEFAULT_PULSE_RUNTIME_ASSET_BASE, createPulseRuntimeModule, pulseStorageNamespace } from "./runtime/module";
export type { PulseRuntimeModuleDeps } from "./runtime/module";
export { mountPulseRuntime } from "./runtime/host";
export type { PulseRuntimeBridge, PulseRuntimeHandle, PulseRuntimeOptions } from "./runtime/host";
export {
  PULSE_LEARN_COMPLETE_EVENT,
  PULSE_LEARN_VERSION_PATTERN,
  createPulseLearnBridge,
  pulseContentVersion,
  pulseLearnPort,
} from "./runtime/learn";
export type { PulseLearnBridge, PulseLearnPort } from "./runtime/learn";
export {
  PULSE_QUESTION_ID,
  PULSE_SERVER_ITEMS_GLOBAL,
  PULSE_SERVER_REQUIRED_TEXT,
  PULSE_SERVER_RESULTS_GLOBAL,
  PULSE_SERVER_RESULT_EVENT,
  adaptServerItem,
  asPulsePublicCase,
  attachPulseServerRequired,
  createPulseServerItemsBridge,
  pulseServerErrorMessage,
} from "./runtime/serverItems";
export type {
  PulseServerCheck,
  PulseServerItemsBridge,
  PulseServerItemsPort,
  PulseServerPublicCase,
  PulseServerResultCase,
  PulseServerResults,
  PulseServerRuntimeItem,
} from "./runtime/serverItems";
import { createPulseRuntimeModule } from "./runtime/module";
export const pulseModule = createPulseRuntimeModule();

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

export { PULSE_MODE_CONTENT } from "./data/content";
export type { PulseModeContent } from "./data/content";
export { buildAttemptRecord, rhythmStreakAfter } from "./gamification/attempt";
export type { PulseAttemptInput, PulseAttemptRecord, PulseDomain, PulseExtra } from "./gamification/attempt";
export {
  PULSE_ANONYMOUS_LABEL,
  PULSE_DEMO_PEERS,
  PULSE_GAMI_MAX_ATTEMPTS,
  PULSE_GAMI_STORAGE_KEY,
  computePulseStats,
  createMemoryGamiRepo,
  createStorageGamiRepo,
  decodePulseGamiState,
  emptyPulseGamiState,
  pulseLearnTopic,
} from "./gamification/repo";
export type {
  PulseDemoPeer,
  PulseGamiRepo,
  PulseGamiRepoOptions,
  PulseGamiState,
  PulseGamiWriteResult,
  PulseLeaderboardRow,
  PulseLeaderboardView,
} from "./gamification/repo";
export {
  PULSE_COHORTS,
  PULSE_PERIODS,
  PULSE_PERIOD_LABELS,
  achievementsMarkup,
  createPulseAchievementsView,
  createPulseGainsView,
  createPulseLeaderboardView,
  gainsMarkup,
  leaderboardMarkup,
} from "./gamification/ui";
export type {
  PulseAchievementsView,
  PulseGainsView,
  PulseLeaderboardTableView,
} from "./gamification/ui";
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
export { createMonitorAudioPort } from "./audio/monitor";
export type {
  AudioParamPort,
  AudioPort,
  CreateMonitorAudioPortOptions,
  MonitorAudioConfig,
  MonitorAudioContext,
  MonitorGainNode,
  MonitorIntervalHost,
  MonitorOscillatorNode,
} from "./audio/monitor";
export { createLocalStoragePersistence } from "./persistence/localStorage";
export { createMemoryPersistence } from "./persistence/memory";
export { MAX_PERSISTENCE_BYTES, utf8ByteLength } from "./persistence/policy";
export { PULSE_LEGACY_STORAGE_KEYS, PULSE_STORAGE_KEY } from "./persistence/types";
export type { PersistenceErrorCode, PersistencePort, PersistenceResult, PersistenceStorage } from "./persistence/types";

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
export { filterAssessmentPool, validateCase } from "./core/validation";
export type { ValidationIssue } from "./core/validation";
export {
  EXTERNAL_RECORDS,
  RECORDS,
  assessmentPointFilter,
  assessmentPool,
  availableCount,
  getSound,
  manifest,
  resolveAssignment,
  resolveAssignmentEx,
  resolveCaseSounds,
  resolveCaseSoundsEx,
  resolveLibrarySound,
  resolveLibrarySoundEx,
} from "./core/resolver";
export type { CaseSoundsResolution, LibrarySoundResult } from "./core/resolver";
export { computeMetrics } from "./data/metrics";
export type { InventoryMetrics } from "./data/metrics";
export { ALL_CASES, AUTO_CASES, CORE_CASES, poolFor } from "./data/pool";
export { mulberry32, sampleSession, SESSION_SIZE, shuffledOptions, stringSeed } from "./core/session";
export {
  heartFindingText,
  heartLabel,
  heartLibrarySub,
  libraryShortTitle,
  librarySub,
  libraryTitle,
  lungFindingText,
  lungLabel,
  lungLibrarySub,
  MIXED_TITLES,
  TERMINOLOGY,
} from "./data/terminology";
export type { HeartFindingKey, LungFindingKey } from "./data/terminology";
export { LOG_LIMIT, LOG_TRIM, createBus } from "./core/events";
export type { EventBus, SimEventDraft } from "./core/events";
export {
  BEST_SCORE_KEY,
  buildSuspend,
  initialState,
  initialTelemetry,
  loadBestScore,
  reducer,
  saveBestScore,
} from "./core/reducer";
export type { Action, AppState, BodySex, ReducerSeam, StoragePort } from "./core/reducer";
export { createFlushHandlers, createLifecycle } from "./core/lifecycle";
export type { FlushTarget, Lifecycle, LifecycleHandlers, WindowLike } from "./core/lifecycle";
export { StoreProvider, useStore } from "./core/StoreProvider";
export type { StoreContextValue, StoreProviderProps } from "./core/StoreProvider";
export { createMemoryRuntimeAdapter, createNoopRuntimeAdapter, createSimRuntime } from "./core/runtime";
export type {
  FinishReport,
  InteractionRecord,
  MemoryRuntimeAdapter,
  RuntimeAdapter,
  RuntimeCall,
  RuntimeOptions,
  ScoreReport,
  SimRuntime,
  SuspendWrite,
} from "./core/runtime";
export {
  INITIAL_STAGE_POSITION,
  KEYBOARD_STEP,
  SNAP_MAX_PX,
  SNAP_WIDTH_RATIO,
  STAGE_X_MAX,
  STAGE_X_MIN,
  STAGE_Y_MAX,
  STAGE_Y_MIN,
  clampStagePosition,
  coordOf,
  findNearestPoint,
  fitStageBox,
  isPediatricSchematic,
  isPlaceKey,
  isPrimaryPointer,
  nudgeStagePosition,
  pointerToStagePosition,
  pointsInView,
  snapTolerance,
  stageViewConfig,
} from "./ui/patient-stage/geometry";
export type { BodyType, NormPoint, StageBox, StageCoordPoint, StageRect, StageViewConfig } from "./ui/patient-stage/geometry";
export {
  PatientStage,
  StageAudioProvider,
  createNoopStageEnv,
  createStageSession,
} from "./ui/PatientStage";
export type {
  PatientStageProps,
  StageAudio,
  StageAudioStatus,
  StageEnv,
  StageHandle,
  StageObserveTarget,
  StagePoint,
  StageSession,
  StageSessionBindings,
} from "./ui/PatientStage";
export { Chestpiece } from "./ui/stethoscope";
export { TorsoPediatricBack, TorsoPediatricFront } from "./ui/torso-pediatric";
export {
  QUESTION_JUMP_SELECTOR,
  Toolbar,
  ToolbarAudioProvider,
  createNoopToolbarEnv,
  performToolbar,
  showHintControl,
} from "./ui/Toolbar";
export type { ToolbarAudio, ToolbarEnv, ToolbarIntent, ToolbarPorts, ToolbarProps, ToolbarScrollTarget, ToolbarStageRef } from "./ui/Toolbar";
export { RegionChipList, visibleRegionPoints } from "./ui/RegionChips";
export type { RegionChipListProps } from "./ui/RegionChips";
export { FeedbackCard, QuestionCard, nextOptionIndex, toggleOptionValues } from "./ui/Questions";
export type { FeedbackCardProps, QuestionCardProps } from "./ui/Questions";
export { TUTORIAL_STEPS, TutorialSteps } from "./ui/TutorialSteps";
export { ConfirmModal } from "./ui/ConfirmModal";
export type { ConfirmModalProps } from "./ui/ConfirmModal";
export { HelpModal } from "./ui/HelpModal";
export type { HelpModalProps } from "./ui/HelpModal";
export { PediatricRefModal } from "./ui/PediatricRefModal";
export type { PediatricRefModalProps } from "./ui/PediatricRefModal";
export {
  NOOP_MODAL_ENV,
  bindModalFocus,
  createNoopModalEnv,
  enabledFocusables,
  tabTrapTarget,
} from "./ui/modal-env";
export type { ModalEnv, ModalFocusable, ModalKeyEvent, TabTrapTarget } from "./ui/modal-env";
export {
  IconArrowRight,
  IconBack10,
  IconBell,
  IconBodyBack,
  IconBodyFront,
  IconBook,
  IconBrain,
  IconChart,
  IconCheck,
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconCompare,
  IconDatabase,
  IconDiaphragm,
  IconDoc,
  IconDrag,
  IconEcg,
  IconExit,
  IconFingerTap,
  IconFullscreen,
  IconFullscreenExit,
  IconFwd10,
  IconGlobe,
  IconGraduation,
  IconHeadphones,
  IconHeart,
  IconHelpCircle,
  IconInfo,
  IconLock,
  IconLightbulb,
  IconLogo,
  IconLungs,
  IconMonitor,
  IconNetwork,
  IconPause,
  IconPlay,
  IconReplay,
  IconShieldCheck,
  IconSource,
  IconStethoscope,
  IconSwap,
  IconTarget,
  IconTrophy,
  IconUser,
  IconVolume,
  IconVolumeX,
  IconWave,
  IconXCircle,
} from "./ui/icons";
export { EcgDeco, Footer } from "./ui/chrome";
export { EntryScreens } from "./screens/EntryScreens";
export type { EntryScreensProps } from "./screens/EntryScreens";
export { modePickTarget, modeRecommendLocked, resolveEntryScreen, sessionSeed } from "./screens/entry";
export { ModeCard, ModeSelectScreen, Stepper } from "./screens/ModeSelectScreen";
export type { ModeSelectScreenProps } from "./screens/ModeSelectScreen";
export { StartScreen } from "./screens/StartScreen";
export type { StartScreenProps } from "./screens/StartScreen";
export { playVolumeCheckTone } from "./screens/tone";
export type { VolumeCheckAudio, VolumeToneContext } from "./screens/tone";
export { TutorialScreen, createNoopTutorialAudio } from "./screens/TutorialScreen";
export type { TutorialAudio, TutorialScreenProps } from "./screens/TutorialScreen";
export { LearnAudioProvider, LearnScreen, createNoopLearnAudio, createNoopLearnScreenEnv } from "./screens/LearnScreen";
export type { LearnAudio, LearnScreenEnv, LearnScreenProps } from "./screens/LearnScreen";
export { AUDIO_CONFIG } from "./audio/config";
export { createAudioEngine } from "./audio/engine";
export type { AudioEngine, AudioEngineDeps, EngineState } from "./audio/engine";
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

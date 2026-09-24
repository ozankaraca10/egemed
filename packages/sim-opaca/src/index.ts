import "@egemed/tokens/opaca.css";
import "./styles/shell.css";
import "./styles/film.css";
import "./styles/rest.css";
import "./styles/gami.css";

import type { SimulatorId } from "@egemed/sim-host";

export const SIM_ID = "opaca" satisfies SimulatorId;

export { App } from "./App";
export type { AppProps } from "./App";
export { DevPanel } from "./DevPanel";
export { createOpacaModule, opacaModule } from "./SimModule";
export { opacaModule as default } from "./SimModule";
export type { OpacaContainer, OpacaModuleDeps, OpacaRoot } from "./SimModule";
export { GamiProvider, bindGamiRepository, useGamiContext } from "./gamification/GamiContext";
export type { GamiContextValue, GamiSyncError } from "./gamification/GamiContext";
export {
  configureGamiRepository,
  formatGamiSyncError,
  getGamiRepo,
  isLocalRepo,
  resetGamiRepo,
} from "./gamification/repo";
export type { GamificationRepo, GamiRepoInit, LocalRepo, OpacaGamiRepo } from "./gamification/repo";
export {
  createBrowserChromeEnv,
  createBrowserLearnScreenEnv,
  createBrowserModalEnv,
  createBrowserOpacaBindings,
  createBrowserResultsScreenEnv,
  createBrowserSimulationPopoverEnv,
  createBrowserStartScreenEnv,
  createBrowserWindowLike,
  createLocalStoragePort,
  createNamespacedStoragePort,
  opacaStorageNamespace,
} from "./platform-deps";
export type { BrowserOpacaBindings } from "./platform-deps";

export { isAnswerCorrect } from "./core/answers";
export { LOG_LIMIT, LOG_TRIM, createBus } from "./core/events";
export type { EventBus, SimEventDraft } from "./core/events";
export {
  firstWeakLibraryKey,
  isTimedOut,
  nextActionForSubmit,
  remainingSec,
  stepProgress,
  tutorialProgress,
  weakDomainKeys,
  zoneChipState,
} from "./core/flow";
export type { SubmitAction, TutorialEvent, TutorialProgress, ZoneChipVisualState } from "./core/flow";
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
export {
  DEFAULT_ASSET_BASE,
  IMAGES,
  datasetCounts,
  examplesFor,
  expertPositive,
  getImage,
  isExpertSource,
  assetUrl,
  resolveAssetUrl,
  resetAssetBase,
  setAssetBase,
} from "./core/images";
export {
  BEST_SCORE_KEY,
  FS_PROMPT_KEY,
  buildSuspend,
  computeCaseResult,
  initialState,
  initialTelemetry,
  loadBestScore,
  loadFsPromptDone,
  reducer,
  saveBestScore,
  saveFsPromptDone,
} from "./core/reducer";
export type { Action, AppState, ReducerSeam, StoragePort } from "./core/reducer";
export { createFlushHandlers, createLifecycle } from "./core/lifecycle";
export type { FlushTarget, Lifecycle, LifecycleHandlers, WindowLike } from "./core/lifecycle";
export { StoreProvider, useStore } from "./core/StoreProvider";
export type { StoreContextValue, StoreProviderProps } from "./core/StoreProvider";
export { BrandMark, EcgDeco, Footer, Header, createNoopChromeEnv } from "./ui/chrome";
export type {
  ChromeEnv,
  ChromeKeyEvent,
  ChromeModals,
  ConfirmModalSeamProps,
  EcgDecoProps,
  FooterProps,
  HeaderProps,
  HelpModalSeamProps,
} from "./ui/chrome";
export { ConfirmModal } from "./ui/ConfirmModal";
export type { ConfirmModalProps } from "./ui/ConfirmModal";
export { HelpModal } from "./ui/HelpModal";
export type { HelpModalProps } from "./ui/HelpModal";
export { NOOP_MODAL_ENV, createNoopModalEnv, tabTrapTarget } from "./ui/modal-env";
export type { ModalEnv, ModalFocusable, ModalKeyEvent, TabTrapTarget } from "./ui/modal-env";
export { FeedbackCard, QuestionCard } from "./ui/Questions";
export type { FeedbackCardProps, QuestionCardProps } from "./ui/Questions";
export { TUTORIAL_STEPS, TutorialSteps } from "./ui/TutorialSteps";
export { ZoneChips } from "./ui/ZoneChips";
export type { ZoneChipsProps } from "./ui/ZoneChips";
export { FilmCornerBadge, FilmInfoPanel, sideMarkerFor, syntheticDateFor } from "./ui/FilmInfoPanel";
export { FilmViewer, createNoopFilmEnv } from "./ui/FilmViewer";
export type { FilmEnv, FilmStageRoot, FilmViewerHandle, FilmViewerProps } from "./ui/FilmViewer";
export {
  MARK_KEY_STEP,
  MAX_SCALE,
  PAN_KEY_STEP,
  WINDOW_PRESETS,
  WHEEL_ZOOM_FACTOR,
  ZOOM_KEY_FACTOR,
  annotatedSlices,
  applyPanKey,
  availablePresets,
  clampSlice,
  constrainView,
  filterFindingAnnotations,
  filterSliceAnnotations,
  goToSlice,
  hasMultiSliceStack,
  imageToClient,
  initialPresetForImage,
  initialSliceIndex,
  mapFilmKey,
  markAnnounceText,
  measureLen,
  moveMarkByKey,
  resetView,
  stackFrames,
  stackWindowForPreset,
  toImage,
  viewCenterImagePoint,
  windowSettingForPreset,
  zoomView,
} from "./ui/film-core";
export type {
  ClientRect,
  FilmBaseSize,
  FilmKeyAction,
  FilmKeyContext,
  FilmView,
  PointerTool,
  WindowSetting,
  ZoomOrigin,
} from "./ui/film-core";
export {
  IconArrowRight,
  IconArrowUp,
  IconAward,
  IconBack10,
  IconBell,
  IconBodyBack,
  IconBodyFront,
  IconBone,
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
  IconFilm,
  IconFingerTap,
  IconFlame,
  IconFullscreen,
  IconFullscreenExit,
  IconFwd10,
  IconGift,
  IconGlobe,
  IconGraduation,
  IconHeadphones,
  IconHeart,
  IconHelpCircle,
  IconInfo,
  IconLightbulb,
  IconLock,
  IconLogo,
  IconLungs,
  IconMedal,
  IconMonitor,
  IconNetwork,
  IconPause,
  IconPlay,
  IconReplay,
  IconScan,
  IconShieldCheck,
  IconSource,
  IconStar,
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
export { HINT_PENALTY_PRACTICE, MASTERY_THRESHOLD, aggregateResults, practiceAdjusted, scoreCase } from "./core/scoring";
export {
  IMAGE_DEPENDENT_QUESTION_TYPES,
  SESSION_SIZE,
  mulberry32,
  questionSignature,
  sampleSession,
  shuffledOptions,
  stringSeed,
} from "./core/session";
export { SUSPEND_LIMIT_12, SUSPEND_LIMIT_2004, deserializeSuspend, serializeSuspend } from "./core/suspend";
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
export { StartScreen, createNoopStartScreenEnv } from "./screens/StartScreen";
export type { StartScreenEnv, StartScreenProps } from "./screens/StartScreen";
export { ModeCard, ModeSelectScreen, Stepper } from "./screens/ModeSelectScreen";
export type { ModeSelectScreenProps } from "./screens/ModeSelectScreen";
export { TutorialScreen } from "./screens/TutorialScreen";
export type { TutorialScreenProps } from "./screens/TutorialScreen";
export { LearnScreen, createNoopLearnScreenEnv } from "./screens/LearnScreen";
export type { LearnGamiPort, LearnScreenEnv, LearnScreenProps } from "./screens/LearnScreen";
export {
  DEFAULT_CASE_TIME_SEC,
  caseTimeLimitSec,
  computeQuestionLatency,
  fmtSec,
  hasSimulationProgress,
  patientLine,
  planK3SessionRegeneration,
  planNewPracticeSample,
  planPrimaryAction,
  resolveSimulationSession,
  sessionSeedFromNow,
  sourceNote,
} from "./screens/simulation-core";
export type {
  PrimaryActionPlan,
  ResolvedSimulationSession,
  SessionRegenPlan,
  SimulationDispatch,
} from "./screens/simulation-core";
export { SimulationScreen, createNoopSimulationPopoverEnv } from "./screens/SimulationScreen";
export type {
  SimulationGamiPort,
  SimulationPopoverEnv,
  SimulationPopoverEvent,
  SimulationScreenProps,
} from "./screens/SimulationScreen";
export { ResultsScreen, createNoopResultsScreenEnv } from "./screens/ResultsScreen";
export type { ResultsGamiPort, ResultsScreenEnv, ResultsScreenProps } from "./screens/ResultsScreen";
export { SourcesScreen } from "./screens/SourcesScreen";
export type { SourcesScreenProps } from "./screens/SourcesScreen";

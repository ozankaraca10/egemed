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
export { PULSE_MODE_CONTENT } from "./data/content";
export type { PulseModeContent } from "./data/content";
export { PULSE_SOURCES, buildAboutLimitations, createPulseAboutView, initials, renderPulseAboutMarkup, withAssetBase } from "./ui/about";
export type {
  CreatePulseAboutViewOptions,
  PulseAboutView,
  PulseAboutViewCreditGroup,
  PulseAboutViewPerson,
  PulseSourcesDocument,
} from "./ui/about";
export { LANDING_SOUND_PREFERENCE_KEY, createPulseLandingContent, createPulseLandingController } from "./ui/landing";
export type {
  CreatePulseLandingContentOptions,
  CreatePulseLandingControllerOptions,
  LandingPreferencePersistencePort,
  LandingPersistenceResult,
  PulseLandingContent,
  PulseLandingController,
  PulseLandingCounts,
  PulseLandingFeature,
  PulseLandingVariant,
} from "./ui/landing";
export { PULSE_TUTORIAL_STEPS, createTutorialStepViews, shouldRunPulseTutorial } from "./ui/tutorial";
export type { PulseTutorialRunState, TutorialStep, TutorialStepStatus, TutorialStepView } from "./ui/tutorial";
export { pulseMetricReadouts, pulseMetricSnapshot, pulsePhaseLabelKey } from "./ui/sim/metrics";
export type { PulseMetricId, PulseMetricReadout, PulsePhase } from "./ui/sim/metrics";
export { systematicReadout } from "./ui/sim/explain";
export type { SystematicFinding, SystematicLabel, SystematicOptions } from "./ui/sim/explain";
export { createPulseController } from "./engine/controller";
export type { PulseController, PulseControllerOptions } from "./engine/controller";
export { applyMode, selectLead, showView } from "./engine/actions";
export type { PulseActionContext } from "./engine/actions";
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
export { MODE_CARDS } from "./ui/modes";
export type { ModeCard, ModeCardId } from "./ui/modes";
export { HEART_PHASES, HEART_REGIONS, highlightedHeartRegions, isHeartRegionActive } from "./ui/sim/heart";
export type { HeartPhase, HeartRegion } from "./ui/sim/heart";
export { heartMarkup } from "./ui/sim/heartMarkup";
export { bindCaliperDrag, caliperPointFromPointer, nudgeCaliper } from "./ui/case/caliper";
export type {
  CaliperDragOptions, CaliperHandle, CaliperHandleBinding, CaliperHandleTarget, CaliperPoint,
  CaliperRect, CaliperState, CaliperPointerEvent,
} from "./ui/case/caliper";
export { validateChallenge, scheduleChallengeCompletion } from "./ui/case/challenge";
export type { ChallengeBeat, ChallengeGeometry, ChallengeTimerPort, ChallengeType } from "./ui/case/challenge";
export { guideSteps, guideStepAt } from "./ui/case/guide";
export type { GuidePhase, GuideStep } from "./ui/case/guide";
export {
  bindCaseActions,
  buildCaseReport,
  caseEndMarkup,
  caseQuestionCardMarkup,
  CASE_ACTIONS,
  CASE_SESSION_SIZE,
  caseStageMarkup,
  createCaseFlowView,
  createCaseQuestionView,
  reviewCaseIndex,
} from "./ui/case";
export type {
  BindCaseActionsOptions,
  CaseAction,
  CaseActionEvent,
  CaseActionTarget,
  CaseFeedbackView,
  CaseFlowView,
  CaseOptionView,
  CaseQuestionMarkupOptions,
  CaseQuestionView,
  CaseReportRow,
  CaseReportSource,
  CaseReportView,
  CaseStageMarkupOptions,
} from "./ui/case";
export {
  bindQuizActions,
  createQuizFlowView,
  createQuizQuestionView,
  grade,
  gradeQuiz,
  QUIZ_ACTIONS,
  QUIZ_SESSION_SIZE,
  quizQuestionCardMarkup,
} from "./ui/quiz";
export type {
  BindQuizActionsOptions,
  QuizAction,
  QuizActionEvent,
  QuizActionTarget,
  QuizFeedbackView,
  QuizFlowView,
  QuizGradeRow,
  QuizGradeSource,
  QuizGradeView,
  QuizOptionView,
  QuizQuestionMarkupOptions,
  QuizQuestionView,
} from "./ui/quiz";
export {
  buildQuizResultsView,
  buildResultsCsv,
  buildSessionCompletionPayload,
  escapeResultsCsvCell,
  resetQuizProgress,
  RESULTS_CSV_DELIMITER,
  RESULTS_PASS_THRESHOLD,
} from "./ui/results";
export type {
  BuildResultsCsvOptions,
  QuizResultsView,
  ResetQuizProgressResult,
  ResultsAreaRow,
  ResultsSummaryView,
  SessionCompletionPayload,
} from "./ui/results";
export { coronaryParticlePositions, drawHeartCanvas, observeHeartCanvas } from "./ui/sim/heartCanvas";
export type {
  CoronaryParticle, HeartCanvasContext, HeartCanvasOptions, HeartCanvasSize, HeartResizeObserver,
} from "./ui/sim/heartCanvas";
export { drawEcg, drawEcgCanvas, observeEcg, observeEcgCanvas } from "./ui/sim/ecg";
export type { DrawEcgOptions, EcgCanvasContext, EcgResizeObserver, EcgSignalSource } from "./ui/sim/ecg";
export {
  ECG_COLUMN_COUNT, ECG_SMALL_SQUARE_MV, ECG_SMALL_SQUARE_SECONDS, ECG_ZOOM,
  itemEcgGeometry, mainEcgGeometry,
} from "./ui/sim/ecgGeometry";
export type { EcgColumnGeometry, EcgGeometry } from "./ui/sim/ecgGeometry";
export { ITEM_ECG_ZOOM_STEPS, drawItemEcg, itemEcgZoom, itemEcgZoomLabel, observeItemEcg } from "./ui/sim/itemEcg";
export type { DrawItemEcgOptions, ItemEcgZoom } from "./ui/sim/itemEcg";
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
export { createMemoryPersistence } from "./persistence/memory";
export { MAX_PERSISTENCE_BYTES, utf8ByteLength } from "./persistence/policy";
export { PULSE_LEGACY_STORAGE_KEYS, PULSE_STORAGE_KEY } from "./persistence/types";
export type { PersistenceErrorCode, PersistencePort, PersistenceResult, PersistenceStorage } from "./persistence/types";

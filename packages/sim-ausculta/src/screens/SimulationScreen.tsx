import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { countUnlistenedInOtherView, otherViewHintText } from "../core/flow";
import { resolveCaseSoundsEx } from "../core/resolver";
import { useStore } from "../core/StoreProvider";
import type { AuscultationPoint, CaseDef, CaseResult, ScoringWeights, SoundRecord } from "../core/types";
import pointsData from "../data/auscultation-points.json";
import { ALL_CASES, poolFor } from "../data/pool";
import { PatientStage, StageAudioProvider, type StageAudio, type StageHandle } from "../ui/PatientStage";
import { PediatricRefModal } from "../ui/PediatricRefModal";
import { RegionChipList } from "../ui/RegionChips";
import { ConfirmModal } from "../ui/ConfirmModal";
import { FeedbackCard, QuestionCard } from "../ui/Questions";
import { Toolbar, ToolbarAudioProvider, type ToolbarAudio } from "../ui/Toolbar";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { IconArrowRight, IconChevronRight, IconDoc, IconInfo } from "../ui/icons";
import { NOOP_MODAL_ENV, type ModalEnv } from "../ui/modal-env";
import {
  CASE_FLASH_MS,
  CASE_TRANSITION_MS,
  hasSessionProgress,
  isAnswerCorrect,
  isLastQuestion,
  planAssessmentAutoAdvance,
  planK3SessionRegeneration,
  planPrimaryAction,
  planSessionAction,
  planSessionCompletion,
  questionCursor,
  resolveSimulationSession,
  shouldStartCaseTransition,
  showCaseEndCard,
  simulationPointIds,
  type SessionActionKind,
} from "./simulation/derive";
import {
  applyPrimaryAction,
  armTimer,
  bindDismissListeners,
  createNoopSimulationScreenEnv,
  rememberQuestionShown,
  reportSessionCompletion,
  warmCaseSounds,
  type SimulationGamiPort,
  type SimulationPointerEvent,
  type SimulationScreenEnv,
} from "./simulation/runtime";
import { useSessions } from "../ui/ScreenHeading";
import type { SimSessionSource } from "@egemed/sim-host";
import {
  checkServerQuestion,
  finishServerSession,
  loadServerCase,
  requestServerHint,
  startServerSession,
  submitServerCase,
} from "../core/serverDriver";
import { serverPointIds, serverSoundRecord, snapshotOf, type ServerClientCase, type ServerSessionState } from "../core/serverSession";

/** A1.4: sunucu oturumu bağlamı (CaseView'a iletilir). */
interface ServerBinding {
  readonly sessions: SimSessionSource;
  readonly server: ServerSessionState;
}

/** Uygulama ve Değerlendirme (S15b/S15c).
 *  `document`/`window`/`Date.now` yok; zaman `now`, dinleyici ve süre `env`, rapor S8 `runtime`.
 *  Oyunlaştırma yalnız `gamiEnabled` açıkken tamamlanan değerlendirmeyi kaydeder. */

const POINTS = pointsData.points as AuscultationPoint[];
const HIT = touchTarget();
const NOOP_ENV: SimulationScreenEnv = createNoopSimulationScreenEnv();

export type SimulationAudio = StageAudio & ToolbarAudio;

export function createNoopSimulationAudio(): SimulationAudio {
  return {
    play: async () => undefined,
    replay: async () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    setMuted: () => undefined,
    getActive: () => null,
    ensureContext: async () => undefined,
  };
}

export interface SimulationScreenProps {
  readonly embedded?: boolean;
  readonly env?: SimulationScreenEnv;
  readonly modalEnv?: ModalEnv;
  readonly audio?: SimulationAudio;
  readonly gamiEnabled?: boolean;
  readonly gami?: SimulationGamiPort;
}

function stageBody(caseDef: CaseDef): "erkek" | "pediatrik" {
  const population = (caseDef as CaseDef & { population?: string }).population;
  return population === "pediatrik" ? "pediatrik" : "erkek";
}

function primaryLabel(isAssessment: boolean, last: boolean, lastCase: boolean, revealed: boolean): string {
  if (isAssessment) return last && lastCase ? "Yanıtları değerlendir" : "Sonraki soru";
  if (revealed) return last ? "Vakayı tamamla" : "Devam Et";
  return "Yanıtla";
}

export function SimulationScreen({
  embedded = false,
  env = NOOP_ENV,
  modalEnv = NOOP_MODAL_ENV,
  audio = createNoopSimulationAudio(),
  gamiEnabled = false,
  gami,
}: SimulationScreenProps): JSX.Element {
  const { state, dispatch, runtime, bus, now } = useStore();
  const sessions = useSessions();
  // A1.4 (ADR-009): kanal varsa uygulama/değerlendirme vakaları YALNIZ sunucudan gelir.
  const serverMode = sessions !== undefined && state.mode !== "learn";
  const server = state.server;
  const startingRef = useRef(false);
  const loadingIndexRef = useRef(0);
  const finishingRef = useRef("");
  const pool = poolFor(state.mode);
  const local = resolveSimulationSession({
    mode: state.mode,
    practiceIds: state.session.practiceIds,
    assessmentIds: state.session.assessmentIds,
    caseIndex: state.caseIndex,
    allCases: ALL_CASES,
    pool,
  });
  const sessionCases = local.sessionCases;
  const caseList = serverMode ? Array.from({ length: server?.caseCount ?? 0 }) : local.caseList;
  const currentCase: CaseDef | undefined = serverMode
    ? server?.currentCase !== null && server?.currentCase !== undefined && server.loadedIndex === state.caseIndex + 1
      ? server.currentCase
      : undefined
    : local.currentCase;

  // Sunucu oturumunu başlat (yeni mod `server`ı sıfırlar).
  useEffect(() => {
    if (!serverMode || sessions === undefined || server !== null || startingRef.current) return;
    if (state.mode !== "practice" && state.mode !== "assessment") return;
    startingRef.current = true;
    loadingIndexRef.current = 1;
    finishingRef.current = "";
    void startServerSession(sessions, dispatch, state.mode, state.serverFocus, state.serverChallengeId).finally(() => {
      startingRef.current = false;
    });
  }, [dispatch, server, serverMode, sessions, state.mode, state.serverFocus, state.serverChallengeId]);

  // Sıradaki vakayı yükle (sonuç kartı kapanıp `nextCase` sonrası).
  useEffect(() => {
    if (!serverMode || sessions === undefined || server === null || server.status !== "ready") return;
    const next = state.caseIndex + 1;
    if (state.pendingSummary !== null || next <= server.loadedIndex || next > server.caseCount) return;
    if (loadingIndexRef.current >= next) return;
    loadingIndexRef.current = next;
    void loadServerCase(sessions, dispatch, server.sessionId, next, server.mode);
  }, [dispatch, server, serverMode, sessions, state.caseIndex, state.pendingSummary]);

  // Tüm vakalar bitince oturumu sunucuda kapat; sonuçlar (değerlendirmede geri bildirim) buradan gelir.
  useEffect(() => {
    if (!serverMode || sessions === undefined || server === null) return;
    if (state.caseIndex < server.caseCount || server.status !== "ready") return;
    if (finishingRef.current === server.sessionId) return;
    finishingRef.current = server.sessionId;
    void finishServerSession(sessions, dispatch, server.sessionId);
  }, [dispatch, server, serverMode, sessions, state.caseIndex]);

  useEffect(() => {
    if (serverMode) return;
    const plan = planK3SessionRegeneration({
      mode: state.mode,
      sessionCasesCount: sessionCases.length,
      seed: state.session.seed,
      practiceIds: state.session.practiceIds,
      assessmentIds: state.session.assessmentIds,
      pool,
      now: now(),
    });
    if (!plan) return;
    dispatch({ type: "startSession", practiceIds: plan.practiceIds, assessmentIds: plan.assessmentIds, seed: plan.seed });
  }, [
    dispatch,
    now,
    pool,
    sessionCases.length,
    state.mode,
    state.session.assessmentIds,
    state.session.practiceIds,
    state.session.seed,
  ]);

  useEffect(() => {
    if (serverMode) return;
    const plan = planSessionCompletion({
      caseIndex: state.caseIndex,
      caseCount: caseList.length,
      mode: state.mode,
      caseResults: state.caseResults,
      now: now(),
    });
    if (!plan) return;
    reportSessionCompletion({ plan, runtime, bus, gamiEnabled, gami });
    dispatch(plan.dispatch);
  }, [bus, caseList.length, dispatch, gami, gamiEnabled, now, runtime, serverMode, state.caseIndex, state.caseResults, state.mode]);

  if (serverMode && !currentCase) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: "relative", zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state" role={server?.status === "error" ? "alert" : "status"}>
              {server?.status === "error" ? (
                <>
                  <h2>Vaka yüklenemedi</h2>
                  <p>{server.error}</p>
                  <button type="button" className="btn primary" style={HIT} onClick={() => dispatch({ type: "startMode", mode: state.mode })}>
                    Yeniden dene
                  </button>
                </>
              ) : (
                <h2>{state.caseIndex >= (server?.caseCount ?? Number.POSITIVE_INFINITY) ? "Sonuçlar hazırlanıyor…" : "Vaka hazırlanıyor…"}</h2>
              )}
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
      </>
    );
  }

  if (!currentCase) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: "relative", zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state">
              <h2>Bu modda henüz vaka yok</h2>
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
      </>
    );
  }

  return (
    <StageAudioProvider engine={audio}>
      <ToolbarAudioProvider engine={audio}>
        <CaseView
          key={`${state.mode}-${state.caseIndex}-${currentCase.id}`}
          caseDef={currentCase}
          total={caseList.length}
          embedded={embedded}
          env={env}
          modalEnv={modalEnv}
          audio={audio}
          binding={serverMode && sessions !== undefined && server !== null ? { sessions, server } : null}
        />
      </ToolbarAudioProvider>
    </StageAudioProvider>
  );
}

function CaseView({
  caseDef,
  total,
  embedded,
  env,
  modalEnv,
  audio,
  binding,
}: {
  caseDef: CaseDef;
  total: number;
  embedded: boolean;
  env: SimulationScreenEnv;
  modalEnv: ModalEnv;
  audio: SimulationAudio;
  binding: ServerBinding | null;
}): JSX.Element {
  const { state, dispatch, runtime, bus, now } = useStore();
  const isAssessment = state.mode === "assessment";
  const stageRef = useRef<StageHandle>(null);
  const shownAtRef = useRef<Record<string, number>>({});
  const firstCaseRef = useRef(true);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const [pedModalOpen, setPedModalOpen] = useState(false);
  const [sessionAction, setSessionAction] = useState<SessionActionKind | null>(null);
  const [caseFlash, setCaseFlash] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const cursor = questionCursor(caseDef.questions, state.step, state.answers, state.revealed);
  const q = cursor.question;
  const resolved = useMemo(() => resolveCaseSoundsEx(caseDef.soundAssignments), [caseDef]);
  const serverCase = binding === null ? null : (caseDef as ServerClientCase);
  const pointIds = serverCase !== null ? serverPointIds(serverCase) : simulationPointIds(isAssessment, caseDef.soundAssignments);
  const [busy, setBusy] = useState(false);
  // Çift tıklama/yarış: sunucu isteği sürerken ikinci birincil eylem yok sayılır (409 case_already_answered önlenir).
  const busyRef = useRef(false);
  const serverFeedback = binding !== null && q ? binding.server.feedback[q.id] : undefined;
  const pediatric = stageBody(caseDef) === "pediatrik";
  const endCard = showCaseEndCard(state.mode, state.pendingSummary);
  const progress = hasSessionProgress(state.answers, state.hintsUsed, state.caseResults.length);
  const lastCase = state.caseIndex + 1 >= total;

  useEffect(() => {
    dispatch({ type: "caseMount", caseDef });
    bus.emit({ type: "case_started", caseId: caseDef.id, mode: state.mode });
    if (binding === null) warmCaseSounds(caseDef.soundAssignments);
  }, [bus, caseDef, dispatch, state.mode]);

  useEffect(() => {
    if (!q) return;
    shownAtRef.current = rememberQuestionShown(shownAtRef.current, q.id, now());
  }, [now, q]);

  useEffect(() => {
    setCaseFlash(true);
    return armTimer(env, CASE_FLASH_MS, () => setCaseFlash(false));
  }, [caseDef.id, env]);

  useEffect(() => {
    const first = firstCaseRef.current;
    firstCaseRef.current = false;
    if (!shouldStartCaseTransition(isAssessment, first)) return;
    setTransitioning(true);
    return armTimer(env, CASE_TRANSITION_MS, () => setTransitioning(false));
  }, [caseDef.id, env, isAssessment]);

  useEffect(() => {
    const action = planAssessmentAutoAdvance(isAssessment, state.pendingSummary);
    if (action) dispatch(action);
  }, [dispatch, isAssessment, state.pendingSummary]);

  const runSessionAction = (kind: SessionActionKind) => {
    const steps = planSessionAction({
      kind,
      mode: state.mode,
      practiceIds: state.session.practiceIds,
      assessmentIds: state.session.assessmentIds,
      pool: poolFor(state.mode),
      now: now(),
    });
    for (const action of steps) dispatch(action);
    setSessionAction(null);
  };

  /** A1.4: sunucu modunda birincil eylem — uygulamada soru sunucuda kontrol edilir, vaka sonu sunucuya gönderilir. */
  const runServerPrimary = async (plan: ReturnType<typeof planPrimaryAction>, server: ServerBinding) => {
    if (!serverCase || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const index = serverCase.serverIndex;
      let dispatches = plan.dispatches;
      const submit = dispatches.find((action) => action.type === "submitAnswer");
      if (submit && submit.type === "submitAnswer") {
        let correct = false;
        if (state.mode === "practice") {
          const checked = await checkServerQuestion(server.sessions, dispatch, server.server.sessionId, index, submit.qid, state.answers[submit.qid] ?? []);
          if (checked === null) return;
          correct = checked;
        }
        dispatches = dispatches.map((action) => (action.type === "submitAnswer" ? { ...action, correct } : action));
      }
      const finishing = dispatches.some((action) => action.type === "finishCase");
      for (const action of dispatches) if (action.type !== "finishCase") dispatch(action);
      if (finishing) {
        dispatch({ type: "serverSnapshot", caseId: serverCase.id, snapshot: snapshotOf(serverCase, state.answers) });
        await submitServerCase(server.sessions, dispatch, server.server.sessionId, index, state.answers, state.telemetry);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const requestSessionAction = (kind: SessionActionKind) => {
    if (progress) setSessionAction(kind);
    else runSessionAction(kind);
  };

  const onPrimary = () => {
    if (!q) return;
    const plan = planPrimaryAction({
      mode: state.mode,
      question: q,
      questions: caseDef.questions,
      revealed: cursor.revealed,
      canSubmit: cursor.canSubmit,
      given: state.answers[q.id] ?? [],
      shownAt: shownAtRef.current,
      now: now(),
    });
    if (binding !== null) {
      void runServerPrimary(plan, binding);
      return;
    }
    applyPrimaryAction({
      plan,
      dispatch,
      runtime,
      caseId: caseDef.id,
      questions: caseDef.questions,
      answers: state.answers,
    });
  };

  const otherHint = isAssessment
    ? null
    : otherViewHintText(state.view, countUnlistenedInOtherView(POINTS, pointIds, state.view, state.telemetry.visits));
  const fallbackId = activePoint ? resolved.fallbacks[activePoint] : undefined;
  const fallbackPoint = fallbackId ? POINTS.find((point) => point.id === fallbackId) : undefined;

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className={["sim-grid", isAssessment ? "wide-left mode-assessment" : "mode-practice", transitioning ? "is-transitioning" : ""].join(" ")}>
            {transitioning && (
              <div className="case-transition" role="status" aria-live="polite">
                <div className="case-transition-card">
                  <div className="ct-big">Vaka {state.caseIndex + 1} / {total} · Yeni hasta</div>
                  <div className="ct-sub">Olgu bilgisini okuyun ve muayeneye başlayın.</div>
                </div>
              </div>
            )}
            <div className={`sim-main ${endCard ? "is-inert" : ""}`}>
              {isAssessment && (
                <div className={`strict-banner ${state.caseIndex > 0 ? "compact" : ""}`} role="alert">
                  {binding?.server.mode === "challenge" ? (
                    <span>
                      <strong>Meydan Okuma.</strong> Rakibinizle aynı vakalar · vaka başı 2 dk, toplam 8 dk · tek dinleme
                    </span>
                  ) : state.caseIndex === 0 ? (
                    <>
                      <strong>Manuel muayene modu.</strong>
                      <span className="strict-banner-detail"> Her bölge yalnızca <b>bir kez</b> dinlenebilir; işaretleme, ipucu ve tekrar dinleme yoktur.</span>
                    </>
                  ) : (
                    <span><strong>Manuel muayene</strong> · tek dinleme</span>
                  )}
                </div>
              )}
              <div className="stage-card">
                {state.mode !== "assessment" ? (
                  <div className="stage-top stage-top-right">
                    <label className="points-toggle">
                      <input
                        type="checkbox"
                        checked={state.showPoints}
                        onChange={(event) => dispatch({ type: "togglePoints", show: checkboxChecked(event.target) })}
                      />
                      Dinleme noktalarını göster
                    </label>
                  </div>
                ) : null}
                <PatientStage
                  points={POINTS}
                  filterIds={pointIds}
                  bodyType={stageBody(caseDef)}
                  strict={isAssessment}
                  view={state.view}
                  head={state.head}
                  volume={state.volume}
                  showPoints={state.mode !== "assessment" && state.showPoints}
                  showLabels={state.mode !== "assessment" && state.showPoints}
                  mode={state.mode}
                  engine={audio}
                  soundFor={(pointId): SoundRecord | null => {
                    if (binding !== null && serverCase !== null) {
                      const audioToken = serverCase.serverAudio[pointId];
                      return audioToken === undefined
                        ? null
                        : serverSoundRecord(pointId, audioToken, binding.sessions.audioUrl(binding.server.sessionId, audioToken));
                    }
                    return resolved.sounds[pointId] ?? null;
                  }}
                  onVisit={(pointId) => {
                    dispatch({ type: "visit", pointId });
                    bus.emit({ type: "auscultation_started", pointId });
                  }}
                  onDwell={(pointId, dwellMs) => dispatch({ type: "dwell", pointId, dwellMs })}
                  onListen={(pointId, listenMs) => dispatch({ type: "listen", pointId, listenMs })}
                  onPlayingChange={(_playing, pointId) => setActivePoint(pointId)}
                  ref={stageRef}
                />
                <RegionChipList
                  points={POINTS}
                  view={state.view}
                  pointIds={pointIds}
                  activePoint={activePoint}
                  visits={state.telemetry.visits}
                  onSelect={(pointId) => stageRef.current?.placeAt(pointId)}
                  hideUntilFocus={isAssessment}
                  otherViewHint={otherHint}
                />
                {!isAssessment && fallbackPoint && (
                  <div className="note-strip" style={{ marginTop: 0 }}>
                    <IconInfo width={16} height={16} />
                    <span className="small">
                      Bu bölge için doğrulanmış posterior kayıt yok; aynı bulgunun <strong>{fallbackPoint.fullLabel}</strong> kaydı çalınmaktadır.
                    </span>
                  </div>
                )}
              </div>
              <Toolbar
                caseDef={caseDef}
                stageRef={stageRef}
                activePoint={activePoint}
                {...(state.mode === "practice" && q
                  ? { question: binding !== null ? { ...q, ...(q.hint === undefined ? {} : { hint: binding.server.hints[q.id] ?? q.hint }) } : q }
                  : {})}
                onHint={() => {
                  dispatch({ type: "useHint" });
                  if (binding !== null && serverCase !== null && q) {
                    void requestServerHint(binding.sessions, dispatch, binding.server.sessionId, serverCase.serverIndex, q.id);
                  }
                }}
                strict={isAssessment}
                engine={audio}
              />
            </div>
            <div className="sim-side">
              <div className={`card ${caseFlash ? "case-flash" : ""}`}>
                <div className="card-title-row">
                  <div className="ic"><IconDoc /></div>
                  <h3>Olgu</h3>
                  <div className="card-title-actions">
                    <span className="badge blue">Vaka {state.caseIndex + 1}/{total}</span>
                    {!isAssessment && caseDef.mappingNote ? <MappingNote note={caseDef.mappingNote} env={env} /> : null}
                    {!isAssessment && pediatric ? (
                      <button type="button" className="btn outline small ped-ref-btn" style={HIT} onClick={() => setPedModalOpen(true)}>
                        <IconInfo width={14} height={14} /> Pediatrik referans
                      </button>
                    ) : null}
                    {state.mode === "practice" && binding === null ? (
                      <SessionMenu env={env} onResample={() => requestSessionAction("resample")} onRestart={() => requestSessionAction("restart")} />
                    ) : null}
                    {state.mode === "practice" && binding !== null ? (
                      <button type="button" className="btn outline small" style={HIT} onClick={() => (progress ? setSessionAction("resample") : dispatch({ type: "startMode", mode: "practice" }))}>
                        Yeni oturum
                      </button>
                    ) : null}
                  </div>
                </div>
                <p style={{ marginTop: 0 }}>
                  <strong>{caseDef.patient.age} yaşında {caseDef.patient.sex} hasta.</strong> <b>Başvuru:</b> {caseDef.chiefComplaint}.{" "}
                  <span className="case-history-full">{caseDef.history}</span>
                </p>
                <div className="kv-grid">
                  {caseDef.vitalSigns.hr ? <KV k="Kalp hızı" v={`${caseDef.vitalSigns.hr}/dk`} /> : null}
                  {caseDef.vitalSigns.rr ? <KV k="Solunum" v={`${caseDef.vitalSigns.rr}/dk`} /> : null}
                  {caseDef.vitalSigns.bp ? <KV k="TA" v={caseDef.vitalSigns.bp} /> : null}
                  {caseDef.vitalSigns.spo2 ? <KV k="SpO₂" v={`%${caseDef.vitalSigns.spo2}`} /> : null}
                  {caseDef.vitalSigns.temp ? <KV k="Ateş" v={caseDef.vitalSigns.temp} /> : null}
                </div>
              </div>
              {endCard && state.pendingSummary ? (
                <CaseEndCard
                  summary={state.pendingSummary}
                  caseDef={caseDef}
                  serverSummary={binding !== null ? binding.server.metas[caseDef.id]?.summary ?? "" : null}
                  caseNumber={state.caseIndex + 1}
                  totalCases={total}
                  isLast={lastCase}
                  onNext={() => dispatch({ type: "nextCase" })}
                />
              ) : q ? (
                <div className="card q-card-dark">
                  <QuestionCard
                    q={q}
                    caseId={caseDef.id}
                    value={state.answers[q.id] ?? []}
                    onChange={(values) => dispatch({ type: "answer", qid: q.id, values })}
                    revealed={cursor.revealed}
                    index={state.step}
                    total={caseDef.questions.length}
                  />
                  {state.mode === "practice" && cursor.revealed && binding === null ? (
                    <FeedbackCard correct={isAnswerCorrect(q, state.answers[q.id] ?? [])} q={q} given={state.answers[q.id] ?? []} />
                  ) : null}
                  {state.mode === "practice" && cursor.revealed && binding !== null && serverFeedback !== undefined ? (
                    <FeedbackCard
                      correct={serverFeedback.correct}
                      q={{ ...q, correct: [...serverFeedback.correctOptionIds], feedbackCorrect: serverFeedback.feedback, feedbackIncorrect: serverFeedback.feedback }}
                      given={state.answers[q.id] ?? []}
                    />
                  ) : null}
                  <div className="q-nav">
                    <button
                      type="button"
                      className={`btn ${isAssessment ? "purple" : "primary"}`}
                      style={{ flex: 1, ...HIT }}
                      onClick={onPrimary}
                      disabled={busy || binding?.server.status === "submitting" || state.pendingSummary !== null || (!cursor.canSubmit && !(state.mode === "practice" && cursor.revealed))}
                    >
                      {primaryLabel(isAssessment, isLastQuestion(caseDef.questions, q), lastCase, cursor.revealed)} <IconArrowRight />
                    </button>
                  </div>
                </div>
              ) : null}
              {state.mode === "practice" && !endCard ? (
                <div className="note-strip">
                  <IconInfo />
                  <span>İpucu kullanmak uygulama puanınızı düşürür. Değerlendirme modunda ipucu yoktur.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
      <PediatricRefModal open={pedModalOpen} onClose={() => setPedModalOpen(false)} env={modalEnv} />
      <ConfirmModal
        open={sessionAction !== null}
        title={sessionAction === "resample" ? "Yeni örneklem alınsın mı?" : "Oturum yeniden başlatılsın mı?"}
        message={
          sessionAction === "resample"
            ? "Yeni örneklem alınsın mı? Bu oturumdaki yanıtlar silinir; ilerleme ve en iyi puan korunur."
            : "Oturum yeniden başlatılsın mı? Bu oturumdaki yanıtlar silinir; aynı 10 vakalık örneklem ve en iyi puan korunur."
        }
        confirmLabel={sessionAction === "resample" ? "Yeni örneklem al" : "Yeniden başlat"}
        cancelLabel="Vazgeç"
        onConfirm={() => {
          if (binding !== null) {
            setSessionAction(null);
            dispatch({ type: "startMode", mode: "practice" });
            return;
          }
          if (sessionAction) runSessionAction(sessionAction);
        }}
        onCancel={() => setSessionAction(null)}
        env={modalEnv}
      />
    </>
  );
}

function SessionMenu({
  env,
  onResample,
  onRestart,
}: {
  env: SimulationScreenEnv;
  onResample: () => void;
  onRestart: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<unknown>(null);
  useEffect(() => {
    if (!open) return;
    return bindDismissListeners(env, (target) => env.containsNode(wrapRef.current, target), () => setOpen(false));
  }, [env, open]);
  return (
    <div className="popover-wrap" ref={(node) => { wrapRef.current = node; }}>
      <button type="button" className="btn outline small" style={HIT} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
        Oturum <IconChevronRight width={12} height={12} />
      </button>
      {open ? (
        <div className="popover" role="menu">
          <button type="button" className="btn outline small" style={{ width: "100%", marginBottom: 6, ...HIT }} role="menuitem" onClick={() => { setOpen(false); onResample(); }}>
            Yeni 10 vaka örneklemi
          </button>
          <button type="button" className="btn outline small" style={{ width: "100%", ...HIT }} role="menuitem" onClick={() => { setOpen(false); onRestart(); }}>
            Oturumu yeniden başlat
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MappingNote({ note, env }: { note: string; env: SimulationScreenEnv }): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<unknown>(null);
  useEffect(() => {
    if (!open) return;
    return bindDismissListeners(env, (target) => env.containsNode(wrapRef.current, target), () => setOpen(false));
  }, [env, open]);
  return (
    <div className="popover-wrap" ref={(node) => { wrapRef.current = node; }}>
      <button type="button" className="btn outline small mapping-note-btn" style={HIT} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <IconInfo width={14} height={14} /> Kayıt bilgisi
      </button>
      {open ? <div className="popover" role="note">{note}</div> : null}
    </div>
  );
}

function CaseEndCard({
  summary,
  caseDef,
  caseNumber,
  totalCases,
  isLast,
  onNext,
  serverSummary,
}: {
  summary: CaseResult;
  caseDef: CaseDef;
  /** A1.4: sunucu modunda klinik özet sunucu sonucundan gelir (yerel vaka tanımında yok). */
  serverSummary: string | null;
  caseNumber: number;
  totalCases: number;
  isLast: boolean;
  onNext: () => void;
}): JSX.Element {
  const rows: { key: keyof ScoringWeights; label: string }[] = [
    { key: "technique", label: "Teknik" },
    { key: "localization", label: "Lokalizasyon" },
    { key: "recognition", label: "Tanıma" },
    { key: "interpretation", label: "Yorum" },
  ];
  return (
    <div className="card q-card-dark case-end-card">
      <div className="case-end-head">
        <h2>Vaka {caseNumber} / {totalCases} tamamlandı</h2>
        <span className="case-end-score">{Math.round(summary.total)} / 100</span>
      </div>
      <div className="case-end-bars">
        {rows.map((row) => {
          const domain = summary.domains[row.key];
          if (!domain || domain.max === 0) return null;
          const pct = Math.round((domain.earned / domain.max) * 100);
          return (
            <div className="ce-bar-row" key={row.key}>
              <span>{row.label}</span>
              <span className="ce-bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="ce-pct">%{pct}</span>
            </div>
          );
        })}
      </div>
      {(serverSummary ?? caseDef.feedback.summary) ? (
        <div className="case-end-block">
          <b>Klinik özet</b>
          <p>{serverSummary ?? caseDef.feedback.summary}</p>
        </div>
      ) : null}
      {caseDef.feedback.differential ? (
        <div className="case-end-block">
          <b>Ayırıcı düşünceler</b>
          <p>{caseDef.feedback.differential}</p>
        </div>
      ) : null}
      {caseDef.feedback.techniqueNotes ? <p className="case-end-note">{caseDef.feedback.techniqueNotes}</p> : null}
      <div className="q-nav">
        <button type="button" className="btn primary" style={{ flex: 1, ...HIT }} onClick={onNext}>
          {isLast ? "Sonuçları gör" : "Sonraki vaka"} <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

function checkboxChecked(target: unknown): boolean {
  return !!target && typeof target === "object" && "checked" in target && Boolean((target as { checked: unknown }).checked);
}

function KV({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

export type { SimulationPointerEvent };

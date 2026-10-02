import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { countUnlistenedInOtherView, otherViewHintText } from "../core/flow";
import { useStartMode } from "../core/LearnGate";
import { useStore } from "../core/StoreProvider";
import type { AuscultationPoint, CaseDef, CaseResult, ScoringWeights, SoundRecord } from "../core/types";
import pointsData from "../data/auscultation-points.json";
import { PatientStage, StageAudioProvider, type StageAudio, type StageHandle } from "../ui/PatientStage";
import { PediatricRefModal } from "../ui/PediatricRefModal";
import { RegionChipList } from "../ui/RegionChips";
import { ConfirmModal } from "../ui/ConfirmModal";
import { FeedbackCard, QuestionCard } from "../ui/Questions";
import { Toolbar, ToolbarAudioProvider, type ToolbarAudio } from "../ui/Toolbar";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { IconArrowRight, IconDoc, IconInfo } from "../ui/icons";
import { NOOP_MODAL_ENV, type ModalEnv } from "../ui/modal-env";
import {
  CASE_FLASH_MS,
  CASE_TRANSITION_MS,
  hasSessionProgress,
  isLastQuestion,
  planAssessmentAutoAdvance,
  planPrimaryAction,
  questionCursor,
  shouldStartCaseTransition,
  showCaseEndCard,
} from "./simulation/derive";
import {
  armTimer,
  bindDismissListeners,
  createNoopSimulationScreenEnv,
  rememberQuestionShown,
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
 *  `document`/`window`/`Date.now` yok; zaman `now`, dinleyici ve süre `env`.
 *  T196 (ADR-009): vakalar, doğru yanıtlar ve puanlama YALNIZ sunucu oturumundadır;
 *  istemcide yerel vaka havuzu yoktur. Oturum kanalı yoksa bu modlar açılmaz. */

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
    getActive: () => null,
    ensureContext: async () => undefined,
  };
}

export interface SimulationScreenProps {
  readonly embedded?: boolean;
  readonly env?: SimulationScreenEnv;
  readonly modalEnv?: ModalEnv;
  readonly audio?: SimulationAudio;
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
}: SimulationScreenProps): JSX.Element {
  const { state, dispatch } = useStore();
  const sessions = useSessions();
  const startMode = useStartMode();
  const serverMode = sessions !== undefined && state.mode !== "learn";
  const server = state.server;
  const startingRef = useRef(false);
  const loadingIndexRef = useRef(0);
  const finishingRef = useRef("");
  const total = server?.caseCount ?? 0;
  const currentCase: CaseDef | undefined =
    serverMode && server?.currentCase !== null && server?.currentCase !== undefined && server.loadedIndex === state.caseIndex + 1
      ? server.currentCase
      : undefined;

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
                  <button type="button" className="btn primary" style={HIT} onClick={() => startMode(state.mode)}>
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

  if (!currentCase || sessions === undefined || server === null) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: "relative", zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state" role="status">
              <h2>Bu mod için sunucu bağlantısı gerekir</h2>
              <p>Vakalar ve puanlama yalnız giriş yapılmış oturumda sunucudan gelir.</p>
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
          total={total}
          embedded={embedded}
          env={env}
          modalEnv={modalEnv}
          audio={audio}
          binding={{ sessions, server }}
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
  binding: ServerBinding;
}): JSX.Element {
  const { state, dispatch, bus, now } = useStore();
  const startMode = useStartMode();
  const isAssessment = state.mode === "assessment";
  const stageRef = useRef<StageHandle>(null);
  const shownAtRef = useRef<Record<string, number>>({});
  const firstCaseRef = useRef(true);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const [pedModalOpen, setPedModalOpen] = useState(false);
  const [sessionAction, setSessionAction] = useState(false);
  const [caseFlash, setCaseFlash] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const cursor = questionCursor(caseDef.questions, state.step, state.answers, state.revealed);
  const q = cursor.question;
  const serverCase = caseDef as ServerClientCase;
  const pointIds = useMemo(() => serverPointIds(serverCase), [serverCase]);
  const [busy, setBusy] = useState(false);
  // Çift tıklama/yarış: sunucu isteği sürerken ikinci birincil eylem yok sayılır (409 case_already_answered önlenir).
  const busyRef = useRef(false);
  const serverFeedback = q ? binding.server.feedback[q.id] : undefined;
  const pediatric = stageBody(caseDef) === "pediatrik";
  const endCard = showCaseEndCard(state.mode, state.pendingSummary);
  const progress = hasSessionProgress(state.answers, state.hintsUsed, state.caseResults.length);
  const lastCase = state.caseIndex + 1 >= total;

  useEffect(() => {
    dispatch({ type: "caseMount", caseDef });
    bus.emit({ type: "case_started", caseId: caseDef.id, mode: state.mode });
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

  /** A1.4: sunucu modunda birincil eylem — uygulamada soru sunucuda kontrol edilir, vaka sonu sunucuya gönderilir. */
  const runServerPrimary = async (plan: ReturnType<typeof planPrimaryAction>, server: ServerBinding) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const index = serverCase.serverIndex;
      if (plan.submitQid !== null) {
        // Uygulamada doğruluk sunucuda kontrol edilir; değerlendirmede geri bildirim oturum sonunda gelir.
        let correct = false;
        if (state.mode === "practice") {
          const checked = await checkServerQuestion(server.sessions, dispatch, server.server.sessionId, index, plan.submitQid, state.answers[plan.submitQid] ?? []);
          if (checked === null) return;
          correct = checked;
        }
        dispatch({ type: "submitAnswer", qid: plan.submitQid, correct });
      }
      if (plan.advance) dispatch({ type: "advance" });
      if (plan.finish) {
        dispatch({ type: "serverSnapshot", caseId: serverCase.id, snapshot: snapshotOf(serverCase, state.answers) });
        await submitServerCase(server.sessions, dispatch, server.server.sessionId, index, state.answers, state.telemetry);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onPrimary = () => {
    if (!q) return;
    const plan = planPrimaryAction({
      mode: state.mode,
      question: q,
      questions: caseDef.questions,
      revealed: cursor.revealed,
      canSubmit: cursor.canSubmit,
      shownAt: shownAtRef.current,
      now: now(),
    });
    void runServerPrimary(plan, binding);
  };

  const otherHint = isAssessment
    ? null
    : otherViewHintText(state.view, countUnlistenedInOtherView(POINTS, pointIds, state.view, state.telemetry.visits));

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
                  {binding.server.mode === "challenge" ? (
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
                    const audioToken = serverCase.serverAudio[pointId];
                    return audioToken === undefined
                      ? null
                      : serverSoundRecord(pointId, audioToken, binding.sessions.audioUrl(binding.server.sessionId, audioToken));
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
                {/* §14 dürüstlük: uygulamada bileşen kaydı çalınırken açıkça bildirilir; değerlendirmede not yok. */}
                {!isAssessment && activePoint !== null && serverCase.serverComponents[activePoint] !== undefined ? (
                  <div className="note-strip" style={{ marginTop: 8 }}>
                    <IconInfo width={17} height={17} />
                    <span className="small">
                      Sırtta kalp sesleri zayıf duyulur; bu noktada yalnız akciğer bileşeni (gerçek hasta kaydı) dinletilir.
                    </span>
                  </div>
                ) : null}
              </div>
              <Toolbar
                caseDef={caseDef}
                stageRef={stageRef}
                activePoint={activePoint}
                {...(state.mode === "practice" && q
                  ? { question: { ...q, ...(q.hint === undefined ? {} : { hint: binding.server.hints[q.id] ?? q.hint }) } }
                  : {})}
                onHint={() => {
                  dispatch({ type: "useHint" });
                  if (q) {
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
                    {state.mode === "practice" ? (
                      <button type="button" className="btn outline small" style={HIT} onClick={() => (progress ? setSessionAction(true) : startMode("practice"))}>
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
                  serverSummary={binding.server.metas[caseDef.id]?.summary ?? ""}
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
                  {state.mode === "practice" && cursor.revealed && serverFeedback !== undefined ? (
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
                      disabled={busy || binding.server.status === "submitting" || state.pendingSummary !== null || (!cursor.canSubmit && !(state.mode === "practice" && cursor.revealed))}
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
        open={sessionAction}
        title="Yeni oturum başlatılsın mı?"
        message="Bu oturumdaki yanıtlar silinir; ilerleme ve en iyi puan korunur."
        confirmLabel="Yeni oturum"
        cancelLabel="Vazgeç"
        onConfirm={() => {
          setSessionAction(false);
          startMode("practice");
        }}
        onCancel={() => setSessionAction(false)}
        env={modalEnv}
      />
    </>
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
  /** Klinik özet sunucu sonucundan gelir (istemci vaka tanımında yok). */
  serverSummary: string;
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
      {serverSummary ? (
        <div className="case-end-block">
          <b>Klinik özet</b>
          <p>{serverSummary}</p>
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

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { CaseDef, CaseResult, Question, ScoringWeights } from '../core/types'
import { ALL_CASES, poolFor } from '../data/pool'
import { ZONES } from '../data/zones'
import { getImage } from '../core/images'
import { isAnswerCorrect } from '../core/answers'
import { decodeMark, encodeMark } from '../core/geometry'
import { useStore } from '../core/StoreProvider'
import { isTimedOut, remainingSec } from '../core/flow'
import { aggregateResults } from '../core/scoring'
import { FilmViewer, type FilmViewerHandle } from '../ui/FilmViewer'
import { ZoneChips } from '../ui/ZoneChips'
import { QuestionCard, FeedbackCard } from '../ui/Questions'
import { Footer, EcgDeco } from '../ui/chrome'
import { ConfirmModal } from '../ui/ConfirmModal'
import { createNoopModalEnv, type ModalEnv } from '../ui/modal-env'
import {
  IconDoc,
  IconArrowRight,
  IconInfo,
  IconLightbulb,
  IconClock,
  IconChevronLeft,
} from '../ui/icons'
import { VIEW_TEXT, findingShort } from '../data/terminology'
import {
  caseTimeLimitSec,
  computeQuestionLatency,
  fmtSec,
  hasSimulationProgress,
  patientLine,
  planK3SessionRegeneration,
  planNewPracticeSample,
  planPrimaryAction,
  resolveSimulationSession,
  sourceNote,
} from './simulation-core'

/** Uygulama ve Değerlendirme: film solda, olgu/soru sağda (E2 §8 S16).
 *  Port: `Date.now`/`document` yok; zaman `now`, olaylar `bus`, etkileşimler `runtime` (S5);
 *  popover/modal sınırları enjekte edilir (S7/S9); oyunlaştırma `gamiEnabled` seam'i arkasında. */

/** Kaynak popover belge sınırı (`SourcePopover` mousedown/Esc; S9 deseni). */
export interface SimulationPopoverEnv {
  addEventListener(type: 'mousedown' | 'keydown', handler: (event: SimulationPopoverEvent) => void): void
  removeEventListener(type: 'mousedown' | 'keydown', handler: (event: SimulationPopoverEvent) => void): void
  containsNode(root: unknown, target: unknown): boolean
}

export interface SimulationPopoverEvent {
  readonly key?: string
  readonly target: unknown
}

export function createNoopSimulationPopoverEnv(): SimulationPopoverEnv {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    containsNode: () => false,
  }
}

const NOOP_POPOVER_ENV: SimulationPopoverEnv = createNoopSimulationPopoverEnv()
const NOOP_MODAL_ENV: ModalEnv = createNoopModalEnv()

/** Oyunlaştırma değerlendirme tamamlama kaydı (kaynak: `getGamiRepo().recordAttempt` — G4 seam). */
export interface SimulationGamiPort {
  recordAssessmentComplete(payload: { total: number; passed: boolean }, at: Date): void | Promise<void>
}

export interface SimulationScreenProps {
  /** Platform kabuğu modu: dekorasyon ve footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Kaynak popover belge sınırı; verilmezse güvenli no-op. */
  readonly popoverEnv?: SimulationPopoverEnv
  /** Onay modalı odak/Esc sınırı; verilmezse güvenli no-op. */
  readonly modalEnv?: ModalEnv
  /** Oyunlaştırma bayrağı (§7.7, G4); varsayılan kapalı. */
  readonly gamiEnabled?: boolean
  /** Oyunlaştırma kayıt seam'i; `gamiEnabled` açıkken değerlendirme oturumu tamamlanır. */
  readonly gami?: SimulationGamiPort
}

export function SimulationScreen({
  embedded = false,
  popoverEnv = NOOP_POPOVER_ENV,
  modalEnv = NOOP_MODAL_ENV,
  gamiEnabled = false,
  gami,
}: SimulationScreenProps): JSX.Element {
  const { state, dispatch, runtime, bus, now } = useStore()
  const isAssessment = state.mode === 'assessment'
  const pool = poolFor(state.mode)
  const { sessionCases, caseList, currentCase: caseDef } = resolveSimulationSession({
    mode: state.mode,
    practiceIds: state.session.practiceIds,
    assessmentIds: state.session.assessmentIds,
    caseIndex: state.caseIndex,
    allCases: ALL_CASES,
    pool,
  })

  // K3: devam ettirmede oturum listesi boşsa aynı tohumla yeniden üret
  useEffect(() => {
    const plan = planK3SessionRegeneration({
      mode: state.mode,
      sessionCasesCount: sessionCases.length,
      seed: state.session.seed,
      practiceIds: state.session.practiceIds,
      assessmentIds: state.session.assessmentIds,
      pool,
      now,
    })
    if (!plan) return
    dispatch({
      type: 'startSession',
      practiceIds: plan.practiceIds,
      assessmentIds: plan.assessmentIds,
      seed: plan.seed,
    })
  }, [
    dispatch,
    now,
    pool,
    sessionCases.length,
    state.mode,
    state.session.assessmentIds,
    state.session.practiceIds,
    state.session.seed,
  ])

  // oturum bitti → sonuç
  useEffect(() => {
    if (!caseList.length || state.caseIndex < caseList.length) return
    const agg = aggregateResults(state.caseResults)
    if (isAssessment) {
      runtime.reportScore(agg.total, agg.mastery, true)
      bus.emit({ type: 'assessment_completed', total: agg.total })
      if (gamiEnabled && gami) void gami.recordAssessmentComplete({ total: agg.total, passed: agg.mastery }, new Date(now()))
    }
    dispatch({ type: 'setResults', results: state.caseResults })
  }, [bus, caseList.length, dispatch, gami, gamiEnabled, isAssessment, now, runtime, state.caseIndex, state.caseResults])

  if (!caseDef) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state">
              <h2>Bu modda henüz vaka yok</h2>
              <p>
                Vaka havuzu görüntü envanterinden üretilir. Veri setini içe aktarıp vakaları yeniden üretin:
                <code> npm run import:nih -- &lt;klasör&gt;</code> ve <code>npm run cases</code>.
              </p>
              <button className="btn primary" type="button" onClick={() => dispatch({ type: 'goto', screen: 'modes' })}>
                Mod seçimine dön
              </button>
            </div>
          </div>
        </div>
        {!embedded && <Footer />}
      </>
    )
  }
  return (
    <CaseView
      key={`${state.mode}-${state.caseIndex}-${caseDef.id}`}
      caseDef={caseDef}
      total={caseList.length}
      embedded={embedded}
      popoverEnv={popoverEnv}
      modalEnv={modalEnv}
    />
  )
}

function CaseView({
  caseDef,
  total,
  embedded,
  popoverEnv,
  modalEnv,
}: {
  caseDef: CaseDef
  total: number
  embedded: boolean
  popoverEnv: SimulationPopoverEnv
  modalEnv: ModalEnv
}): JSX.Element {
  const { state, dispatch, runtime, bus, now } = useStore()
  const isAssessment = state.mode === 'assessment'
  const image = getImage(caseDef.imageId)
  const viewerRef = useRef<FilmViewerHandle>(null)
  const [activeZones, setActiveZones] = useState<string[]>([])
  const [hintOpen, setHintOpen] = useState(false)
  const shownAtRef = useRef<Record<string, number>>({})
  const [resampleAction, setResampleAction] = useState<'new' | 'retry' | null>(null)
  const hasProgress = hasSimulationProgress(state.answers, state.hintsUsed, state.caseResults.length)
  const doNewSample = useCallback(() => {
    const plan = planNewPracticeSample({
      assessmentIds: state.session.assessmentIds,
      pool: poolFor('practice'),
      now,
    })
    dispatch({ type: 'startSession', practiceIds: plan.practiceIds, assessmentIds: plan.assessmentIds, seed: plan.seed })
    dispatch({ type: 'startMode', mode: 'practice' })
  }, [dispatch, now, state.session.assessmentIds])
  const doRestartSession = useCallback(() => {
    dispatch({ type: 'startMode', mode: 'practice' })
  }, [dispatch])
  const requestResample = (action: 'new' | 'retry') => {
    if (!hasProgress) {
      if (action === 'new') doNewSample()
      else doRestartSession()
      return
    }
    setResampleAction(action)
  }
  const confirmResample = () => {
    if (resampleAction === 'new') doNewSample()
    else if (resampleAction === 'retry') doRestartSession()
    setResampleAction(null)
  }
  const q: Question | undefined = caseDef.questions[state.step]
  const revealed = q ? !!state.revealed[q.id] : false
  const given = q ? state.answers[q.id] ?? [] : []
  const canSubmit = !!q && given.length > 0
  const summaryOpen = !!state.pendingSummary
  const timeLimit = caseTimeLimitSec(caseDef, isAssessment)

  useEffect(() => {
    dispatch({ type: 'caseMount', caseDef })
    bus.emit({ type: 'case_started', caseId: caseDef.id, mode: state.mode })
  }, [bus, caseDef, dispatch, state.mode])

  useEffect(() => {
    if (q && shownAtRef.current[q.id] == null) shownAtRef.current[q.id] = now()
    setHintOpen(false)
  }, [q, now])

  useEffect(() => {
    if (isAssessment && state.pendingSummary) dispatch({ type: 'nextCase' })
  }, [dispatch, isAssessment, state.pendingSummary])

  const saveInteractions = useCallback(() => {
    const latency = computeQuestionLatency(caseDef.questions, shownAtRef.current, now())
    runtime.saveInteractions(caseDef.id, caseDef.questions, state.answers, image, latency)
  }, [caseDef.id, caseDef.questions, image, now, runtime, state.answers])

  const timedOut = isTimedOut(state.caseElapsed, timeLimit)
  useEffect(() => {
    if (!timedOut || summaryOpen || state.currentCaseId !== caseDef.id) return
    bus.emit({ type: 'case_timeout', caseId: caseDef.id })
    saveInteractions()
    dispatch({ type: 'finishCase' })
  }, [bus, caseDef.id, dispatch, runtime, saveInteractions, state.answers, state.currentCaseId, summaryOpen, timedOut])

  const primaryAction = () => {
    const plan = planPrimaryAction({
      mode: state.mode,
      question: q,
      questions: caseDef.questions,
      revealed,
      canSubmit,
      given,
      image,
    })
    for (const action of plan.dispatches) dispatch(action)
    if (plan.saveInteractions) saveInteractions()
  }

  const markEnabled = !!q && q.type === 'localization' && !revealed && !summaryOpen
  const mark = q?.type === 'localization' ? decodeMark(given[0]) : null
  const revealAnnotations = !isAssessment && ((q?.type === 'localization' && revealed) || summaryOpen)
  const annotationFinding = q?.type === 'localization' ? (q.targetFinding ?? null) : caseDef.primaryFinding

  const onZoneEnter = useCallback((ids: string[]) => dispatch({ type: 'zoneEnter', zoneIds: ids }), [dispatch])
  const onZoneDwell = useCallback((ids: string[], ms: number) => dispatch({ type: 'zoneDwell', zoneIds: ids, dwellMs: ms }), [dispatch])
  const remaining = remainingSec(state.caseElapsed, timeLimit)
  const primarySource = image?.findings[caseDef.primaryFinding]

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className={`sim-grid ${isAssessment ? 'mode-assessment' : 'mode-practice'}`}>
            <div className={`sim-main ${summaryOpen ? 'is-inert' : ''}`}>
              {isAssessment && state.caseIndex === 0 && (
                <div className="strict-banner" role="alert">
                  <strong>Değerlendirme.</strong>
                  <span className="strict-banner-detail">
                    {' '}
                    Okuma bölgesi katmanı, uzman işaretlemesi ve ipucu kapalı; her vaka için süre sınırı vardır.
                  </span>
                </div>
              )}
              <div className="stage-card film-card">
                <FilmViewer
                  ref={viewerRef}
                  image={image}
                  zones={ZONES}
                  showZones={!isAssessment && state.showZones && image?.modality !== 'CT' && q?.type !== 'localization'}
                  showAnnotations={revealAnnotations}
                  annotationFinding={annotationFinding}
                  strict={isAssessment}
                  markEnabled={markEnabled}
                  mark={mark}
                  onMark={(p) => {
                    if (!q) return
                    dispatch({ type: 'answer', qid: q.id, values: [encodeMark(p)] })
                    bus.emit({ type: 'mark_placed', qid: q.id })
                  }}
                  onZoneEnter={onZoneEnter}
                  onZoneDwell={onZoneDwell}
                  onActiveZones={setActiveZones}
                  onTool={(tool) => dispatch({ type: 'toolUsed', tool })}
                  {...(isAssessment ? {} : { onToggleZones: () => dispatch({ type: 'toggleZones' }) })}
                  inert={summaryOpen}
                />
                <ZoneChips
                  zones={ZONES}
                  visits={state.telemetry.visits}
                  activeZones={activeZones}
                  minDwellMs={caseDef.technique.minDwellMs}
                  onSelect={(id) => viewerRef.current?.focusZone(id)}
                  hideUntilFocus={isAssessment}
                />
              </div>
            </div>

            <div className="sim-side">
              {state.topicReturn && !isAssessment && (
                <button type="button" className="btn outline small topic-return" onClick={() => dispatch({ type: 'returnToTopic' })}>
                  <IconChevronLeft width={14} height={14} /> Görüntüye dön: {state.topicReturn.title}
                </button>
              )}
              <div className="card case-card">
                <div className="card-title-row">
                  <div className="ic"><IconDoc /></div>
                  <h3>Olgu</h3>
                  <div className="card-title-actions">
                    <span className="badge blue">Vaka {state.caseIndex + 1}/{total}</span>
                    {remaining != null && (
                      <span className={`badge ${remaining <= 30 ? 'orange' : 'purple'} case-timer`} aria-live="off">
                        <IconClock width={13} height={13} /> {fmtSec(remaining)}
                      </span>
                    )}
                    {!isAssessment && <SourcePopover text={sourceNote(caseDef, primarySource, image)} env={popoverEnv} />}
                  </div>
                </div>
                <p className="case-line">
                  <strong>{patientLine(caseDef)}</strong> {caseDef.chiefComplaint}
                  <span className="case-history-full"> {caseDef.history}</span>
                </p>
                <div className="kv-grid">
                  <KV k="Projeksiyon" v={VIEW_TEXT[image?.viewPosition ?? 'unknown'] ?? 'Bilinmiyor'} />
                  {caseDef.vitalSigns.hr && <KV k="Nabız" v={`${caseDef.vitalSigns.hr}/dk`} />}
                  {caseDef.vitalSigns.rr && <KV k="Solunum" v={`${caseDef.vitalSigns.rr}/dk`} />}
                  {caseDef.vitalSigns.spo2 && <KV k="SpO₂" v={`%${caseDef.vitalSigns.spo2}`} />}
                  {caseDef.vitalSigns.temp != null && caseDef.vitalSigns.temp !== '' && (
                    <KV k="Ateş" v={caseDef.vitalSigns.temp} />
                  )}
                </div>
                {!isAssessment && (
                  <div className="sim-resample-row">
                    <button type="button" className="btn outline small" onClick={() => requestResample('new')}>
                      Yeni 10 vaka örneklemi
                    </button>
                    <button type="button" className="btn outline small" onClick={() => requestResample('retry')}>
                      Oturumu yeniden başlat
                    </button>
                  </div>
                )}
              </div>

              {summaryOpen && !isAssessment && state.pendingSummary ? (
                <CaseEndCard
                  summary={state.pendingSummary}
                  caseDef={caseDef}
                  caseNumber={state.caseIndex + 1}
                  totalCases={total}
                  isLast={state.caseIndex + 1 >= total}
                  onNext={() => dispatch({ type: 'nextCase' })}
                />
              ) : q ? (
                <div className="card q-card-dark">
                  <QuestionCard
                    q={q}
                    caseId={caseDef.id}
                    value={given}
                    onChange={(values) => dispatch({ type: 'answer', qid: q.id, values })}
                    revealed={revealed}
                    index={state.step}
                    total={caseDef.questions.length}
                  />
                  {hintOpen && q.hint && (
                    <div className="hint-box" role="note">
                      <IconLightbulb />
                      <span>{q.hint} <span className="muted small">(ipucu: −5 puan)</span></span>
                    </div>
                  )}
                  {state.mode === 'practice' && revealed && (
                    <FeedbackCard correct={isAnswerCorrect(q, given, image)} q={q} given={given} />
                  )}
                  <div className="q-nav">
                    {state.mode === 'practice' && q.hint && !hintOpen && !revealed && (
                      <button
                        type="button"
                        className="btn outline small"
                        onClick={() => { dispatch({ type: 'useHint' }); setHintOpen(true) }}
                        title="İpucu kullanımı −5 puan"
                      >
                        <IconLightbulb /> İpucu
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn ${isAssessment ? 'purple' : 'primary'}`}
                      style={{ flex: 1 }}
                      onClick={primaryAction}
                      disabled={!canSubmit && !(state.mode === 'practice' && revealed)}
                    >
                      {state.mode === 'practice' && revealed
                        ? caseDef.questions[caseDef.questions.length - 1]?.id === q.id ? 'Vakayı tamamla' : 'Devam et'
                        : 'Yanıtla'} <IconArrowRight />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {!embedded && <Footer />}
      <ConfirmModal
        open={resampleAction !== null}
        title="Yeni örneklem alınsın mı?"
        message="Bu oturumdaki yanıtlar silinir; ilerleme ve en iyi puan korunur."
        confirmLabel="Evet, devam et"
        cancelLabel="Vazgeç"
        onConfirm={confirmResample}
        onCancel={() => setResampleAction(null)}
        env={modalEnv}
      />
    </>
  )
}

function CaseEndCard({ summary, caseDef, caseNumber, totalCases, isLast, onNext }: {
  summary: CaseResult
  caseDef: CaseDef
  caseNumber: number
  totalCases: number
  isLast: boolean
  onNext: () => void
}): JSX.Element {
  const rows: { key: keyof ScoringWeights; label: string }[] = [
    { key: 'technique', label: 'Okuma kapsamı' },
    { key: 'systematic', label: 'ABCDE sırası' },
    { key: 'quality', label: 'Film kalitesi' },
    { key: 'recognition', label: 'Bulgu tanıma' },
    { key: 'localization', label: 'Lokalizasyon' },
    { key: 'interpretation', label: 'Yorum' },
  ]
  return (
    <div className="card q-card-dark case-end-card">
      <div className="case-end-head">
        <h2>Vaka {caseNumber} / {totalCases} tamamlandı</h2>
        <span className="case-end-score">{Math.round(summary.total)} / 100</span>
      </div>
      <div className="case-end-bars">
        {rows.map((d) => {
          const v = summary.domains[d.key]
          if (!v || v.max === 0) return null
          const pct = Math.round((v.earned / v.max) * 100)
          return (
            <div className="ce-bar-row" key={d.key}>
              <span>{d.label}</span>
              <span className="ce-bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="ce-pct">%{pct}</span>
            </div>
          )
        })}
      </div>
      <div className="case-end-block">
        <b>
          {caseDef.mappingValidation === 'validated'
            ? `Ana bulgu: ${findingShort(caseDef.primaryFinding)}`
            : `Rapor etiketi (doğrulanmamış): ${findingShort(caseDef.primaryFinding)}`}
        </b>
        <p>{caseDef.feedback.summary}</p>
      </div>
      {caseDef.feedback.differential && (
        <div className="case-end-block">
          <b>Ayırıcı düşünceler</b>
          <p>{caseDef.feedback.differential}</p>
        </div>
      )}
      {caseDef.feedback.techniqueNotes && <p className="case-end-note">{caseDef.feedback.techniqueNotes}</p>}
      <div className="q-nav">
        <button type="button" className="btn primary" style={{ flex: 1 }} onClick={onNext}>
          {isLast ? 'Sonuçları gör' : 'Sonraki vaka'} <IconArrowRight />
        </button>
      </div>
    </div>
  )
}

function SourcePopover({ text, env }: { text: string; env: SimulationPopoverEnv }): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<unknown>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: SimulationPopoverEvent) => {
      if (wrapRef.current && e.target != null && !env.containsNode(wrapRef.current, e.target)) setOpen(false)
    }
    const onKey = (e: SimulationPopoverEvent) => { if (e.key === 'Escape') setOpen(false) }
    env.addEventListener('mousedown', onDoc)
    env.addEventListener('keydown', onKey)
    return () => {
      env.removeEventListener('mousedown', onDoc)
      env.removeEventListener('keydown', onKey)
    }
  }, [open, env])
  return (
    <div className="popover-wrap" ref={(el) => { wrapRef.current = el }} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="btn outline small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconInfo width={14} height={14} /> Görüntü kaynağı
      </button>
      {open && <div className="popover" role="note">{text}</div>}
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  )
}

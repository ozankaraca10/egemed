import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { SimSessionSource } from '@egemed/sim-host'
import type { CaseDef, CaseResult, Question, ScoringWeights } from '../core/types'
import { decodeMark, encodeMark } from '../core/geometry'
import { useStartMode } from '../core/LearnGate'
import { useStore } from '../core/StoreProvider'
import { isTimedOut, remainingSec } from '../core/flow'
import { FilmViewer, type FilmViewerHandle } from '../ui/FilmViewer'
import { ZoneChips } from '../ui/ZoneChips'
import { QuestionCard, FeedbackCard } from '../ui/Questions'
import { Footer, EcgDeco } from '../ui/chrome'
import { ConfirmModal } from '../ui/ConfirmModal'
import { createNoopModalEnv, type ModalEnv } from '../ui/modal-env'
import {
  IconDoc,
  IconArrowRight,
  IconReplay,
  IconLightbulb,
  IconClock,
  IconChevronLeft,
} from '../ui/icons'
import { VIEW_TEXT } from '../data/terminology'
import { fmtSec, hasSimulationProgress, patientLine, planPrimaryAction } from './simulation-core'
import { useSessions } from '../EmbeddedContext'
import {
  checkServerQuestion,
  finishServerSession,
  loadServerCase,
  requestServerHint,
  startServerSession,
  submitServerCase,
} from '../core/serverDriver'
import { snapshotOf, type ServerClientCase, type ServerSessionState } from '../core/serverSession'

/** Uygulama ve Değerlendirme (E2 §8 S16).
 *  A2.3 (ADR-009): vakalar, doğru yanıtlar ve puanlama YALNIZ sunucu oturumundadır;
 *  istemcide yerel vaka havuzu ve görüntü kaydı yoktur. Görüntü oturum jetonlu
 *  vekil adresinden gelir; bulgu/işaret katmanları gösterilmez. Oturum kanalı
 *  yoksa bu modlar açılmaz. */

interface ServerBinding {
  readonly sessions: SimSessionSource
  readonly server: ServerSessionState
}

const NOOP_MODAL_ENV: ModalEnv = createNoopModalEnv()

export interface SimulationScreenProps {
  /** Platform kabuğu modu: dekorasyon ve footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Onay modalı odak/Esc sınırı; verilmezse güvenli no-op. */
  readonly modalEnv?: ModalEnv
}

function primaryLabel(isAssessment: boolean, last: boolean, lastCase: boolean, revealed: boolean): string {
  if (isAssessment) return last && lastCase ? 'Yanıtları değerlendir' : 'Sonraki soru'
  if (revealed) return last ? 'Vakayı tamamla' : 'Devam et'
  return 'Yanıtla'
}

export function SimulationScreen({ embedded = false, modalEnv = NOOP_MODAL_ENV }: SimulationScreenProps): JSX.Element {
  const { state, dispatch } = useStore()
  const startMode = useStartMode()
  const sessions = useSessions()
  const serverMode = sessions !== undefined && state.mode !== 'learn'
  const server = state.server
  const startingRef = useRef(false)
  const loadingIndexRef = useRef(0)
  const finishingRef = useRef('')
  const total = server?.caseCount ?? 0
  const currentCase: CaseDef | undefined =
    serverMode && server?.currentCase !== null && server?.currentCase !== undefined && server.loadedIndex === state.caseIndex + 1
      ? server.currentCase
      : undefined

  // Sunucu oturumunu başlat (yeni mod `server`ı sıfırlar).
  useEffect(() => {
    if (!serverMode || sessions === undefined || server !== null || startingRef.current) return
    if (state.mode !== 'practice' && state.mode !== 'assessment') return
    startingRef.current = true
    loadingIndexRef.current = 1
    finishingRef.current = ''
    void startServerSession(sessions, dispatch, state.mode, state.serverFocus, state.serverChallengeId).finally(() => {
      startingRef.current = false
    })
  }, [dispatch, server, serverMode, sessions, state.mode, state.serverFocus, state.serverChallengeId])

  // Sıradaki vakayı yükle (sonuç kartı kapanıp `nextCase` sonrası).
  useEffect(() => {
    if (!serverMode || sessions === undefined || server === null || server.status !== 'ready') return
    const next = state.caseIndex + 1
    if (state.pendingSummary !== null || next <= server.loadedIndex || next > server.caseCount) return
    if (loadingIndexRef.current >= next) return
    loadingIndexRef.current = next
    void loadServerCase(sessions, dispatch, server.sessionId, next, server.mode)
  }, [dispatch, server, serverMode, sessions, state.caseIndex, state.pendingSummary])

  // Tüm vakalar bitince oturumu sunucuda kapat; sonuçlar (değerlendirmede geri bildirim) buradan gelir.
  useEffect(() => {
    if (!serverMode || sessions === undefined || server === null) return
    if (state.caseIndex < server.caseCount || server.status !== 'ready') return
    if (finishingRef.current === server.sessionId) return
    finishingRef.current = server.sessionId
    void finishServerSession(sessions, dispatch, server.sessionId)
  }, [dispatch, server, serverMode, sessions, state.caseIndex])

  if (serverMode && !currentCase) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state" role={server?.status === 'error' ? 'alert' : 'status'}>
              {server?.status === 'error' ? (
                <>
                  <h2>Vaka yüklenemedi</h2>
                  <p>{server.error}</p>
                  <button type="button" className="btn primary" onClick={() => startMode(state.mode)}>
                    Yeniden dene
                  </button>
                </>
              ) : (
                <h2>{state.caseIndex >= (server?.caseCount ?? Number.POSITIVE_INFINITY) ? 'Sonuçlar hazırlanıyor…' : 'Vaka hazırlanıyor…'}</h2>
              )}
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
      </>
    )
  }

  if (!currentCase || sessions === undefined || server === null) {
    return (
      <>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
          <div className="container screen-body">
            <div className="card empty-state" role="status">
              <h2>Bu mod için sunucu bağlantısı gerekir</h2>
              <p>Vakalar ve puanlama yalnız giriş yapılmış oturumda sunucudan gelir.</p>
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
      </>
    )
  }

  return (
    <CaseView
      key={`${state.mode}-${state.caseIndex}-${currentCase.id}`}
      caseDef={currentCase}
      total={total}
      embedded={embedded}
      modalEnv={modalEnv}
      binding={{ sessions, server }}
    />
  )
}

function CaseView({
  caseDef,
  total,
  embedded,
  modalEnv,
  binding,
}: {
  caseDef: CaseDef
  total: number
  embedded: boolean
  modalEnv: ModalEnv
  binding: ServerBinding
}): JSX.Element {
  const { state, dispatch, bus } = useStore()
  const startMode = useStartMode()
  const isAssessment = state.mode === 'assessment'
  const serverCase = caseDef as ServerClientCase
  const image = serverCase.serverImage
  const readingZones = serverCase.readingZones
  const q: Question | undefined = caseDef.questions[state.step]
  const given = q ? state.answers[q.id] ?? [] : []
  const revealed = q ? !!state.revealed[q.id] : false
  const canSubmit = !!q && given.length > 0
  const summaryOpen = !!state.pendingSummary
  const lastCase = state.caseIndex + 1 >= total
  const limitSec = binding.server.perCaseLimitMs !== null ? Math.round(binding.server.perCaseLimitMs / 1000) : undefined
  const viewerRef = useRef<FilmViewerHandle>(null)
  const [activeZones, setActiveZones] = useState<string[]>([])
  const [hintOpen, setHintOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Çift tıklama/yarış: sunucu isteği sürerken ikinci birincil eylem yok sayılır (409 case_already_answered önlenir).
  const busyRef = useRef(false)
  const serverFeedback = q ? binding.server.feedback[q.id] : undefined
  const hasProgress = hasSimulationProgress(state.answers, state.hintsUsed, state.caseResults.length)

  useEffect(() => {
    dispatch({ type: 'caseMount', caseDef })
    bus.emit({ type: 'case_started', caseId: caseDef.id, mode: state.mode })
  }, [bus, caseDef, dispatch, state.mode])

  useEffect(() => {
    setHintOpen(false)
  }, [q])

  useEffect(() => {
    if (isAssessment && state.pendingSummary) dispatch({ type: 'nextCase' })
  }, [dispatch, isAssessment, state.pendingSummary])

  const timedOut = isTimedOut(state.caseElapsed, limitSec)
  useEffect(() => {
    if (!timedOut || summaryOpen || state.currentCaseId !== caseDef.id) return
    if (busyRef.current) return
    busyRef.current = true
    bus.emit({ type: 'case_timeout', caseId: caseDef.id })
    dispatch({ type: 'serverSnapshot', caseId: serverCase.id, snapshot: snapshotOf(serverCase, state.answers) })
    void submitServerCase(binding.sessions, dispatch, binding.server.sessionId, serverCase.serverIndex, state.answers, state.telemetry).finally(() => {
      busyRef.current = false
    })
  }, [binding.server.sessionId, binding.sessions, bus, caseDef.id, dispatch, serverCase, state.answers, state.currentCaseId, state.telemetry, summaryOpen, timedOut])

  /** A2.3: birincil eylem — uygulamada soru sunucuda kontrol edilir, vaka sonu sunucuya gönderilir. */
  const runServerPrimary = async (plan: ReturnType<typeof planPrimaryAction>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const index = serverCase.serverIndex
      if (plan.submitQid !== null) {
        // Uygulamada doğruluk sunucuda kontrol edilir; değerlendirmede geri bildirim oturum sonunda gelir.
        let correct = false
        if (state.mode === 'practice') {
          const checked = await checkServerQuestion(binding.sessions, dispatch, binding.server.sessionId, index, plan.submitQid, state.answers[plan.submitQid] ?? [])
          if (checked === null) return
          correct = checked
        }
        dispatch({ type: 'submitAnswer', qid: plan.submitQid, correct })
      }
      if (plan.advance) dispatch({ type: 'advance' })
      if (plan.finish) {
        dispatch({ type: 'serverSnapshot', caseId: serverCase.id, snapshot: snapshotOf(serverCase, state.answers) })
        await submitServerCase(binding.sessions, dispatch, binding.server.sessionId, index, state.answers, state.telemetry)
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const onPrimary = () => {
    if (!q) return
    const plan = planPrimaryAction({
      mode: state.mode,
      question: q,
      questions: caseDef.questions,
      revealed,
      canSubmit,
    })
    void runServerPrimary(plan)
  }

  const markEnabled = !!q && q.type === 'localization' && !revealed && !summaryOpen
  const mark = q?.type === 'localization' ? decodeMark(given[0]) : null
  const onZoneEnter = useCallback((ids: string[]) => dispatch({ type: 'zoneEnter', zoneIds: ids }), [dispatch])
  const onZoneDwell = useCallback((ids: string[], ms: number) => dispatch({ type: 'zoneDwell', zoneIds: ids, dwellMs: ms }), [dispatch])
  const remaining = remainingSec(state.caseElapsed, limitSec)
  const endCard = summaryOpen && !isAssessment

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          <div className={`sim-grid ${isAssessment ? 'mode-assessment' : 'mode-practice'}`}>
            <div className={`sim-main ${endCard ? 'is-inert' : ''}`}>
              {isAssessment && (
                <div className="strict-banner" role="alert">
                  {binding.server.mode === 'challenge' ? (
                    <span>
                      <strong>Meydan Okuma.</strong> Rakibinizle aynı vakalar · vaka başı 2 dk, toplam 8 dk · ipucu yok
                    </span>
                  ) : (
                    <>
                      <strong>Değerlendirme.</strong>
                      <span className="strict-banner-detail"> Okuma bölgesi katmanı, uzman işaretlemesi ve ipucu kapalı; her vaka için süre sınırı vardır.</span>
                    </>
                  )}
                </div>
              )}
              <div className="stage-card film-card">
                <FilmViewer
                  ref={viewerRef}
                  image={image}
                  zones={readingZones}
                  showZones={!isAssessment && state.showZones && readingZones.length > 0 && q?.type !== 'localization'}
                  showAnnotations={false}
                  annotationFinding={null}
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
                {readingZones.length > 0 ? (
                  <ZoneChips
                    zones={readingZones}
                    visits={state.telemetry.visits}
                    activeZones={activeZones}
                    minDwellMs={caseDef.technique.minDwellMs}
                    onSelect={(id) => viewerRef.current?.focusZone(id)}
                    hideUntilFocus={isAssessment}
                  />
                ) : (
                  <p className="note-strip zone-empty-note" role="status">
                    Bu görüntü için okuma bölgesi tanımlı değil.{serverCase.noZonesReason ? ` ${serverCase.noZonesReason}` : ''}
                  </p>
                )}
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
                    {!isAssessment && (
                      // T324: yeniden başlatma başlık satırında simge düğmesi (dikey yer kazanımı).
                      <button
                        type="button"
                        className="btn outline small icon-btn case-restart"
                        aria-label="Oturumu yeniden başlat"
                        title="Oturumu yeniden başlat"
                        onClick={() => (hasProgress ? setRestartOpen(true) : startMode('practice'))}
                      >
                        <IconReplay width={16} height={16} />
                      </button>
                    )}
                    {remaining != null && (
                      <span className={`badge ${remaining <= 30 ? 'orange' : 'purple'} case-timer`} aria-live="off">
                        <IconClock width={13} height={13} /> {fmtSec(remaining)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="case-line">
                  <strong>{patientLine(caseDef)}</strong> {caseDef.chiefComplaint}
                  <span className="case-history-full"> {caseDef.history}</span>
                  <span className="case-view"> Projeksiyon: {VIEW_TEXT[image.viewPosition] ?? 'bilinmiyor'}.</span>
                </p>
                <div className="kv-grid">
                  {caseDef.vitalSigns.hr && <KV k="Nabız" v={`${caseDef.vitalSigns.hr}/dk`} />}
                  {caseDef.vitalSigns.rr && <KV k="Solunum" v={`${caseDef.vitalSigns.rr}/dk`} />}
                  {caseDef.vitalSigns.spo2 && <KV k="SpO₂" v={`%${caseDef.vitalSigns.spo2}`} />}
                  {caseDef.vitalSigns.temp != null && caseDef.vitalSigns.temp !== '' && (
                    <KV k="Ateş" v={caseDef.vitalSigns.temp} />
                  )}
                </div>
              </div>

              {endCard && state.pendingSummary ? (
                <CaseEndCard
                  summary={state.pendingSummary}
                  meta={binding.server.metas[caseDef.id]}
                  caseNumber={state.caseIndex + 1}
                  totalCases={total}
                  isLast={lastCase}
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
                      <span>{binding.server.hints[q.id] ?? q.hint} <span className="muted small">(ipucu: −5 puan)</span></span>
                    </div>
                  )}
                  {state.mode === 'practice' && revealed && serverFeedback !== undefined && (
                    <FeedbackCard
                      correct={serverFeedback.correct}
                      q={{ ...q, correct: [...serverFeedback.correctOptionIds], feedbackCorrect: serverFeedback.feedback, feedbackIncorrect: serverFeedback.feedback }}
                      given={given}
                      showMarkGuidance={false}
                    />
                  )}
                  <div className="q-nav">
                    {state.mode === 'practice' && q.hint && !hintOpen && !revealed && (
                      <button
                        type="button"
                        className="btn outline small"
                        onClick={() => {
                          dispatch({ type: 'useHint' })
                          setHintOpen(true)
                          void requestServerHint(binding.sessions, dispatch, binding.server.sessionId, serverCase.serverIndex, q.id)
                        }}
                        title="İpucu kullanımı −5 puan"
                      >
                        <IconLightbulb /> İpucu
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn ${isAssessment ? 'purple' : 'primary'}`}
                      style={{ flex: 1 }}
                      onClick={onPrimary}
                      disabled={busy || binding.server.status === 'submitting' || summaryOpen || (!canSubmit && !(state.mode === 'practice' && revealed))}
                    >
                      {primaryLabel(isAssessment, caseDef.questions[caseDef.questions.length - 1]?.id === q.id, lastCase, revealed)} <IconArrowRight />
                    </button>
                  </div>
                  {state.mode === 'practice' && (
                    <p className="q-hint-note">İpucu kullanmak uygulama puanını düşürür; değerlendirmede ipucu yoktur.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
      <ConfirmModal
        open={restartOpen}
        title="Oturum yeniden başlatılsın mı?"
        message="Bu oturumdaki yanıtlar silinir; ilerleme ve en iyi puan korunur."
        confirmLabel="Yeniden başlat"
        cancelLabel="Vazgeç"
        onConfirm={() => {
          setRestartOpen(false)
          startMode('practice')
        }}
        onCancel={() => setRestartOpen(false)}
        env={modalEnv}
      />
    </>
  )
}

function CaseEndCard({
  summary,
  meta,
  caseNumber,
  totalCases,
  isLast,
  onNext,
}: {
  summary: CaseResult
  meta: { readonly title: string; readonly diagnosis: string | null; readonly summary: string } | undefined
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
      {meta ? (
        <div className="case-end-block">
          <b>{meta.diagnosis ? `Tanı: ${meta.diagnosis}` : meta.title}</b>
          <p>{meta.summary}</p>
        </div>
      ) : null}
      <div className="q-nav">
        <button type="button" className="btn primary" style={{ flex: 1 }} onClick={onNext}>
          {isLast ? 'Sonuçları gör' : 'Sonraki vaka'} <IconArrowRight />
        </button>
      </div>
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

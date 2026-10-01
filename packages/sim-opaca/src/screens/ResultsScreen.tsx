import { Fragment, useCallback, useMemo, useState, type JSX, type ReactNode } from 'react'
import { useStore } from '../core/StoreProvider'
import { useChallenge } from '../EmbeddedContext'
import { useStartMode } from '../core/LearnGate'
import { Footer, EcgDeco } from '../ui/chrome'
import { ScreenHeading } from '../ui/ScreenHeading'
import { aggregateResults } from '../core/scoring'
import { firstWeakLibraryKey, weakDomainKeys } from '../core/flow'
import { decodeMark } from '../core/geometry'
import { reviewOf, type ServerReview } from '../core/serverSession'
import { GamiGainsView } from '@egemed/gami-ui'
import { useOpacaSessionGains } from '../gamification/sessionGains'
import { opacaGamiIcons } from '../ui/opacaGami'
import { useGamiContext } from '../gamification/GamiContext'
import { getGamiRepo } from '../gamification/bindings'
import {
  IconScan,
  IconLungs,
  IconFilm,
  IconDoc,
  IconCheckCircle,
  IconExit,
  IconClock,
  IconChevronRight,
  IconTarget,
} from '../ui/icons'
import type { ScoringWeights } from '../core/types'

/** Sonuç ekranı (E2 §8 S17): özet şerit, alan bazlı yüzde performans, genişleyebilir vaka raporu.
 *  Port: `Date.now`/`window` yok; tohum `now`, çıkış `ResultsScreenEnv`, oyunlaştırma `gamiEnabled`
 *  seam'i arkasında; `cmi.learner_name` ve `opaca.gami.v1` profil adı yolu kesilir (§7.1, KVKK).
 *  A2.3 (ADR-009): vaka raporu sunucu anlık görüntüsü + sonuç meta verisinden kurulur;
 *  istemcide yerel vaka havuzu yoktur. */

/** LMS çıkış seam'i (kaynak: `runtime.flags.scormAvailable` + `window.close`). */
export interface ResultsScreenEnv {
  /** LMS/SCORM bağlıysa çıkışta oturumu sonlandır ve pencere kapatmayı dene. */
  readonly lmsAttached: boolean
  requestClose(): void
}

export function createNoopResultsScreenEnv(): ResultsScreenEnv {
  return { lmsAttached: false, requestClose: () => undefined }
}

const NOOP_RESULTS_ENV: ResultsScreenEnv = createNoopResultsScreenEnv()

/** @deprecated GamiGains doğrudan kullanılır; geriye dönük seam. */
export interface ResultsGamiPort {
  recordSessionResults(
    payload: { mode: 'practice' | 'assessment'; seed: number; durationMs: number; resultCount: number },
    at: Date
  ): void | Promise<void>
}

export interface ResultsScreenProps {
  readonly embedded?: boolean
  readonly env?: ResultsScreenEnv
  readonly gamiEnabled?: boolean
  readonly devBuild?: boolean
  readonly gains?: ReactNode
}

export function ResultsScreen({
  embedded = false,
  env = NOOP_RESULTS_ENV,
  gamiEnabled = true,
  gains,
}: ResultsScreenProps): JSX.Element {
  const { state, dispatch, runtime, now } = useStore()
  const startMode = useStartMode()
  // API oturumunda veri sunucudan: kazanım kartında “Demo verisi” etiketi yok.
  const gamiServer = useGamiContext().gamification !== undefined
  const isAssessment = state.mode === 'assessment'
  const agg = aggregateResults(state.caseResults)
  const total = agg.total
  const passed = agg.mastery
  const domains = state.caseResults.length ? agg.domains : null
  const [expanded, setExpanded] = useState<string | null>(null)

  const domainRows: { key: keyof ScoringWeights; label: string; icon: ReactNode }[] = [
    { key: 'technique', label: 'Okuma kapsamı', icon: <IconScan /> },
    { key: 'systematic', label: 'ABCDE sırası', icon: <IconScan /> },
    { key: 'quality', label: 'Film kalitesi', icon: <IconFilm /> },
    { key: 'recognition', label: 'Bulgu tanıma', icon: <IconLungs /> },
    { key: 'localization', label: 'Lokalizasyon', icon: <IconTarget /> },
    { key: 'interpretation', label: 'Klinik yorum', icon: <IconDoc /> },
    { key: 'diagnosis', label: 'Tanı (varsa)', icon: <IconCheckCircle /> },
  ]

  const exit = () => {
    if (env.lmsAttached && !runtime.terminated) runtime.terminate()
    if (env.lmsAttached) env.requestClose()
    dispatch({ type: 'goto', screen: 'start' })
  }

  const retrySame = () => {
    // Yeni oturumu sunucu sürücüsü başlatır (istemcide örneklem yok).
    // T218: öğrenme kilidi burada da geçerli (koruma tek noktada: `canStartMode`).
    startMode(state.mode)
  }

  // ADR-010: düelloda sonuç ekranından kazanan ekranına dönüş (Ausculta deseni).
  const challenge = useChallenge()

  /** A2.3: vaka raporu sunucu anlık görüntüsü (soru metni/seçenekler) + sonuç
   *  meta verisinden (doğru seçenek jetonları, geri bildirim, başlık) kurulur. */
  const reviewFor = (caseId: string): ServerReview => (state.server === null ? { title: caseId, questions: [] } : reviewOf(state.server, caseId))

  // Sunucu sonucu bulgu/kütüphane anahtarı taşımaz; zayıf konu odağı şimdilik yok.
  const weakLearnKey = firstWeakLibraryKey(state.caseResults, () => null)

  const studyLearn = () => {
    if (weakLearnKey) dispatch({ type: 'setLearnFocus', key: weakLearnKey })
    startMode('learn')
    dispatch({ type: 'goto', screen: 'learn' })
  }

  const weakLabels: Record<string, string> = {
    technique: 'Okuma kapsamı',
    systematic: 'ABCDE sırası',
    quality: 'Film kalitesi',
    localization: 'Lokalizasyon',
    recognition: 'Bulgu tanıma',
    interpretation: 'Klinik yorum',
    diagnosis: 'Tanı',
  }
  const weakKeys = weakDomainKeys(domains, 60)

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  const repo = useMemo(() => getGamiRepo(), [])
  // useOpacaSessionGains etkisi finishedAt'ı bağımlılık okur; her render'da yeni
  // Date kimliği etkiyi sonsuz döngüye sokup sonuç ekranını kilitler (T116b).
  const finishedAt = useMemo(() => new Date(now()), [now])
  // A2.3: sunucu oturumunda denemeyi sunucu yazar; kazanım kartı yerel yazım yapmaz
  // (`persist: false`), yalnız bu oturumun tahmini kazanımını gösterir.
  const serverManaged = state.server !== null
  const cases = state.server?.cases
  // Kimlik sabit olmalı: her render'da yeni fonksiyon, kazanım etkisini sonsuz döngüye sokar.
  const caseById = useCallback((id: string) => cases?.[id], [cases])
  const gainsModel = useOpacaSessionGains(
    gamiEnabled && state.mode !== 'learn' && state.caseResults.length > 0
      ? {
          repo,
          mode: state.mode === 'assessment' ? 'assessment' : 'practice',
          results: state.caseResults,
          caseById,
          seed: state.session.seed,
          durationMs: state.assessmentTimer,
          finishedAt,
          persist: !serverManaged,
        }
      : null,
  )
  const defaultGains = gainsModel ? (
    <GamiGainsView
      gains={gainsModel}
      icons={opacaGamiIcons}
      onAchievements={() => dispatch({ type: 'goto', screen: 'achievements' })}
      onLeaderboard={() => dispatch({ type: 'goto', screen: 'leaderboard' })}
      {...(gamiServer ? { demoLabel: '' } : {})}
    />
  ) : null

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="results-wrap-v2 screen-body">
          <ScreenHeading className="results-title-v2 results-title">
            {isAssessment ? 'Değerlendirme Tamamlandı' : 'Vaka Raporu'}
          </ScreenHeading>
          <p className="results-sub-v2">
            {passed
              ? 'Tebrikler — performansınız hedefin üzerinde. Bu düzeyi korumak için öğrenme modunda farklı bulgularla okumaya devam edebilirsiniz.'
              : 'Hedef puanın altında kaldınız. Öğrenme modunda ilgili bulguların örnek filmlerini inceleyip uygulama modunda yeniden denemeniz önerilir.'}
          </p>

          {weakKeys.length > 0 && (
            <div className="weak-chip-row" aria-label="Zayıf alanlar">
              <span className="weak-chip-lbl">Zayıf alanlar:</span>
              {weakKeys.map((k) => (
                <span className="badge orange weak-chip" key={k}>{weakLabels[k] ?? k}</span>
              ))}
            </div>
          )}

          <div className="results-summary-strip">
            <div className="rs-box">
              <div className={`rs-ring-sm score-ring ${passed ? 'pass' : 'fail'}`}>
                <svg viewBox="0 0 80 80">
                  <circle className="track" cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="8" />
                  <circle
                    className="prog"
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(total / 100) * 2 * Math.PI * 34} 999`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <b>{total}</b>
              </div>
              <span className="rs-lbl">
                Bu deneme: {total} · En iyi puan: {state.bestScore[isAssessment ? 'assessment' : 'practice']}
              </span>
            </div>
            <div className="rs-box">
              <div className={`rs-status ${passed ? 'pass' : 'fail'}`}>
                <IconCheckCircle width={16} height={16} /> {passed ? 'Başarılı' : 'Hedefin altında'}
              </div>
              <span className="rs-lbl">Durum (eşik 80)</span>
            </div>
            <div className="rs-box">
              <div className="rs-num">
                <IconClock width={16} height={16} /> {fmtTime(state.assessmentTimer)}
              </div>
              <span className="rs-lbl">Toplam öğrenme süresi</span>
            </div>
            <div className="rs-box">
              <div className="rs-num">{state.caseResults.length}</div>
              <span className="rs-lbl">Vaka sayısı</span>
            </div>
          </div>

          {gamiEnabled && (gains ?? defaultGains)}

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Alan bazlı performans</h3>
            <div className="domain-rows mt-12">
              {domains &&
                domainRows.map((d) => {
                  const v = domains[d.key]
                  if (!v || v.max === 0) return null
                  const pct = Math.round((v.earned / v.max) * 100)
                  return (
                    <div className="domain-row" key={d.key}>
                      <span className="dr-ic">{d.icon}</span>
                      <span className="dr-lbl">{d.label}</span>
                      <span className="domain-bar"><i style={{ width: `${pct}%` }} /></span>
                      <span className="dr-pct">%{pct}</span>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Vaka raporu</h3>
            <div className="table-scroll">
              <table className="report-table report-table-v2">
                <thead>
                  <tr>
                    <th />
                    <th>Vaka</th>
                    <th>Puan</th>
                    <th>Sonuç</th>
                    <th>İpucu</th>
                  </tr>
                </thead>
                <tbody>
                  {state.caseResults.map((r) => {
                    const review = reviewFor(r.caseId)
                    const isOpen = expanded === r.caseId
                    return (
                      <Fragment key={r.caseId}>
                        <tr className="report-row" onClick={() => setExpanded(isOpen ? null : r.caseId)}>
                          <td className="report-chev"><IconChevronRight className={isOpen ? 'rot' : ''} width={14} height={14} /></td>
                          <td>{review.title}</td>
                          <td>{Math.round(r.total)}/100</td>
                          <td className={r.mastery ? 'ok' : 'no'}>{r.mastery ? 'Başarılı' : 'Başarısız'}</td>
                          <td>{r.hintsUsed}</td>
                        </tr>
                        {isOpen && (
                          <tr className="report-detail-row">
                            <td colSpan={5}>
                              <ul className="report-detail-list">
                                {r.answers.map((a) => {
                                  const question = review.questions.find((qq) => qq.id === a.qid)
                                  if (!question) return null
                                  const isMark = question.type === 'localization'
                                  const givenLabels = isMark
                                    ? decodeMark(a.given[0]) ? 'Film üzerinde işaret' : '—'
                                    : a.given.map((id) => question.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ') || '—'
                                  const correctLabels = isMark
                                    ? 'Uzman işaretlemesinin içinde bir nokta'
                                    : question.correct
                                        .map((id) => question.options.find((o) => o.id === id)?.label)
                                        .filter(Boolean)
                                        .join(', ')
                                  return (
                                    <li key={a.qid} className={a.correct ? 'ok' : 'no'}>
                                      <span className="rd-q">{question.prompt}</span>
                                      <span className="rd-mark">{a.correct ? '✓' : '✗'}</span>
                                      <span className="rd-given">Verilen yanıt: {givenLabels}</span>
                                      <span className="rd-correct">Doğru yanıt: {correctLabels}</span>
                                      {!a.correct && question.feedbackIncorrect && (
                                        <span className="rd-feedback">{question.feedbackIncorrect}</span>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="results-actions">
            {state.serverChallengeId !== null && challenge.onChallengeFinished !== undefined ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  if (state.serverChallengeId !== null) challenge.onChallengeFinished?.(state.serverChallengeId)
                }}
              >
                Karşılaşma sonucunu gör
              </button>
            ) : null}
            <button type="button" className={state.serverChallengeId !== null ? 'btn outline' : 'btn primary'} onClick={exit}>
              <IconExit /> Modülden Çık
            </button>
            {state.serverChallengeId === null ? (
              <button type="button" className="btn outline" onClick={retrySame}>Tekrar dene</button>
            ) : null}
            {state.topicReturn ? (
              <button type="button" className="btn outline" onClick={() => dispatch({ type: 'returnToTopic' })}>
                Görüntüye dön: {state.topicReturn.title}
              </button>
            ) : (
              <button type="button" className="btn outline" onClick={studyLearn}>Öğrenme modunda çalış</button>
            )}
          </div>
        </div>
      </div>
      {!embedded && <Footer />}
    </>
  )
}

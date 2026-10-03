import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { SimAudience } from '@egemed/sim-host'
import { VISITOR_LOCK_TEXT } from '@egemed/sim-host'
import { useChallenge } from '../EmbeddedContext'
import { useLearnGate } from '../core/LearnGate'
import { LEARN_VIEW_SECONDS, challengeLearnLockText, exampleKey } from '../core/learnLock'
import { libraryExamples } from '../core/examples'
import { useStore } from '../core/StoreProvider'
import { isExpertSource } from '../core/images'
import { noZonesReasonForImage, zonesForImage } from '../data/zones'
import { FIRST_LIBRARY_ITEM } from '../data/library'
import { isVisitorUnlocked } from '../core/visitorAccess'
import { LIBRARY_GROUPS, LIBRARY_ITEMS } from '../data/terminology'
import { clinicalContextFor } from '../data/clinicalContext'
import { FilmViewer, createNoopFilmEnv, type FilmViewerHandle } from '../ui/FilmViewer'
import { PatientCard } from '../ui/PatientCard'
import { vignetteFor } from '../data/vignettes'
import { ZoneChips } from '../ui/ZoneChips'
import { Footer, EcgDeco } from '../ui/chrome'
import { IconFilm, IconLock } from '../ui/icons'

/** Öğrenme modu: kütüphane + film görüntüleyici. Skor ve süre yok.
 *  Port (E2 §8 S14): `document`/`Date.now` yok; kaydırma `LearnScreenEnv`, tohum `now`,
 *  oyunlaştırma `gami` seam'i ile enjekte edilir (§7.7). */

const LEARN_DWELL_MS = 800
/** İnceleme sayacı adımı (ms); uyku/arka plan sıçramaları bu kadarla sınırlanır. */
const VIEW_TICK_MS = 1000

/** Aktif kütüphane öğesini görünür alana kaydırma (kaynak: `document.querySelector('.lib-item.active')`). */
export interface LearnScreenEnv {
  scrollActiveLibraryItem(): void
}

export function createNoopLearnScreenEnv(): LearnScreenEnv {
  return { scrollActiveLibraryItem: () => undefined }
}

const NOOP_LEARN_ENV: LearnScreenEnv = createNoopLearnScreenEnv()
const NOOP_FILM_ENV = createNoopFilmEnv()

/** Oyunlaştırma öğrenme kaydı (kaynak: `getGamiRepo().recordLearn`). */
export interface LearnGamiPort {
  recordLearn(payload: { topic?: string; ctStack?: string }, at: Date): void | Promise<void>
}

export interface LearnScreenProps {
  /** Platform kabuğu modu: dekorasyon ve footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Kütüphane kaydırma sınırı; verilmezse güvenli no-op. */
  readonly env?: LearnScreenEnv
  /** Oyunlaştırma bayrağı (§7.7, G4); varsayılan kapalı. */
  readonly gamiEnabled?: boolean
  /** Oyunlaştırma kayıt seam'i; `gamiEnabled` açıkken konu ve BT yığını tamamlama kaydı. */
  readonly gami?: LearnGamiPort
  /** Kitle (T175); yoksa `student` (geriye uyum). Ziyaretçide kütüphane kısmen kilitli. */
  readonly audience?: SimAudience
}

export function LearnScreen({
  embedded = false,
  env = NOOP_LEARN_ENV,
  gamiEnabled = false,
  gami,
  audience = 'student',
}: LearnScreenProps): JSX.Element {
  const { state, dispatch, now, env: windowEnv } = useStore()
  const isVisitor = audience === 'visitor'
  const gate = useLearnGate()
  const challenge = useChallenge()
  const [selectedKey, setSelectedKey] = useState<string>(() => state.learnFocusKey ?? FIRST_LIBRARY_ITEM.key)
  const [visitorNotice, setVisitorNotice] = useState<string | null>(null)
  const [exampleIdx, setExampleIdx] = useState(() => state.learnFocusIdx ?? 0)
  const lastKey = useRef(selectedKey)
  const [showExpert, setShowExpert] = useState(true)
  const [activeZones, setActiveZones] = useState<string[]>([])
  const viewerRef = useRef<FilmViewerHandle>(null)

  const initialLearnFocus = useRef(state.learnFocusKey)
  useEffect(() => {
    if (initialLearnFocus.current) dispatch({ type: 'setLearnFocus', key: null })
  }, [dispatch])

  const item = LIBRARY_ITEMS.find((it) => it.key === selectedKey) ?? FIRST_LIBRARY_ITEM

  useEffect(() => {
    if (!gamiEnabled || !gami) return
    void gami.recordLearn({ topic: item.key }, new Date(now()))
  }, [gami, gamiEnabled, item.key, now])

  const examples = useMemo(() => libraryExamples(item), [item])
  const image = examples[exampleIdx] ?? examples[0]
  const readingZones = useMemo(() => image ? zonesForImage(image.id) : null, [image])
  const noZonesReason = image ? noZonesReasonForImage(image.id) : null

  useEffect(() => setActiveZones([]), [image?.id])

  // T320: film yüklü ve sayfa görünürken geçen süre örneğe yazılır; konu, tüm filmleri
  // LEARN_VIEW_SECONDS sn incelenince tamamlanır. Yalnız seçmek ya da yüklenmeyen film sayılmaz.
  const [readyId, setReadyId] = useState<string | null>(null)
  const addViewRef = useRef(gate.addView)
  addViewRef.current = gate.addView
  const viewedSeconds = (index: number): number => gate.seconds.get(exampleKey(item.key, index)) ?? 0
  const currentDone = viewedSeconds(exampleIdx) >= LEARN_VIEW_SECONDS
  useEffect(() => {
    if (!image || readyId !== image.id || currentDone) return
    let last = now()
    let handle = windowEnv.setTimeout(function tick() {
      const at = now()
      const elapsed = Math.min(at - last, VIEW_TICK_MS * 2)
      last = at
      if (windowEnv.visibilityState === 'visible' && elapsed > 0) addViewRef.current(item.key, exampleIdx, elapsed)
      handle = windowEnv.setTimeout(tick, VIEW_TICK_MS)
    }, VIEW_TICK_MS)
    return () => windowEnv.clearTimeout(handle)
  }, [currentDone, exampleIdx, image, item.key, now, readyId, windowEnv])

  useEffect(() => {
    if (lastKey.current !== selectedKey) {
      lastKey.current = selectedKey
      setExampleIdx(0)
    }
    env.scrollActiveLibraryItem()
  }, [env, selectedKey])

  const challengeLocked = challenge.challengeId !== undefined && !gate.complete

  const selectLibraryItem = useCallback(
    (key: string) => {
      if (isVisitor && !isVisitorUnlocked(key)) {
        setVisitorNotice(VISITOR_LOCK_TEXT.itemLocked)
        return
      }
      setVisitorNotice(null)
      setSelectedKey(key)
    },
    [isVisitor],
  )

  const onZoneEnter = useCallback((ids: string[]) => dispatch({ type: 'zoneEnter', zoneIds: ids }), [dispatch])
  const onZoneDwell = useCallback((ids: string[], ms: number) => dispatch({ type: 'zoneDwell', zoneIds: ids, dwellMs: ms }), [dispatch])
  const ctExpertFinding = image?.modality === 'CT' ? image.annotations.find((a) => isExpertSource(a.source))?.finding ?? null : null
  const annotationFinding = item.finding && item.finding !== 'normal' ? item.finding : ctExpertFinding
  const hasExpertBox = !!image && !!annotationFinding && image.annotations.some((a) => a.finding === annotationFinding && isExpertSource(a.source))

  const onStackEnd =
    gamiEnabled && gami && image
      ? () => {
          void gami.recordLearn({ ctStack: image.id }, new Date(now()))
        }
      : undefined

  const groupTitle = LIBRARY_GROUPS.find((g) => g.items.some((entry) => entry.key === item.key))?.title ?? ''

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll learn-body">
          {challengeLocked ? (
            <p className="lib-lock-notice challenge-lock-notice" role="status">
              <IconLock width={14} height={14} aria-hidden="true" />{' '}
              {challengeLearnLockText(gate.openedCount, gate.total)}
            </p>
          ) : null}
          <div className="learn-grid">
            <nav className="lib-col" aria-label="Öğrenme kütüphanesi">
              {/* T218: öğrenme tamamlanma göstergesi (kilidin ilerleme metni). */}
              <h2 className="lib-head learn-progress" role="status" aria-label={gate.progressText}>
                Konular · {gate.openedCount}/{gate.total}
              </h2>
              {isVisitor && visitorNotice && (
                <p className="mode-lock-hint" role="status">
                  <IconLock width={14} height={14} aria-hidden="true" /> {visitorNotice}
                </p>
              )}
              {LIBRARY_GROUPS.map((g) => (
                <div className="lib-group" key={g.id}>
                  <div className="g-title">
                    {g.title}
                    <span className="g-count">
                      {g.items.filter((entry) => gate.opened.has(entry.key)).length}/{g.items.length}
                    </span>
                  </div>
                  <div className="lib-items">
                    {g.items.map((it) => {
                      const locked = isVisitor && !isVisitorUnlocked(it.key)
                      const opened = gate.opened.has(it.key)
                      return (
                        <button
                          key={it.key}
                          type="button"
                          className={`lib-item ${it.key === selectedKey ? 'active' : ''}${locked ? ' locked' : ''}${opened ? ' opened' : ''}`}
                          onClick={() => selectLibraryItem(it.key)}
                          aria-current={it.key === selectedKey ? 'true' : undefined}
                          aria-disabled={locked ? 'true' : undefined}
                          title={locked ? VISITOR_LOCK_TEXT.itemLocked : it.title}
                        >
                          <span className={`ck${opened ? ' done' : ''}`} aria-hidden="true">{opened ? '✓' : ''}</span>
                          <b>{it.short}</b>
                          {opened ? <span className="sr-only"> — açıldı</span> : null}
                          {locked ? <IconLock width={12} height={12} aria-hidden="true" /> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <section className="sim-main" aria-label="Film ve örnekler">
              <div className="learn-head">
                <span className="learn-eb">{groupTitle}</span>
                <h3 className="learn-title">{item.title}</h3>
                <p className="learn-study" role="status">
                  {currentDone ? 'Bu film incelendi ✓' : `Bu film ${Math.floor(viewedSeconds(exampleIdx))}/${LEARN_VIEW_SECONDS} sn`} · konu, {examples.length} filmin her biri en az {LEARN_VIEW_SECONDS} sn incelenince tamamlanır
                </p>
              </div>
              <div className="stage-card film-card">
                {annotationFinding && (
                  <label className="points-toggle">
                    <input type="checkbox" checked={showExpert} onChange={(e) => setShowExpert((e.currentTarget as unknown as { checked: boolean }).checked)} disabled={!hasExpertBox} />
                    {hasExpertBox ? 'Uzman işaretlemesini göster' : 'Bu filmde uzman işaretlemesi yok'}
                  </label>
                )}
                {image ? (
                  <FilmViewer
                    ref={viewerRef}
                    image={image}
                    zones={readingZones ?? []}
                    showZones={state.showZones && readingZones !== null}
                    showAnnotations={showExpert && hasExpertBox}
                    annotationFinding={annotationFinding ?? null}
                    onZoneEnter={onZoneEnter}
                    onZoneDwell={onZoneDwell}
                    onActiveZones={setActiveZones}
                    onTool={(tool) => dispatch({ type: 'toolUsed', tool })}
                    onToggleZones={() => dispatch({ type: 'toggleZones' })}
                    showInfoOverlay={false}
                    fitContent
                    {...(onStackEnd ? { onStackEnd } : {})}
                    // T320: inceleme süresi yalnız film gerçekten yüklenince sayılmaya başlar.
                    onImageReady={() => setReadyId(image.id)}
                    env={NOOP_FILM_ENV}
                  />
                ) : (
                  <div className="film-empty-card">
                    <IconFilm width={28} height={28} />
                    <p>Bu konu için henüz örnek film yok.</p>
                  </div>
                )}
                {readingZones ? (
                  <ZoneChips
                    zones={readingZones}
                    visits={state.telemetry.visits}
                    activeZones={activeZones}
                    minDwellMs={LEARN_DWELL_MS}
                    highlight={item.bestZones}
                    onSelect={(id) => viewerRef.current?.focusZone(id)}
                  />
                ) : image ? (
                  <p className="note-strip zone-empty-note" role="status">
                    Bu görüntü için okuma bölgesi tanımlı değil.{noZonesReason ? ` ${noZonesReason}` : ''}
                  </p>
                ) : null}
              </div>
              <div className="learn-examples">
                <div className="learn-lbl">Örnekler</div>
                <div className="ex-row" role="group" aria-label="Örnek seçimi">
                  {examples.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`ex-btn${index === exampleIdx ? ' active' : ''}`}
                      aria-pressed={index === exampleIdx}
                      onClick={() => setExampleIdx(index)}
                    >
                      Örnek {index + 1}
                      <small>{viewedSeconds(index) >= LEARN_VIEW_SECONDS ? '✓ incelendi' : `${Math.floor(viewedSeconds(index))}/${LEARN_VIEW_SECONDS} sn`}</small>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="sim-side" aria-label="Hasta kartı ve konu bilgisi" tabIndex={0}>
              {image ? <PatientCard image={image} context={clinicalContextFor(image.id)} topic={item.short} exampleNo={exampleIdx + 1} finding={item.finding} vignette={vignetteFor(image.id)} /> : null}
              <section className="learn-about" aria-labelledby="learn-about-title">
                <div className="la-head">
                  <span className="learn-eb">{groupTitle}</span>
                  <h3 id="learn-about-title">{item.title}</h3>
                  <span className="learn-lbl la-tag">Bu bulgu hakkında</span>
                </div>
                <div className="la-grid">
                  <div className="la-card">
                    <div className="learn-lbl">Tanım</div>
                    <p className="la-crit">{item.description}</p>
                  </div>
                  <div className="la-card">
                    <div className="learn-lbl">Radyolojik ipucu</div>
                    <p className="la-mech">{item.sign}</p>
                  </div>
                  <div className="la-card">
                    <div className="learn-lbl">Okurken</div>
                    <p className="la-mech">{item.readingTip}</p>
                  </div>
                  <div className="la-card">
                    <div className="learn-lbl">Klinik</div>
                    <p className="la-mech">{item.clinical}</p>
                  </div>
                </div>
              </section>
            </section>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

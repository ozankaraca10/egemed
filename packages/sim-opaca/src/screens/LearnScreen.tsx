import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { SimAudience } from '@egemed/sim-host'
import { VISITOR_LOCK_TEXT } from '@egemed/sim-host'
import { useChallenge, useSessions } from '../EmbeddedContext'
import { useLearnGate } from '../core/LearnGate'
import { canStartMode, challengeLearnLockText } from '../core/learnLock'
import { libraryExampleCount, libraryExamples } from '../core/examples'
import { useStore } from '../core/StoreProvider'
import { isExpertSource } from '../core/images'
import { noZonesReasonForImage, zonesForImage } from '../data/zones'
import { CASE_INVENTORY } from '../data/inventory'
import { FIRST_LIBRARY_ITEM } from '../data/library'
import { isVisitorUnlocked } from '../core/visitorAccess'
import { LIBRARY_GROUPS, LIBRARY_ITEMS, LABEL_SOURCE_TEXT, findingShort } from '../data/terminology'
import { FilmViewer, createNoopFilmEnv, type FilmViewerHandle } from '../ui/FilmViewer'
import { FilmInfoPanel } from '../ui/FilmInfoPanel'
import { ZoneChips } from '../ui/ZoneChips'
import { Footer, EcgDeco } from '../ui/chrome'
import {
  IconDoc,
  IconInfo,
  IconArrowRight,
  IconLungs,
  IconHeart,
  IconBone,
  IconScan,
  IconFilm,
  IconChevronLeft,
  IconChevronRight,
  IconDiaphragm,
  IconUser,
  IconWave,
  IconShieldCheck,
  IconLock,
} from '../ui/icons'

/** Öğrenme modu: kütüphane + film görüntüleyici. Skor ve süre yok.
 *  Port (E2 §8 S14): `document`/`Date.now` yok; kaydırma `LearnScreenEnv`, tohum `now`,
 *  oyunlaştırma `gami` seam'i ile enjekte edilir (§7.7). */

const LEARN_DWELL_MS = 800

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
  const { state, dispatch, now } = useStore()
  const isVisitor = audience === 'visitor'
  const gate = useLearnGate()
  const challenge = useChallenge()
  const [selectedKey, setSelectedKey] = useState<string>(() => state.learnFocusKey ?? FIRST_LIBRARY_ITEM.key)
  const [visitorNotice, setVisitorNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<'desc' | 'film' | 'clin'>('desc')
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

  useEffect(() => {
    if (lastKey.current !== selectedKey) {
      lastKey.current = selectedKey
      setExampleIdx(0)
    }
    env.scrollActiveLibraryItem()
  }, [env, selectedKey])

  // A2.3: vaka kapsamı banka envanterinden gelir (istemci havuz taşımaz).
  const coverage = item.finding ? CASE_INVENTORY.coverage[item.finding] ?? { p: 0, a: 0 } : { p: 0, a: 0 }
  const sessions = useSessions()

  // T218: öğrenme tamamlanmadan odaklı uygulama da kilitlidir; koruma tek noktada
  // (`canStartMode`), düğme ayrıca pasiftir ve kilit metni gösterilir.
  const practiceLocked = !isVisitor && !gate.complete
  const challengeLocked = challenge.challengeId !== undefined && !gate.complete

  const startPractice = () => {
    // A2.3: odaklı uygulama oturumu (bulgu başına ≤5 vaka) yalnız sunucudan açılır.
    if (sessions === undefined || !item.finding || coverage.p === 0) return
    if (!canStartMode('practice', gate.complete)) return
    dispatch({
      type: 'startTopicPractice',
      key: item.key,
      exampleIdx,
      title: item.title,
      focusFinding: item.finding,
    })
  }

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

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container tall screen-body no-scroll">
          {/* T218: öğrenme tamamlanma göstergesi (kilidin ilerleme metni). */}
          <p className="learn-progress" role="status">
            {gate.progressText}
          </p>
          {challengeLocked ? (
            <p className="lib-lock-notice challenge-lock-notice" role="status">
              <IconLock width={14} height={14} aria-hidden="true" />{' '}
              {challengeLearnLockText(gate.openedCount, gate.total)}
            </p>
          ) : null}
          <div className="learn-grid">
            <nav className="lib-col" aria-label="Öğrenme kütüphanesi">
              {/* T207: başlık panelde sabit kalır, yalnız liste (`.lib-scroll`) kayar. */}
              <div className="lib-head">
                <h2>Kütüphane</h2>
                <p className="lib-sub">Konu seçin, filmi okuyun.</p>
                {isVisitor && visitorNotice && (
                  <p className="mode-lock-hint" role="status">
                    <IconLock width={14} height={14} aria-hidden="true" /> {visitorNotice}
                  </p>
                )}
              </div>
              <div className="lib-scroll">
                {LIBRARY_GROUPS.map((g) => (
                  <div className="lib-group" key={g.id}>
                    <div className="g-title">
                      <GroupIcon group={g.id} />
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
                            <span className="ic"><GroupIcon group={g.id} /></span>
                            <span className="lib-main">
                              <b>{it.short}</b>
                              <span>{it.sub}</span>
                            </span>
                            <span className="lib-right">
                              {opened ? (
                                <span className="lib-done" aria-label="açıldı" title="açıldı">✓</span>
                              ) : null}
                              {locked ? (
                                <span className="lib-lock-badge" aria-hidden="true"><IconLock width={12} height={12} /></span>
                              ) : (
                                <span className="lib-count" title="Örnek film sayısı">{libraryExampleCount(it)}</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </nav>

            <div className="sim-main">
              <div className="stage-card film-card">
                <div className="film-card-head">
                  <div className="example-nav" role="group" aria-label="Örnek filmler">
                    <button type="button" className="icon-btn" disabled={examples.length < 2} onClick={() => setExampleIdx((i) => (i - 1 + examples.length) % examples.length)} aria-label="Önceki örnek">
                      <IconChevronLeft width={16} height={16} />
                    </button>
                    <span className="example-count">{examples.length ? `Örnek ${exampleIdx + 1} / ${examples.length}` : 'Örnek film yok'}</span>
                    <button type="button" className="icon-btn" disabled={examples.length < 2} onClick={() => setExampleIdx((i) => (i + 1) % examples.length)} aria-label="Sonraki örnek">
                      <IconChevronRight width={16} height={16} />
                    </button>
                  </div>
                  {annotationFinding && (
                    <label className="points-toggle">
                      <input type="checkbox" checked={showExpert} onChange={(e) => setShowExpert((e.currentTarget as unknown as { checked: boolean }).checked)} disabled={!hasExpertBox} />
                      {hasExpertBox ? 'Uzman işaretlemesini göster' : 'Bu filmde uzman işaretlemesi yok'}
                    </label>
                  )}
                </div>
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
                    showInfoOverlay={tab === 'film'}
                    fitContent
                    {...(onStackEnd ? { onStackEnd } : {})}
                    // T218: öğenin görüntüsü film görüntüleyicide gerçekten yüklenince
                    // "açıldı" sayılır; yalnız listeden seçmek yetmez.
                    onImageReady={() => gate.markOpened(item.key)}
                    env={NOOP_FILM_ENV}
                  />
                ) : (
                  <div className="film-empty-card">
                    <IconFilm width={28} height={28} />
                    <p>Bu konu için henüz örnek film içe aktarılmadı.</p>
                    <p className="small">Radyolog etiketli filmler için <code>npm run import:nih</code> ya da <code>npm run import:rsna</code> çalıştırın.</p>
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
            </div>

            <div className="sim-side">
              <div className="card">
                <div className="card-title-row">
                  <div className="ic"><GroupIcon group={item.group} /></div>
                  <h3>{item.title}</h3>
                  <div className="card-title-actions"><span className="badge blue">{item.badge}</span></div>
                </div>
                <div className="tabbar info-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={tab === 'desc'} className={tab === 'desc' ? 'active' : ''} onClick={() => setTab('desc')}><IconDoc /> Açıklama</button>
                  <button type="button" role="tab" aria-selected={tab === 'film'} className={tab === 'film' ? 'active' : ''} onClick={() => setTab('film')}><IconFilm /> Film bilgisi</button>
                  <button type="button" role="tab" aria-selected={tab === 'clin'} className={tab === 'clin' ? 'active' : ''} onClick={() => setTab('clin')}><IconScan /> Klinik</button>
                </div>
                {tab === 'desc' && (
                  <div className="info-body">
                    <p>{item.description}</p>
                    <div className="metaphor-card mt-12">
                      <span className="m-ic"><IconScan width={20} height={20} /></span>
                      <div>
                        <b>Radyolojik ipucu</b>
                        <p>{item.sign}</p>
                      </div>
                    </div>
                    <div className="note-strip mt-12">
                      <IconInfo />
                      <span><b>Okurken:</b> {item.readingTip}</span>
                    </div>
                  </div>
                )}
                {tab === 'film' && (
                  <div className="info-body">
                    <FilmInfoPanel image={image} />
                    {image && (
                      <dl className="film-meta mt-12">
                        <dt>Kaynak</dt><dd>{image.sourceDataset} · {image.sourceFile}</dd>
                        <dt>Hasta</dt><dd>{image.ageYears != null ? `${image.ageYears} yaş` : 'yaş bilinmiyor'}{image.sex ? `, ${image.sex === 'F' ? 'kadın' : 'erkek'}` : ''}</dd>
                        <dt>Etiketler</dt>
                        <dd>
                          <ul className="label-list">
                            {Object.entries(image.findings).map(([f, src]) => (
                              <li key={f} className={isExpertSource(src) ? 'expert' : 'nlp'}>
                                {findingShort(f)} <span>{LABEL_SOURCE_TEXT[src] ?? src}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                        {image.license && (
                          <>
                            <dt>Lisans</dt>
                            <dd>{image.license.attribution} (<a href={image.license.sourceUrl} target="_blank" rel="noreferrer">kaynak</a>)</dd>
                          </>
                        )}
                        <dt>Hekim onayı</dt><dd>{image.clinicalReview === 'onayli' ? 'Onaylı' : 'Beklemede'}</dd>
                      </dl>
                    )}
                    <p className="src-line"><IconInfo /> Rapor metninden otomatik çıkarılan ve yükleyen açıklamasına dayanan etiketler öğrenme amaçlı gösterilir; değerlendirmede kullanılmaz.</p>
                  </div>
                )}
                {tab === 'clin' && (
                  <div className="info-body">
                    <div className="klin-strip"><IconScan /><span>{item.clinical}</span></div>
                    {item.finding && (
                      <>
                        <p className="src-line">
                          Vaka kapsamı: {coverage.p ? `${coverage.p} uygulama vakası` : 'uygulama vakası yok'}
                          {coverage.a ? `, ${coverage.a} değerlendirme vakası` : ''}
                        </p>
                        {coverage.p > 0 && (
                          <button type="button" className="btn outline small" onClick={startPractice} disabled={sessions === undefined || practiceLocked}>
                            Bu konuda uygulama yap <IconArrowRight width={14} height={14} />
                          </button>
                        )}
                        {practiceLocked ? (
                          <p className="lib-lock-notice" role="status">
                            <IconLock width={14} height={14} aria-hidden="true" /> {gate.lockText}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

function GroupIcon({ group, size = 17 }: { group: string; size?: number }) {
  if (group === 'cardiac') return <IconHeart width={size} height={size} />
  if (group === 'bone') return <IconBone width={size} height={size} />
  if (group === 'technique') return <IconScan width={size} height={size} />
  if (group === 'diaphragm') return <IconDiaphragm width={size} height={size} />
  if (group === 'pediatric') return <IconUser width={size} height={size} />
  if (group === 'vascular') return <IconWave width={size} height={size} />
  if (group === 'infection') return <IconShieldCheck width={size} height={size} />
  if (group === 'ct') return <IconScan width={size} height={size} />
  return <IconLungs width={size} height={size} />
}

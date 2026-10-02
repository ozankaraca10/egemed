import { useAudience, useChallenge, useRequestSignIn, useSessions } from "../ui/ScreenHeading";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { VISITOR_LOCK_TEXT } from "@egemed/sim-host";
import { useLearnGate, useStartMode } from "../core/LearnGate";
import { LEARN_EXAMPLE_SECONDS, challengeLearnLockText, exampleKey, listenedKeyOnPlay } from "../core/learnLock";
import { resolveLibrarySoundEx, type LibrarySoundResult } from "../core/resolver";
import { useStore } from "../core/StoreProvider";
import type { AuscultationPoint, PatientView, SoundCategory, SoundRecord } from "../core/types";
import { isVisitorUnlocked } from "../core/visitorAccess";
import pointsData from "../data/auscultation-points.json";
import { CASE_INVENTORY } from "../data/inventory";
import { learnAbout, LEARN_REFS, URGENT_KEYS } from "../data/learnContent";
import { clipRecord, exampleClipFor, learnExamples, waveForSound, type LearnExample } from "../data/learnSets";
import { FIRST_LIBRARY_ITEM, LIBRARY_GROUPS, findLibraryItem } from "../data/library";
import sourcesData from "../data/sources.json";
import { libraryShortTitle, libraryTitle } from "../data/terminology";
import { LearnWave } from "../ui/LearnWave";
import { PatientStage, StageAudioProvider, type StageAudio, type StageHandle } from "../ui/PatientStage";
import type { BodyType } from "../ui/patient-stage/geometry";
import { PediatricRefModal } from "../ui/PediatricRefModal";
import { ToolbarAudioProvider, VIEW_LABEL, ViewToggle, type ToolbarAudio } from "../ui/Toolbar";
import { EcgDeco, Footer } from "../ui/chrome";
import { IconArrowRight, IconCompare, IconInfo, IconLock } from "../ui/icons";

/** Öğrenme modu (T307, depo sahibi onayı 2 Eki 2026): konu başına önce çok noktalı
 *  sentetik set, ardından bulgunun en çok noktada duyulduğu gerçek hastalar. Konu,
 *  tüm örnekleri (sentetik + gerçek) ses çalarken `LEARN_EXAMPLE_SECONDS`'er saniye
 *  dinlenince tamamlanır (T308). Skor yok.
 *  Port (E2 §9 S14): `document`/`Date.now` yok; kaydırma `LearnScreenEnv`, ses motoru
 *  bağlamdan gelir. */

const POINTS = pointsData.points as AuscultationPoint[];
const POINT_BY_ID = new Map(POINTS.map((point) => [point.id, point]));
const VIEW_ORDER: readonly PatientView[] = ["front", "back", "left", "right"];

interface SourceEntry {
  readonly id: string;
  readonly title: string;
  readonly license?: string;
}
const SOURCE_TITLE = new Map(
  ((sourcesData as { datasets: SourceEntry[] }).datasets ?? []).map((entry) => [entry.id, entry.title]),
);

/** Aktif kütüphane öğesini görünür alana kaydırma (kaynak: `document.querySelector('.lib-item.active')`). */
export interface LearnScreenEnv {
  scrollActiveLibraryItem(): void;
}

export function createNoopLearnScreenEnv(): LearnScreenEnv {
  return { scrollActiveLibraryItem: () => undefined };
}

const NOOP_LEARN_ENV: LearnScreenEnv = createNoopLearnScreenEnv();

/** Sahne ve araç çubuğunun ortak motor yüzeyi. Modül singleton'ı yoktur. */
export type LearnAudio = StageAudio & ToolbarAudio;

const LearnAudioContext = createContext<LearnAudio | null>(null);

export function LearnAudioProvider({ engine, children }: { engine: LearnAudio; children: ReactNode }): JSX.Element {
  return <LearnAudioContext.Provider value={engine}>{children}</LearnAudioContext.Provider>;
}

export function createNoopLearnAudio(): LearnAudio {
  return {
    play: async () => undefined,
    replay: async () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    getActive: () => null,
    ensureContext: async () => undefined,
  };
}

const NOOP_LEARN_AUDIO: LearnAudio = createNoopLearnAudio();

export interface LearnScreenProps {
  /** Platform kabuğu: dekorasyon ve footer çizilmez. */
  readonly embedded?: boolean;
  /** Kütüphane kaydırma sınırı; verilmezse güvenli no-op. */
  readonly env?: LearnScreenEnv;
  /** Verilmezse `LearnAudioProvider` bağlamı, o da yoksa no-op motor. */
  readonly audio?: LearnAudio;
}

/** Örnek için dinlenebilir noktalar: kütüphane sentetiğinde konunun grubundaki (lateral
 *  hariç) çözülebilen noktalar; model/gerçek örnekte kaydı olan noktalar. */
export function examplePointIds(
  example: LearnExample,
  category: string,
  playableLibrary: (pointId: string) => boolean,
): string[] {
  if (example.kind !== "library") return POINTS.filter((point) => example.points[point.id] !== undefined).map((point) => point.id);
  return POINTS.filter((point) => {
    if (point.view === "left" || point.view === "right") return false;
    const groupOk = category === "mixed" || (category === "heart" ? point.group === "cardiac" : point.group === "lung");
    return groupOk && playableLibrary(point.id);
  }).map((point) => point.id);
}

export function viewsOf(pointIds: readonly string[]): PatientView[] {
  const present = new Set(pointIds.map((id) => POINT_BY_ID.get(id)?.view));
  return VIEW_ORDER.filter((view) => present.has(view));
}

export function LearnScreen({
  embedded = false,
  env = NOOP_LEARN_ENV,
  audio,
}: LearnScreenProps): JSX.Element {
  const { state, dispatch, bus } = useStore();
  const contextual = useContext(LearnAudioContext);
  const engine = audio ?? contextual ?? NOOP_LEARN_AUDIO;
  const audience = useAudience();
  const isVisitor = audience === "visitor";
  const gate = useLearnGate();
  const startMode = useStartMode();
  const challenge = useChallenge();
  const requestSignIn = useRequestSignIn();
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const wanted = state.learnFocusKey ?? FIRST_LIBRARY_ITEM.key;
    if (isVisitor && !isVisitorUnlocked(wanted)) return FIRST_LIBRARY_ITEM.key;
    return wanted;
  });
  const [exampleIndex, setExampleIndex] = useState(0);
  const [layer, setLayer] = useState<"heart" | "lung">("heart");
  const stageRef = useRef<StageHandle>(null);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pedModalOpen, setPedModalOpen] = useState(false);
  const [lockNotice, setLockNotice] = useState(false);
  const initialFocus = useRef(state.learnFocusKey);

  useEffect(() => {
    if (initialFocus.current) dispatch({ type: "setLearnFocus", key: null });
  }, [dispatch]);

  const sessions = useSessions();
  const item = findLibraryItem(selectedKey);
  const isHeart = item.group === "heart";
  const isMixed = item.group === "mixed";
  const category = item.category as SoundCategory;
  const cov = CASE_INVENTORY.coverage[item.acousticFinding] ?? { p: 0, a: 0 };
  const examples = useMemo(() => learnExamples(item.key), [item.key]);
  const exIndex = Math.max(0, Math.min(exampleIndex, examples.length - 1));
  const example = examples[exIndex] ?? examples[0]!;
  const realOrdinal = examples.slice(0, exampleIndex + 1).filter((entry) => entry.kind === "real").length;

  const startPracticeForFinding = () => {
    // T196: odaklı uygulama oturumu (bulgu başına ≤5 vaka) yalnız sunucudan açılır.
    // T209: öğrenme tamamlanmadan odaklı uygulama da kilitlidir; koruma tek noktada.
    if (sessions === undefined || cov.p === 0) return;
    startMode("practice", { focusFinding: item.acousticFinding });
  };

  // T209: kilit metni ziyaretçide ziyaretçi kilidini korur (öncelik ziyaretçide).
  const practiceLocked = !isVisitor && !gate.complete;
  const practiceDisabled = isVisitor ? requestSignIn === undefined : practiceLocked;
  const practiceLockText = isVisitor ? VISITOR_LOCK_TEXT.modeLocked : gate.lockText;
  const challengeLocked = challenge.challengeId !== undefined && !gate.complete;

  useEffect(() => {
    engine.stop();
    env.scrollActiveLibraryItem();
  }, [engine, env, selectedKey, exampleIndex]);

  const library = useMemo(() => {
    const cache = new Map<string, LibrarySoundResult>();
    return (pointId: string): LibrarySoundResult => {
      const cached = cache.get(pointId);
      if (cached) return cached;
      const res = resolveLibrarySoundEx(item.category, item.acousticFinding, pointId);
      cache.set(pointId, res);
      return res;
    };
  }, [item]);

  const soundFor = (pointId: string): SoundRecord | null => {
    const clip = exampleClipFor(example, pointId);
    if (clip !== null) return clipRecord(clip, category, item.acousticFinding, pointId);
    return example.kind === "library" ? library(pointId).record : null;
  };

  const pointIds = useMemo(
    () => examplePointIds(example, item.category, (pointId) => library(pointId).record !== null),
    [example, item.category, library],
  );
  const views = useMemo(() => viewsOf(pointIds), [pointIds]);
  const view: PatientView = views.includes(state.view) ? state.view : (views[0] ?? "front");
  useEffect(() => {
    if (view !== state.view) dispatch({ type: "setView", view });
  }, [dispatch, state.view, view]);
  // Karma konuda anterior görünümde kalp odakları ile akciğer alanları üst üste biner:
  // aynı anda tek katman gösterilir.
  const stagePointIds = isMixed && view === "front"
    ? pointIds.filter((id) => (POINT_BY_ID.get(id)?.group === "cardiac") === (layer === "heart"))
    : pointIds;
  const bodyType: BodyType = example.kind === "real" && example.sex === "F" ? "kadin" : "erkek";

  const activeLibrary = activePoint && example.kind === "library" ? library(activePoint) : undefined;
  const activeFallback = activeLibrary?.fallbackFrom;
  const fallbackPoint = activeFallback ? POINT_BY_ID.get(activeFallback) : undefined;
  const activeLungComponent = activeLibrary?.lungComponentOf !== undefined;
  const exampleSeconds = (index: number): number => gate.seconds.get(exampleKey(item.key, index)) ?? 0;
  const exampleDone = (index: number): boolean => exampleSeconds(index) >= LEARN_EXAMPLE_SECONDS;
  const doneExamples = examples.filter((_, index) => exampleDone(index)).length;
  const seconds = Math.floor(exampleSeconds(exIndex));
  const done = gate.listened.has(item.key);

  // Maket (T309): oynatıcı boş kalmaz — stetoskop yerleşmeden önce bu görünümün ilk
  // (kalpte mitral) odağının kaydı önizlenir; ▶ Dinle stetoskobu oraya yerleştirir.
  const viewPointIds = stagePointIds.filter((id) => POINT_BY_ID.get(id)?.view === view);
  const previewPoint = viewPointIds.includes("cardiac_mitral") ? "cardiac_mitral" : (viewPointIds[0] ?? null);
  const shownPoint = activePoint ?? previewPoint;
  const waveSound = shownPoint ? soundFor(shownPoint) : null;
  const wave = waveSound ? waveForSound(waveSound) : null;
  const activeLabel = shownPoint ? POINT_BY_ID.get(shownPoint)?.fullLabel : undefined;
  const markSource = example.kind === "library" ? null : SOURCE_TITLE.get(example.source) ?? example.source;
  const about = learnAbout(item);
  const refs = (about.refs ?? (isHeart ? ["accVhd", "escVhd"] : isMixed ? ["accVhd", "ers"] : ["ers", "bohadana"]))
    .map((id) => LEARN_REFS[id])
    .filter((ref): ref is NonNullable<typeof ref> => ref !== undefined);

  const selectItem = (key: string) => {
    setSelectedKey(key);
    setExampleIndex(0);
    setLayer("heart");
    setActivePoint(null);
    setPlaying(false);
  };
  const selectView = (next: PatientView) => {
    dispatch({ type: "setView", view: next });
    bus.emit({ type: "view_changed", view: next });
    setActivePoint(null);
    setPlaying(false);
  };
  const togglePlay = () => {
    if (playing) {
      stageRef.current?.stop();
      return;
    }
    // Yeniden yerleştirme sahnenin kendi çalma akışını başlatır (dinleme süresi sayılır).
    const target = activePoint ?? previewPoint;
    if (target) stageRef.current?.placeAt(target);
  };
  const groupLabel = isMixed ? "Kombine sesler" : isHeart ? "Kalp sesleri" : "Akciğer sesleri";
  const figure = bodyType === "kadin" ? "Kadın" : "Erkek";

  return (
    <StageAudioProvider engine={engine}>
      <ToolbarAudioProvider engine={engine}>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: "relative", zIndex: 1 }}>
          <div className="container tall screen-body no-scroll learn-body">
            {challengeLocked ? (
              <p className="lib-lock-notice challenge-lock-notice" role="status">
                <IconLock width={14} height={14} aria-hidden="true" />{" "}
                {challengeLearnLockText(gate.listenedCount, gate.total)}
              </p>
            ) : null}
            <div className="learn-grid">
              <nav className="lib-col" aria-label="Ses konuları">
                {/* T209: öğrenme tamamlanma göstergesi (kilidin ilerleme metni). */}
                <h2 className="lib-head" role="status" aria-label={gate.progressText}>
                  Konular · {gate.listenedCount}/{gate.total}
                </h2>
                {isVisitor && lockNotice ? (
                  <p className="lib-lock-notice" role="status">
                    <IconLock width={14} height={14} aria-hidden="true" /> {VISITOR_LOCK_TEXT.itemLocked}
                  </p>
                ) : null}
                {LIBRARY_GROUPS.map((group) => (
                  <div className="lib-group" key={group.id}>
                    <div className="g-title">
                      {group.title}
                      <span className="g-count">
                        {group.items.filter((entry) => gate.listened.has(entry.key)).length}/{group.items.length}
                      </span>
                    </div>
                    <div className="lib-items">
                      {group.items.map((entry) => {
                        const locked = isVisitor && !isVisitorUnlocked(entry.key);
                        const listened = gate.listened.has(entry.key);
                        const urgent = URGENT_KEYS.has(entry.key);
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            className={["lib-item", entry.key === selectedKey ? "active" : "", locked ? "locked" : "", listened ? "listened" : ""]
                              .filter(Boolean)
                              .join(" ")}
                            aria-current={entry.key === selectedKey ? "true" : undefined}
                            aria-disabled={locked}
                            aria-label={locked ? `${libraryTitle(entry.key)} — ${VISITOR_LOCK_TEXT.itemLocked}` : undefined}
                            onClick={() => {
                              if (locked) {
                                setLockNotice(true);
                                return;
                              }
                              setLockNotice(false);
                              selectItem(entry.key);
                            }}
                            title={locked ? VISITOR_LOCK_TEXT.itemLocked : libraryTitle(entry.key)}
                          >
                            <span className={`ck${listened ? " done" : ""}`} aria-hidden="true">
                              {listened ? "✓" : ""}
                            </span>
                            <b>{libraryShortTitle(entry.key)}</b>
                            {listened ? <span className="sr-only"> — dinlendi</span> : null}
                            {urgent ? <span className="lib-urgent">Acil</span> : null}
                            {locked ? <IconLock width={14} height={14} aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <section className="sim-main" aria-label="Manken ve hasta">
                <div className="learn-head">
                  <span className="learn-eb">{groupLabel}</span>
                  <h3 className="learn-title">{libraryTitle(item.key)}</h3>
                  <div className="learn-pills">
                    {URGENT_KEYS.has(item.key) ? <span className="lp urgent">⚠ Acil</span> : null}
                    <span className={`lp ${example.kind === "real" ? "real" : "syn"}`}>
                      {example.kind === "real" ? "Gerçek hasta sesi" : example.kind === "model" ? "Sentetik · bölgesel model" : "Sentetik · çok bölgeli"}
                    </span>
                  </div>
                  <div className="learn-study" role="status">
                    <span>
                      {done
                        ? "Tüm örnekler dinlendi ✓"
                        : `Örnekler ${doneExamples}/${examples.length} dinlendi · bu örnek ${exampleDone(exIndex) ? "✓" : `${seconds}/${LEARN_EXAMPLE_SECONDS} sn`} · yalnız ses çalarken sayılır`}
                    </span>
                    <i aria-hidden="true">
                      <b style={{ width: `${Math.min(100, (doneExamples / Math.max(1, examples.length)) * 100)}%` }} />
                    </i>
                  </div>
                </div>
                {/* T206/T309: sahne, `data-view` ile seçilen gövde görselinin en-boy
                    oranında; görünüm ve katman düğmeleri maketteki gibi sahnenin üstünde. */}
                <div className="stage-card" data-view={view}>
                  <PatientStage
                    key={`${item.key}:${exampleIndex}`}
                    ref={stageRef}
                    points={POINTS}
                    filterIds={stagePointIds}
                    view={view}
                    head={state.head}
                    volume={state.volume}
                    showPoints
                    showLabels
                    bodyType={bodyType}
                    mode="learn"
                    soundFor={soundFor}
                    onVisit={(pointId) => dispatch({ type: "visit", pointId })}
                    onDwell={(pointId, dwellMs) => dispatch({ type: "dwell", pointId, dwellMs })}
                    onListen={(pointId, listenMs) => dispatch({ type: "listen", pointId, listenMs })}
                    onListenTick={(pointId, ms) => {
                      // T307: yalnız ses çalarken ve konunun noktasındayken süre sayılır.
                      const key = listenedKeyOnPlay(true, pointId, item.key, pointIds);
                      if (key !== null) gate.addListen(key, exIndex, ms);
                    }}
                    onPlayingChange={(isPlaying, pointId) => {
                      setPlaying(isPlaying);
                      setActivePoint(pointId);
                    }}
                  />
                  <ViewToggle
                    className="stage-views"
                    views={VIEW_ORDER}
                    allowed={views}
                    selected={view}
                    onSelect={selectView}
                    icons={false}
                    lockReason={(entry) => `Bu örnekte ${VIEW_LABEL[entry].toLocaleLowerCase("tr")} kayıt yok`}
                  />
                  {isMixed && view === "front" ? (
                    <div className="layer-toggle" role="group" aria-label="Oskültasyon katmanı">
                      {(["heart", "lung"] as const).map((entry) => (
                        <button key={entry} type="button" aria-pressed={layer === entry} className={layer === entry ? "active" : ""} onClick={() => setLayer(entry)}>
                          {entry === "heart" ? "Kalp odakları" : "Akciğer alanları"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span className="stage-fig">Figür: {figure}</span>
                </div>
                {activeLungComponent && (
                  <div className="note-strip">
                    <IconInfo width={17} height={17} />
                    <span className="small">
                      Sırtta kalp sesleri zayıf duyulur; bu noktada yalnız akciğer bileşeni dinletilir.
                    </span>
                  </div>
                )}
                {activeFallback && fallbackPoint && (
                  <div className="note-strip">
                    <IconInfo width={17} height={17} />
                    <span className="small">
                      Bu bölge için doğrudan kayıt yok; aynı bulgunun <strong>{fallbackPoint.fullLabel}</strong> kaydı çalınmaktadır.
                    </span>
                  </div>
                )}
                <div className="learn-examples">
                  <div className="learn-lbl">Örnekler</div>
                  <div className="ex-row" role="group" aria-label="Örnek seçimi">
                    {examples.map((entry, index) => {
                      const ordinal = examples.slice(0, index + 1).filter((other) => other.kind === "real").length;
                      const regions = entry.kind === "library" ? null : Object.keys(entry.points).length;
                      return (
                        <button
                          key={index}
                          type="button"
                          className={["ex-btn", entry.kind === "real" ? "real" : "syn", index === exampleIndex ? "active" : ""].filter(Boolean).join(" ")}
                          aria-pressed={index === exampleIndex}
                          onClick={() => {
                            setExampleIndex(index);
                            setActivePoint(null);
                            setPlaying(false);
                          }}
                        >
                          {entry.kind === "real" ? (
                            <>
                              Gerçek {ordinal}
                              <small>{regions} bölge</small>
                            </>
                          ) : (
                            "Sentetik"
                          )}
                          {exampleDone(index) ? <span className="ex-done"> ✓<span className="sr-only"> dinlendi</span></span> : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="ex-note">
                    {examples.length > 1
                      ? `Önce sentetik sette odakları gezin; ardından bulgunun en çok bölgede duyulduğu gerçek hastaları dinleyin. Konu, ${examples.length} örneğin her biri en az ${LEARN_EXAMPLE_SECONDS} sn dinlenince tamamlanır.`
                      : `Bu bulgu için açık veri kümelerinde bölge etiketli gerçek hasta kaydı yok; yalnız sentetik set (en az ${LEARN_EXAMPLE_SECONDS} sn dinleyin).`}
                  </p>
                </div>
                <PatientCard example={example} ordinal={realOrdinal} regions={pointIds.length} figure={figure} />
              </section>

              <section className="sim-side" aria-label="Kayıt ve açıklama">
                <LearnWave
                  title={activeLabel ? `${libraryShortTitle(item.key)} · ${activeLabel}` : libraryShortTitle(item.key)}
                  meta={wave ? `${Math.round(wave.durationSec)} sn · ${example.kind === "real" ? "gerçek hasta" : "sentetik"}` : ""}
                  wave={wave}
                  markSource={markSource}
                  emptyText="Stetoskobu bir oskültasyon bölgesine sürükleyin; çalan kaydın dalga formu burada görünür."
                  controls={
                    <>
                      <button
                        type="button"
                        className="lw-play"
                        aria-pressed={playing}
                        disabled={shownPoint === null}
                        onClick={togglePlay}
                      >
                        {playing ? "❚❚ Durdur" : "▶ Dinle"}
                      </button>
                      <span className="lw-lbl" id="learn-head-lbl">
                        Göğüs başlığı
                      </span>
                      <div className="lw-seg" role="group" aria-labelledby="learn-head-lbl">
                        {(["bell", "diaphragm"] as const).map((entry) => (
                          <button
                            key={entry}
                            type="button"
                            aria-pressed={state.head === entry}
                            title={entry === "bell" ? "Bell — düşük frekans vurgusu" : "Diyafram — orta/yüksek frekans vurgusu"}
                            onClick={() => dispatch({ type: "setHead", head: entry })}
                          >
                            {entry === "bell" ? "Bell" : "Diyafram"}
                          </button>
                        ))}
                      </div>
                    </>
                  }
                />
                <section className="learn-about" aria-labelledby="learn-about-title">
                  <div className="la-head">
                    <span className="learn-eb">{groupLabel}</span>
                    <h3 id="learn-about-title">{libraryTitle(item.key)}</h3>
                    <span className="learn-lbl la-tag">Bu ses hakkında</span>
                  </div>
                  {about.urgent ? <p className="la-alert">{about.urgent}</p> : null}
                  <div className="la-grid">
                    <div className="la-card">
                      <div className="learn-lbl">Tanım ve ölçüt</div>
                      <p className="la-crit">{about.crit}</p>
                      <p className="la-refs">
                        <span>Kaynak:</span>
                        {refs.map((ref) => (
                          <a key={ref.doi} href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer" title={ref.title}>
                            {ref.label}
                          </a>
                        ))}
                      </p>
                    </div>
                    <div className="la-card">
                      <div className="learn-lbl">Bu kayıtta dinleyin</div>
                      <ul className="la-look">
                        {about.look.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="la-card">
                      <div className="learn-lbl">Neden oluşur?</div>
                      <p className="la-mech">{about.mech}</p>
                    </div>
                  </div>
                  <div className="la-actions">
                    <p className="src-line">
                      <IconCompare />
                      Vaka kapsamı: {cov.p > 0 ? `${cov.p} uygulama vakası` : "vaka yok"}
                      {cov.a > 0 ? `, ${cov.a} değerlendirme vakası` : ""}
                    </p>
                    <button type="button" className="btn outline small ped-ref-btn" onClick={() => setPedModalOpen(true)}>
                      <IconInfo width={14} height={14} /> Pediatrik referans
                    </button>
                    {cov.p > 0 && (
                      <button
                        type="button"
                        className="btn outline small"
                        onClick={() => (isVisitor ? requestSignIn?.() : startPracticeForFinding())}
                        disabled={practiceDisabled}
                      >
                        Bu sesle uygulama yap <IconArrowRight width={14} height={14} />
                      </button>
                    )}
                  </div>
                  {cov.p > 0 && (isVisitor || practiceLocked) ? (
                    <p className="lib-lock-notice" role="status">
                      <IconLock width={14} height={14} aria-hidden="true" /> {practiceLockText}
                    </p>
                  ) : null}
                </section>
              </section>
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
        <PediatricRefModal open={pedModalOpen} onClose={() => setPedModalOpen(false)} />
      </ToolbarAudioProvider>
    </StageAudioProvider>
  );
}

function PatientCard({ example, ordinal, regions, figure }: { example: LearnExample; ordinal: number; regions: number; figure: string }): JSX.Element {
  if (example.kind === "real") {
    return (
      <div className="patient-card">
        <div className="pc-head">
          <b>Hasta kartı · Gerçek {ordinal}</b>
          <span className="lp real">Gerçek hasta verisi</span>
        </div>
        <dl>
          {example.rows.map(([key, value]) => (
            <div key={key} className="pc-row">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {example.noLevel ? (
          <p className="pc-note">
            <IconInfo width={14} height={14} /> Kaynakta seviye (üst/orta/alt) yok; kayıt bu açının orta noktasına yerleştirildi.
          </p>
        ) : null}
        <p className="pc-src">
          Kaynak: {example.sourceLabel} · {VIEW_SUMMARY(example)}. Kayıttan yalnız çeviri; kurgu eklenmedi.
        </p>
      </div>
    );
  }
  return (
    <div className="patient-card">
      <div className="pc-head">
        <b>Kayıt kartı</b>
        <span className="lp syn">Sentetik eğitim kaydı</span>
      </div>
      <dl>
        <div className="pc-row">
          <dt>Kayıt</dt>
          <dd>{example.kind === "model" ? "Bölgesel yayılım modeli, çok bölgeli" : "Klinik manken (HLS-CMDS), çok bölgeli"}</dd>
        </div>
        <div className="pc-row">
          <dt>Dinlenebilir odak</dt>
          <dd>{regions} bölge</dd>
        </div>
        <div className="pc-row">
          <dt>Figür</dt>
          <dd>{figure}</dd>
        </div>
      </dl>
      {example.kind === "model" ? <p className="pc-note">{example.note}</p> : null}
      <p className="pc-src">
        Kaynak: {example.kind === "model" ? SOURCE_TITLE.get(example.source) ?? example.source : "HLS-CMDS (Mendeley Data) — CC BY 4.0"}
      </p>
    </div>
  );
}

function VIEW_SUMMARY(example: Extract<LearnExample, { kind: "real" }>): string {
  const counts = new Map<PatientView, number>();
  for (const id of Object.keys(example.points)) {
    const pointView = POINT_BY_ID.get(id)?.view;
    if (pointView) counts.set(pointView, (counts.get(pointView) ?? 0) + 1);
  }
  return VIEW_ORDER.filter((entry) => counts.has(entry))
    .map((entry) => `${VIEW_LABEL[entry].toLocaleLowerCase("tr")} ${counts.get(entry)}`)
    .join(" · ");
}

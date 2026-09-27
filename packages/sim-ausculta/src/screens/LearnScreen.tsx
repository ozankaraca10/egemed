import { useSessions } from "../ui/ScreenHeading";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { VISITOR_LOCK_TEXT } from "@egemed/sim-host";
import { countUnlistenedInOtherView, otherViewHintText } from "../core/flow";
import { resolveLibrarySound, resolveLibrarySoundEx, type LibrarySoundResult } from "../core/resolver";
import { useStore } from "../core/StoreProvider";
import type { AuscultationPoint, SoundRecord } from "../core/types";
import { isVisitorUnlocked } from "../core/visitorAccess";
import pointsData from "../data/auscultation-points.json";
import libraryData from "../data/library.json";
import { CASE_INVENTORY } from "../data/inventory";
import { libraryShortTitle, librarySub, libraryTitle } from "../data/terminology";
import { PatientStage, StageAudioProvider, type StageAudio, type StageHandle } from "../ui/PatientStage";
import { PediatricRefModal } from "../ui/PediatricRefModal";
import { RegionChipList } from "../ui/RegionChips";
import { useAudience } from "../ui/ScreenHeading";
import { Toolbar, ToolbarAudioProvider, type ToolbarAudio } from "../ui/Toolbar";
import { EcgDeco, Footer } from "../ui/chrome";
import {
  IconArrowRight,
  IconCompare,
  IconDoc,
  IconHeart,
  IconInfo,
  IconLock,
  IconLungs,
  IconStethoscope,
  IconWave,
} from "../ui/icons";

/** Öğrenme modu: kütüphane + simülatör. Skor yok.
 *  Port (E2 §9 S14): `document`/`Date.now` yok; kaydırma `LearnScreenEnv`, tohum `now`,
 *  ses motoru bağlamdan gelir. DevPanel bu rotada yoktur. */

interface LibItem {
  key: string;
  category: string;
  acousticFinding: string;
  description: string;
  metaphor?: string;
  s1?: string;
  s2?: string;
  phase?: string;
  clinical: string;
  bestPoints: string[];
  group: string;
}

interface LibGroup {
  id: string;
  title: string;
  items: LibItem[];
}

interface RawItem {
  key: string;
  category: string;
  acousticFinding: string;
  description: string;
  metaphor?: string;
  s1?: string;
  s2?: string;
  phase?: string;
  clinical: string;
  bestPoints: string[];
}

interface RawGroup {
  id: string;
  title: string;
  items: RawItem[];
}

function toItem(groupId: string, raw: RawItem): LibItem {
  const item: LibItem = {
    key: raw.key,
    category: raw.category,
    acousticFinding: raw.acousticFinding,
    description: raw.description,
    clinical: raw.clinical,
    bestPoints: raw.bestPoints,
    group: groupId,
  };
  if (raw.metaphor !== undefined) item.metaphor = raw.metaphor;
  if (raw.s1 !== undefined) item.s1 = raw.s1;
  if (raw.s2 !== undefined) item.s2 = raw.s2;
  if (raw.phase !== undefined) item.phase = raw.phase;
  return item;
}

const LIBRARY_GROUPS: LibGroup[] = (libraryData.groups as RawGroup[]).map((group) => ({
  id: group.id,
  title: group.title,
  items: group.items.map((item) => toItem(group.id, item)),
}));

/** Kaynakta `heart.normal`; strict indeks için modül yüklenirken doğrulanan ilk öğe. */
const FIRST_LIBRARY_ITEM: LibItem = (() => {
  const first = LIBRARY_GROUPS[0]?.items[0];
  if (!first) throw new Error("Kütüphane boş olamaz");
  return first;
})();

const POINTS = pointsData.points as AuscultationPoint[];

function findLibraryItem(key: string): LibItem {
  for (const group of LIBRARY_GROUPS) {
    const found = group.items.find((item) => item.key === key);
    if (found) return found;
  }
  return FIRST_LIBRARY_ITEM;
}

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
    setMuted: () => undefined,
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

export function LearnScreen({
  embedded = false,
  env = NOOP_LEARN_ENV,
  audio,
}: LearnScreenProps): JSX.Element {
  const { state, dispatch } = useStore();
  const contextual = useContext(LearnAudioContext);
  const engine = audio ?? contextual ?? NOOP_LEARN_AUDIO;
  const audience = useAudience();
  const isVisitor = audience === "visitor";
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const wanted = state.learnFocusKey ?? FIRST_LIBRARY_ITEM.key;
    if (isVisitor && !isVisitorUnlocked(wanted)) return FIRST_LIBRARY_ITEM.key;
    return wanted;
  });
  const [tab, setTab] = useState<"desc" | "wave" | "clin">("desc");
  const stageRef = useRef<StageHandle>(null);
  const [activePoint, setActivePoint] = useState<string | null>(null);
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

  const cov = CASE_INVENTORY.coverage[item.acousticFinding] ?? { p: 0, a: 0 };

  const startPracticeForFinding = () => {
    // T196: odaklı uygulama oturumu (bulgu başına ≤5 vaka) yalnız sunucudan açılır.
    if (sessions === undefined || cov.p === 0) return;
    dispatch({ type: "startMode", mode: "practice", focusFinding: item.acousticFinding });
  };

  useEffect(() => {
    engine.stop();
    env.scrollActiveLibraryItem();
  }, [engine, env, selectedKey]);

  const stageSounds = useMemo(() => {
    const cache = new Map<string, LibrarySoundResult>();
    const resolve = (pointId: string): LibrarySoundResult => {
      const cached = cache.get(pointId);
      if (cached) return cached;
      const res = resolveLibrarySoundEx(item.category, item.acousticFinding, pointId);
      cache.set(pointId, res);
      return res;
    };
    return { resolve };
  }, [item]);

  const soundsForStage = (pointId: string): SoundRecord | null => stageSounds.resolve(pointId).record;
  const activeFallback = activePoint ? stageSounds.resolve(activePoint).fallbackFrom : undefined;
  const fallbackPoint = activeFallback ? POINTS.find((point) => point.id === activeFallback) : undefined;
  const title = libraryTitle(item.key);
  const libSound = resolveLibrarySound(item.category, item.acousticFinding);
  const otherHint = otherViewHintText(
    state.view,
    countUnlistenedInOtherView(POINTS, item.bestPoints, state.view, state.telemetry.visits),
  );

  return (
    <StageAudioProvider engine={engine}>
      <ToolbarAudioProvider engine={engine}>
        <EcgDeco embedded={embedded} />
        <div className="screen" style={{ position: "relative", zIndex: 1 }}>
          <div className="container tall screen-body no-scroll">
            <div className="learn-grid">
              <div className="lib-col">
                <h2>{isMixed ? "Kombine Sesler" : isHeart ? "Kalp Sesleri" : "Akciğer Sesleri"}</h2>
                <p className="lib-sub">Dinle, tanı, öğren.</p>
                {isVisitor && lockNotice ? (
                  <p className="lib-lock-notice" role="status">
                    <IconLock width={14} height={14} aria-hidden="true" /> {VISITOR_LOCK_TEXT.itemLocked}
                  </p>
                ) : null}
                {LIBRARY_GROUPS.map((group) => (
                  <div className="lib-group" key={group.id}>
                    <div className="g-title">
                      <GroupIcon group={group.id} />
                      {group.title}
                    </div>
                    <div className="lib-items">
                      {group.items.map((entry) => {
                        const locked = isVisitor && !isVisitorUnlocked(entry.key);
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            className={["lib-item", entry.key === selectedKey ? "active" : "", locked ? "locked" : ""]
                              .filter(Boolean)
                              .join(" ")}
                            aria-disabled={locked}
                            aria-label={locked ? `${libraryTitle(entry.key)} — ${VISITOR_LOCK_TEXT.itemLocked}` : undefined}
                            onClick={() => {
                              if (locked) {
                                setLockNotice(true);
                                return;
                              }
                              setLockNotice(false);
                              setSelectedKey(entry.key);
                            }}
                            title={locked ? VISITOR_LOCK_TEXT.itemLocked : libraryTitle(entry.key)}
                          >
                            <span className="ic">
                              <GroupIcon group={group.id} />
                            </span>
                            <span className="lib-main">
                              <b>{libraryShortTitle(entry.key)}</b>
                              <span>{librarySub(entry.key)}</span>
                            </span>
                            <span className="lib-right">
                              {locked ? (
                                <IconLock width={14} height={14} aria-hidden="true" />
                              ) : (
                                <span className="chev">›</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sim-main">
                <div className="stage-card">
                  <PatientStage
                    ref={stageRef}
                    points={POINTS}
                    {...(item.bestPoints.length ? { filterIds: item.bestPoints } : {})}
                    view={state.view}
                    head={state.head}
                    volume={state.volume}
                    showPoints
                    showLabels
                    bodyType="erkek"
                    mode="learn"
                    soundFor={soundsForStage}
                    onVisit={(pointId) => dispatch({ type: "visit", pointId })}
                    onDwell={(pointId, dwellMs) => dispatch({ type: "dwell", pointId, dwellMs })}
                    onListen={(pointId, listenMs) => dispatch({ type: "listen", pointId, listenMs })}
                    onPlayingChange={(_playing, pointId) => setActivePoint(pointId)}
                  />
                  <RegionChipList
                    points={POINTS}
                    view={state.view}
                    pointIds={item.bestPoints}
                    activePoint={activePoint}
                    visits={state.telemetry.visits}
                    onSelect={(pointId) => stageRef.current?.placeAt(pointId)}
                    {...(otherHint ? { otherViewHint: otherHint } : {})}
                  />
                  {activeFallback && fallbackPoint && (
                    <div className="note-strip" style={{ marginTop: 8 }}>
                      <IconInfo width={17} height={17} />
                      <span className="small">
                        Bu bölge için veri setinde doğrudan kayıt yok; aynı bulgunun <strong>{fallbackPoint.fullLabel}</strong> kaydı
                        çalınmaktadır.
                      </span>
                    </div>
                  )}
                </div>
                <Toolbar stageRef={stageRef} activePoint={activePoint} />
              </div>

              <div className="sim-side">
                <div className="card">
                  <div className="card-title-row">
                    <div className="ic">
                      <GroupIcon group={item.group} />
                    </div>
                    <h3>{title}</h3>
                    <div className="card-title-actions">
                      <span className="badge blue">{findingBadge(item.key)}</span>
                      <button type="button" className="btn outline small ped-ref-btn" onClick={() => setPedModalOpen(true)}>
                        <IconInfo width={14} height={14} /> Pediatrik referans
                      </button>
                    </div>
                  </div>
                  <div className="tabbar info-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "desc"} className={tab === "desc" ? "active" : ""} onClick={() => setTab("desc")}>
                      <IconDoc /> Açıklama
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "wave"} className={tab === "wave" ? "active" : ""} onClick={() => setTab("wave")}>
                      <IconWave /> Dalga Formu
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "clin"} className={tab === "clin" ? "active" : ""} onClick={() => setTab("clin")}>
                      <IconStethoscope /> Klinik Bilgi
                    </button>
                  </div>
                  {tab === "desc" && (
                    <div className="info-body">
                      <p>{item.description}</p>
                      {item.metaphor && (
                        <div className="metaphor-card mt-12">
                          <span className="m-ic">
                            <IconWave width={20} height={20} />
                          </span>
                          <div>
                            <b>Ses metaforu</b>
                            <p>{item.metaphor}</p>
                          </div>
                        </div>
                      )}
                      {isHeart && item.s1 && item.s2 && (
                        <div className="exp-cards mt-12">
                          <div className="exp-card" title={`S1: ${item.s1}`}>
                            <span className="chip s1">S1</span>
                            <p>{item.s1}</p>
                          </div>
                          <div className="exp-card" title={`S2: ${item.s2}`}>
                            <span className="chip s2">S2</span>
                            <p>{item.s2}</p>
                          </div>
                        </div>
                      )}
                      {!isHeart && item.phase && (
                        <div className="note-strip mt-12">
                          <IconWave />
                          <span>{item.phase}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === "wave" &&
                    (libSound ? (
                      <LibraryWave sound={libSound} title="Örnek ses kaydı (tam segment)" />
                    ) : (
                      <div className="note-strip">
                        <IconInfo /> Bu bulgu için kullanılabilir kayıt bulunamadı (veri seti eksikliği). Kütüphanenin diğer kalemlerini
                        deneyin.
                      </div>
                    ))}
                  {tab === "clin" && (
                    <div className="info-body">
                      <p className="src-line" style={{ marginTop: 0 }}>
                        <IconCompare />
                        Vaka kapsamı: {cov.p > 0 ? `${cov.p} uygulama vakası` : "vaka yok"}
                        {cov.a > 0 ? `, ${cov.a} değerlendirme vakası` : ""}
                      </p>
                      {cov.p > 0 && (
                        <button type="button" className="btn outline small mb-12" onClick={startPracticeForFinding}>
                          Bu sesle uygulama yap <IconArrowRight width={14} height={14} />
                        </button>
                      )}
                      <div className="klin-strip mt-12">
                        <IconStethoscope />
                        <span>{item.clinical}</span>
                      </div>
                      <p className="src-line">
                        <IconInfo />
                        Kaynak: HLS-CMDS v3 — CC BY 4.0 (DOI 10.17632/8972jxbpmp.3)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer embedded={embedded} />
        <PediatricRefModal open={pedModalOpen} onClose={() => setPedModalOpen(false)} />
      </ToolbarAudioProvider>
    </StageAudioProvider>
  );
}

/** S12c `WaveformView` bu dilimde yok. Sekme, kaynak başlığını ve durağan taşıma kabuğunu çizer;
 *  tuval, RAF ve `performance.now` yoktur. */
function LibraryWave({ sound, title }: { sound: SoundRecord; title: string }): JSX.Element {
  const dur = sound.durationSec || 15;
  const clock = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60);
    return `${mins}:${String(rest).padStart(2, "0")}`;
  };
  return (
    <div className="wave-panel">
      <div className="small muted mb-8">{title}</div>
      <div className="wave-zoom" role="group" aria-label="Dalga formu yakınlaştırma">
        <button type="button" className="active" aria-pressed={true}>
          1×
        </button>
      </div>
      <div className="transport">
        <span className="t-time">
          0:00 / {clock(dur)}
        </span>
      </div>
    </div>
  );
}

function GroupIcon({ group, size = 17 }: { group: string; size?: number }): JSX.Element {
  if (group === "heart") return <IconHeart width={size} height={size} />;
  if (group === "mixed") return <IconCompare width={size} height={size} />;
  return <IconLungs width={size} height={size} />;
}

function findingBadge(key: string): string {
  if (key.startsWith("mixed")) return "Kombine";
  if (key === "heart.normal") return "S1 – S2";
  if (key === "heart.s3") return "S3";
  if (key === "heart.s4") return "S4";
  if (key.startsWith("heart.murmur")) return "Üfürüm";
  if (key === "heart.atrial_fibrillation") return "Ritim";
  if (key === "heart.tachycardia") return "Hız";
  if (key === "heart.av_block") return "İletim";
  return "Ses";
}

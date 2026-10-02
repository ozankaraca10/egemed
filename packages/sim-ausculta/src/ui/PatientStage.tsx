/** Etkileşimli hasta sahnesi (S9b). Geometri `patient-stage/geometry`'den gelir.
 *  Ses motoru prop veya bağlam ile verilir; modül singleton'ı yoktur.
 *  Zamanlayıcı ve gözlem `StageEnv` ile enjekte edilir. Unmount sırayı artırır. */

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AUDIO_CONFIG } from "../audio/config";
import type { Mode, PatientView, SoundRecord, StethHead } from "../core/types";
import { Chestpiece } from "./stethoscope";
import { TorsoPediatricBack, TorsoPediatricFront } from "./torso-pediatric";
import {
  INITIAL_STAGE_POSITION,
  coordOf,
  findNearestPoint,
  fitStageBox,
  isPediatricSchematic,
  isPlaceKey,
  isPrimaryPointer,
  nudgeStagePosition,
  pointerToStagePosition,
  pointsInView,
  stageViewConfig,
  type BodyType,
  type NormPoint,
  type StageCoordPoint,
  type StageRect,
} from "./patient-stage/geometry";
import { tubeAnchor, tubeHeadsetHeight, tubePath, tubeTip } from "./patient-stage/tube";

export interface StagePoint extends StageCoordPoint {
  readonly label: string;
  readonly color: string;
  readonly tagSide: "left" | "right";
}

export interface StageObserveTarget {
  getBoundingClientRect(): { readonly width: number; readonly height: number };
}

/** Pencere sınırı. Üretimde kabuk gerçek vekili enjekte eder; SSR/test no-op kullanır. */
export interface StageEnv {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  setInterval(handler: () => void, ms: number): number;
  clearInterval(handle: number): void;
  observeStage(target: StageObserveTarget, onResize: () => void): () => void;
}

export function createNoopStageEnv(): StageEnv {
  return {
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    setInterval: () => 0,
    clearInterval: () => undefined,
    observeStage: () => () => undefined,
  };
}

const NOOP_STAGE_ENV: StageEnv = createNoopStageEnv();

/** Tarayıcı zamanlayıcıları. Boyut gözlemi no-op kalır: sahne ölçüsü CSS ile verilir (T206). */
export function createBrowserStageEnv(): StageEnv {
  const win = globalThis as unknown as {
    setTimeout(handler: () => void, ms: number): number;
    clearTimeout(handle: number): void;
    setInterval(handler: () => void, ms: number): number;
    clearInterval(handle: number): void;
  };
  return {
    setTimeout: (handler, ms) => win.setTimeout(handler, ms),
    clearTimeout: (handle) => win.clearTimeout(handle),
    setInterval: (handler, ms) => win.setInterval(handler, ms),
    clearInterval: (handle) => win.clearInterval(handle),
    observeStage: () => () => undefined,
  };
}

const StageEnvContext = createContext<StageEnv | null>(null);

/** Modül bağlamı: `env` prop'u verilmeyen tüm sahneler bu zamanlayıcıları kullanır. */
export function StageEnvProvider({ env, children }: { env: StageEnv; children?: ReactNode }) {
  return <StageEnvContext.Provider value={env}>{children}</StageEnvContext.Provider>;
}

export interface StageAudioStatus {
  readonly pointId: string;
  readonly status: "loading" | "error";
}

/** PatientStage'in kullandığı motor yüzeyi. Tam `AudioEngine` bunu karşılar. */
export interface StageAudio {
  play(pointId: string, sound: SoundRecord, head: StethHead): Promise<void>;
  replay(pointId: string, sound: SoundRecord, head: StethHead): Promise<void>;
  stop(): void;
  setVolume(volume: number): void;
  getActive(): unknown;
  ensureContext(): Promise<unknown>;
}

export interface StageSessionBindings {
  points: readonly StagePoint[];
  filterIds?: readonly string[];
  bodyType: BodyType;
  view: PatientView;
  head: StethHead;
  strict: boolean;
  env: StageEnv;
  engine: StageAudio;
  soundFor: (pointId: string) => SoundRecord | null;
  onVisit: (pointId: string) => void;
  onDwell: (pointId: string, ms: number) => void;
  onListen: (pointId: string, ms: number) => void;
  /** T307: ses çalarken her tıkta (DWELL_TICK_MS) çağrılır; öğrenme süresi sayacı. */
  onListenTick?: (pointId: string, ms: number) => void;
  onPlayingChange: (playing: boolean, pointId: string | null) => void;
  onDragStart?: () => void;
  onSnapped: (pointId: string | null) => void;
  onPlaying: (playing: boolean) => void;
  onSpent: (spent: boolean) => void;
  onAudioStatus: (status: StageAudioStatus | null) => void;
  onPulse: () => void;
  getPos: () => NormPoint;
  setPos: (position: NormPoint) => void;
  applyPos: () => void;
  measure: () => StageRect | null;
}

export interface StageSession {
  /** Yerleştirme sırası. `unplace` ve `dispose` artırır. */
  seq(): number;
  place(pointId: string): void;
  unplace(): void;
  /** Unmount: sıra artar, zamanlayıcı düşer, uçuştaki play ses başlatamaz. */
  dispose(): void;
  replay(): void;
  stop(): void;
  syncHead(head: StethHead): void;
  setVolume(volume: number): void;
  armDrag(): void;
  movePointer(clientX: number, clientY: number): void;
  releasePointer(): void;
  keyDown(key: string): "moved" | "placed" | "ignored";
}

const DWELL_TICK_MS = 500;

export function createStageSession(bindings: StageSessionBindings): StageSession {
  let seq = 0;
  let snapped: string | null = null;
  let playing = false;
  let dragging = false;
  let dwellAcc = 0;
  let listenAcc = 0;
  let dwellHandle: number | undefined;
  let playHandle: number | undefined;
  let lastHead = bindings.head;
  const listened = new Set<string>();

  const clearTimers = (): void => {
    const env = bindings.env;
    if (dwellHandle !== undefined) env.clearInterval(dwellHandle);
    if (playHandle !== undefined) env.clearTimeout(playHandle);
    dwellHandle = undefined;
    playHandle = undefined;
  };

  const haltAudio = (): void => {
    clearTimers();
    bindings.engine.stop();
    playing = false;
  };

  const startPlay = async (ticket: number, pointId: string): Promise<void> => {
    if (ticket !== seq) return;
    bindings.onAudioStatus({ pointId, status: "loading" });
    const sound = bindings.soundFor(pointId);
    if (!sound || ticket !== seq) {
      if (ticket === seq) bindings.onPlayingChange(false, pointId);
      return;
    }
    try {
      await bindings.engine.play(pointId, sound, bindings.head);
      if (ticket !== seq) {
        bindings.engine.stop();
        return;
      }
      listened.add(pointId);
      bindings.onSpent(false);
      bindings.onAudioStatus(null);
      playing = true;
      bindings.onPlaying(true);
      bindings.onPlayingChange(true, pointId);
    } catch {
      if (ticket !== seq) return;
      playing = false;
      bindings.onPlaying(false);
      bindings.onAudioStatus({ pointId, status: "error" });
      bindings.onPlayingChange(false, pointId);
    }
  };

  const visible = (): readonly StagePoint[] => {
    const ids = bindings.filterIds;
    const matched = ids
      ? pointsInView(bindings.points, bindings.view, ids)
      : pointsInView(bindings.points, bindings.view);
    const wanted = new Set(matched.map((point) => point.id));
    return bindings.points.filter((point) => wanted.has(point.id));
  };

  return {
    seq: () => seq,
    place(pointId): void {
      const point = bindings.points.find((item) => item.id === pointId);
      if (!point || point.view !== bindings.view) return;
      const ticket = ++seq;
      bindings.setPos(coordOf(point, bindings.bodyType));
      bindings.applyPos();
      bindings.onPulse();
      bindings.onVisit(pointId);
      snapped = pointId;
      bindings.onSnapped(pointId);
      dwellAcc = 0;
      listenAcc = 0;
      clearTimers();
      dwellHandle = bindings.env.setInterval(() => {
        dwellAcc += DWELL_TICK_MS;
        if (snapped) bindings.onDwell(snapped, DWELL_TICK_MS);
        if (playing) {
          listenAcc += DWELL_TICK_MS;
          if (snapped) bindings.onListenTick?.(snapped, DWELL_TICK_MS);
        }
      }, DWELL_TICK_MS);
      if (bindings.strict && listened.has(pointId)) {
        bindings.onSpent(true);
        bindings.onPlayingChange(false, pointId);
        return;
      }
      playHandle = bindings.env.setTimeout(() => {
        playHandle = undefined;
        void startPlay(ticket, pointId);
      }, AUDIO_CONFIG.dwellToPlayMs);
    },
    unplace(): void {
      seq += 1;
      const prev = snapped;
      if (prev) {
        if (dwellAcc > 0) bindings.onDwell(prev, dwellAcc);
        if (listenAcc > 0) bindings.onListen(prev, listenAcc);
      }
      dwellAcc = 0;
      listenAcc = 0;
      haltAudio();
      bindings.onPlaying(false);
      bindings.onPlayingChange(false, null);
      snapped = null;
      bindings.onSnapped(null);
    },
    dispose(): void {
      seq += 1;
      snapped = null;
      haltAudio();
    },
    replay(): void {
      if (!snapped) return;
      if (bindings.strict && listened.has(snapped)) {
        bindings.onSpent(true);
        return;
      }
      const sound = bindings.soundFor(snapped);
      if (!sound) return;
      void bindings.engine.replay(snapped, sound, bindings.head).catch(() => undefined);
      bindings.onPulse();
    },
    stop(): void {
      bindings.engine.stop();
      playing = false;
      bindings.onPlaying(false);
      bindings.onPlayingChange(false, snapped);
    },
    syncHead(head): void {
      if (lastHead !== head && snapped) {
        const blocked = bindings.strict && listened.has(snapped) && !playing;
        const sound = bindings.soundFor(snapped);
        if (!blocked && sound) void bindings.engine.replay(snapped, sound, head).catch(() => undefined);
      }
      lastHead = head;
    },
    setVolume(volume): void {
      bindings.engine.setVolume(volume);
    },
    armDrag(): void {
      dragging = true;
      this.unplace();
      void bindings.engine.ensureContext().catch(() => undefined);
      bindings.onDragStart?.();
    },
    movePointer(clientX, clientY): void {
      if (!dragging) return;
      const rect = bindings.measure();
      if (!rect) return;
      bindings.setPos(pointerToStagePosition(clientX, clientY, rect));
      bindings.applyPos();
    },
    releasePointer(): void {
      if (!dragging) return;
      dragging = false;
      const rect = bindings.measure();
      if (!rect) return;
      const id = findNearestPoint(visible(), bindings.view, bindings.bodyType, bindings.getPos(), rect);
      if (id) this.place(id);
    },
    keyDown(key): "moved" | "placed" | "ignored" {
      const nudged = nudgeStagePosition(bindings.getPos(), key);
      if (nudged) {
        this.unplace();
        bindings.onDragStart?.();
        bindings.setPos(nudged);
        bindings.applyPos();
        return "moved";
      }
      if (!isPlaceKey(key)) return "ignored";
      const rect = bindings.measure();
      if (!rect) return "placed";
      const id = findNearestPoint(visible(), bindings.view, bindings.bodyType, bindings.getPos(), rect);
      if (id) this.place(id);
      return "placed";
    },
  };
}

const StageAudioContext = createContext<StageAudio | null>(null);

export function StageAudioProvider({ engine, children }: { engine: StageAudio; children: ReactNode }) {
  return <StageAudioContext.Provider value={engine}>{children}</StageAudioContext.Provider>;
}

export interface StageHandle {
  replay: () => void;
  stop: () => void;
  placeAt: (pointId: string) => void;
}

export interface PatientStageProps {
  points: readonly StagePoint[];
  filterIds?: readonly string[];
  bodyType?: BodyType;
  strict?: boolean;
  view: PatientView;
  head: StethHead;
  volume: number;
  showPoints: boolean;
  showLabels: boolean;
  mode: Mode;
  /** Prop verilmezse `StageAudioProvider` bağlamı kullanılır. */
  engine?: StageAudio;
  env?: StageEnv;
  soundFor: (pointId: string) => SoundRecord | null;
  onVisit: (pointId: string) => void;
  onDwell: (pointId: string, ms: number) => void;
  onListen: (pointId: string, ms: number) => void;
  onListenTick?: (pointId: string, ms: number) => void;
  onPlayingChange: (playing: boolean, pointId: string | null) => void;
  onDragStart?: () => void;
}

interface StethElement {
  style: { left: string; top: string };
}

interface PathElement {
  setAttribute(name: string, value: string): void;
}

interface PointerTarget {
  setPointerCapture?(pointerId: number): void;
}

function asSteth(value: unknown): StethElement | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<StethElement>;
  if (!node.style) return null;
  return node as StethElement;
}

function asPath(value: unknown): PathElement | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<PathElement>;
  if (typeof node.setAttribute !== "function") return null;
  return node as PathElement;
}

function asMeasure(value: unknown): StageRect | null {
  if (!value || typeof value !== "object") return null;
  const node = value as { getBoundingClientRect?: () => StageRect };
  if (typeof node.getBoundingClientRect !== "function") return null;
  return node.getBoundingClientRect();
}

function asObserve(value: unknown): StageObserveTarget | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<StageObserveTarget>;
  if (typeof node.getBoundingClientRect !== "function") return null;
  return node as StageObserveTarget;
}

const BODY_ALT: Record<PatientView, string> = {
  front: "Hasta anterior gövde görünümü",
  back: "Hasta posterior gövde görünümü",
  left: "Sol lateral gövde görünümü (manken)",
  right: "Sağ lateral gövde görünümü (manken)",
};

export const PatientStage = forwardRef<StageHandle, PatientStageProps>(function PatientStage(props, ref) {
  const contextual = useContext(StageAudioContext);
  const engine = props.engine ?? contextual;
  if (!engine) throw new Error("Ausculta ses motoru yok");
  const contextualEnv = useContext(StageEnvContext);
  const env = props.env ?? contextualEnv ?? NOOP_STAGE_ENV;
  const bodyType = props.bodyType ?? "erkek";
  const strict = props.strict ?? false;
  const fitRef = useRef<unknown>(null);
  const wrapRef = useRef<unknown>(null);
  const stethRef = useRef<unknown>(null);
  const tubeRef = useRef<unknown>(null);
  const tubeShineRef = useRef<unknown>(null);
  const posRef = useRef<NormPoint>({ ...INITIAL_STAGE_POSITION });
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [snapped, setSnapped] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [spentNotice, setSpentNotice] = useState(false);
  const [audioStatus, setAudioStatus] = useState<StageAudioStatus | null>(null);

  const cfg = stageViewConfig(props.view, bodyType);
  /** Göğüs parçası konumunu ve tüp yolunu aynı karede uygular (T228).
   *  Tüp başlangıcı sabittir; ucu göğüs parçasının tüpe bakan kenarıdır. */
  const applyPos = (): void => {
    const el = asSteth(stethRef.current);
    if (el) {
      el.style.left = `${posRef.current.x * 100}%`;
      el.style.top = `${posRef.current.y * 100}%`;
    }
    const path = asPath(tubeRef.current);
    if (!path || box.w <= 0 || box.h <= 0) return;
    const size = { w: box.w, h: box.h };
    const anchor = tubeAnchor(size);
    const tip = tubeTip({ x: posRef.current.x * size.w, y: posRef.current.y * size.h });
    const d = tubePath(anchor, tip, size);
    path.setAttribute("d", d);
    asPath(tubeShineRef.current)?.setAttribute("d", d);
  };
  const slot = useRef<StageSessionBindings | null>(null);
  if (!slot.current) {
    slot.current = {
      points: props.points,
      bodyType,
      view: props.view,
      head: props.head,
      strict,
      env,
      engine,
      soundFor: props.soundFor,
      onVisit: props.onVisit,
      onDwell: props.onDwell,
      onListen: props.onListen,
      ...(props.onListenTick ? { onListenTick: props.onListenTick } : {}),
      onPlayingChange: props.onPlayingChange,
      onSnapped: setSnapped,
      onPlaying: setPlaying,
      onSpent: setSpentNotice,
      onAudioStatus: setAudioStatus,
      onPulse: () => setPulseKey((key) => key + 1),
      getPos: () => posRef.current,
      setPos: (position) => {
        posRef.current = position;
      },
      applyPos,
      measure: () => asMeasure(wrapRef.current),
    };
  }
  const live = slot.current;
  live.points = props.points;
  live.bodyType = bodyType;
  live.view = props.view;
  live.head = props.head;
  live.strict = strict;
  live.env = env;
  live.engine = engine;
  live.soundFor = props.soundFor;
  live.onVisit = props.onVisit;
  live.onDwell = props.onDwell;
  live.onListen = props.onListen;
  if (props.onListenTick) live.onListenTick = props.onListenTick;
  live.onPlayingChange = props.onPlayingChange;
  live.applyPos = applyPos;
  if (props.filterIds) live.filterIds = props.filterIds;
  else delete live.filterIds;
  if (props.onDragStart) live.onDragStart = props.onDragStart;
  else delete live.onDragStart;

  const sessionRef = useRef<StageSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createStageSession(live);
  const session = sessionRef.current;

  useEffect(() => {
    const el = asObserve(fitRef.current);
    if (!el) return;
    const compute = (): void => {
      const fitted = fitStageBox(el.getBoundingClientRect(), cfg);
      if (fitted) setBox(fitted);
    };
    compute();
    return env.observeStage(el, compute);
  }, [cfg, env]);

  useEffect(() => {
    applyPos();
  }, [props.view, box]);

  useEffect(() => {
    session.setVolume(props.volume);
  }, [props.volume, session]);

  useEffect(() => {
    session.syncHead(props.head);
  }, [props.head, session]);

  useEffect(() => {
    session.unplace();
  }, [props.view, session]);

  useEffect(() => {
    return () => {
      session.dispose();
    };
  }, [session]);

  useImperativeHandle(
    ref,
    () => ({
      replay: () => session.replay(),
      stop: () => session.stop(),
      placeAt: (pointId: string) => {
        session.unplace();
        session.place(pointId);
      },
    }),
    [session],
  );

  const visiblePoints = useMemo(() => {
    const matched = props.filterIds
      ? pointsInView(props.points, props.view, props.filterIds)
      : pointsInView(props.points, props.view);
    const wanted = new Set(matched.map((point) => point.id));
    return props.points.filter((point) => wanted.has(point.id));
  }, [props.points, props.view, props.filterIds]);
  const hideTags = props.mode === "assessment";
  const activeLabel = snapped ? props.points.find((point) => point.id === snapped)?.label : undefined;
  const pediatric = isPediatricSchematic(cfg);

  const onPointerDown = (event: ReactPointerEvent): void => {
    if (!isPrimaryPointer(event.button, event.pointerType)) return;
    (event.target as PointerTarget).setPointerCapture?.(event.pointerId);
    setDragging(true);
    session.armDrag();
  };
  const onPointerMove = (event: ReactPointerEvent): void => {
    session.movePointer(event.clientX, event.clientY);
  };
  const onPointerUp = (): void => {
    setDragging(false);
    session.releasePointer();
  };
  const onKeyDown = (event: ReactKeyboardEvent): void => {
    const action = session.keyDown(event.key);
    if (action !== "ignored") event.preventDefault();
  };

  return (
    <div className={`stage ${dragging ? "dragging" : ""}`}>
      {playing && activeLabel && (
        <div className="stage-badge playing" aria-live="polite">
          <span className="dot-live" aria-hidden="true" />
          {activeLabel}
        </div>
      )}
      <div
        ref={(node) => {
          fitRef.current = node;
        }}
        className="stage-fit"
      >
        <div
          ref={(node) => {
            wrapRef.current = node;
          }}
          className="body-wrap"
          style={{ width: box.w || undefined, height: box.h || undefined }}
        >
          {pediatric ? (
            props.view === "front" ? <TorsoPediatricFront /> : <TorsoPediatricBack />
          ) : (
            <img
              src={cfg.image ?? "assets/body/front.jpg"}
              alt={BODY_ALT[props.view]}
              draggable={false}
              className="body-img"
            />
          )}
          {visiblePoints.map((point) => {
            const at = coordOf(point, bodyType);
            return (
              <div
                key={point.id}
                className={["hotspot", point.color, snapped === point.id ? "active-point" : ""].join(" ")}
                style={{
                  left: `${at.x * 100}%`,
                  top: `${at.y * 100}%`,
                  display: props.showPoints || snapped === point.id ? "flex" : "none",
                }}
              >
                <span className="ring" />
                <span className="dot" />
                {props.showLabels && props.showPoints && !hideTags && !strict && (
                  <span className={`tag ${point.tagSide} ${snapped === point.id ? "tag--lifted" : ""}`}>{point.label}</span>
                )}
              </div>
            );
          })}
          {/* T228: ses iletim tüpü katmanı — gövde ve hotspot'ların üstünde,
              göğüs parçasının altında. Sürükleme/dokunma/klavye davranışına
              dokunmaz (pointer-events yok, erişilebilirlik ağacı dışı). */}
          <svg
            className="tube-layer"
            viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              ref={(node) => {
                tubeRef.current = node;
              }}
              className="tube-line"
              fill="none"
              stroke="#1f2b38"
              strokeWidth={7}
              strokeLinecap="round"
            />
            <path
              ref={(node) => {
                tubeShineRef.current = node;
              }}
              className="tube-shine"
              fill="none"
              stroke="#8ba0b3"
              strokeWidth={2.4}
              strokeLinecap="round"
              opacity={0.45}
              transform="translate(-1.4 -1.4)"
            />
            {(() => {
              const size = { w: box.w || 0, h: box.h || 0 };
              const at = tubeAnchor(size);
              const k = tubeHeadsetHeight(size) / 100;
              return (
                <g className="tube-fork" transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) scale(${k.toFixed(3)})`}>
                  {/* Gerçek oranlı kulaklık (birim yükseklik 100): Y-parça lastik kolları,
                      metal kulak boruları, yay köprüsü ve kulak uçları. */}
                  <path d="M 0 0 L -12 -26 M 0 0 L 12 -26" fill="none" stroke="#1f2b38" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d="M -12 -26 C -20 -50 -34 -78 -26 -95 M 12 -26 C 20 -50 34 -78 26 -95" fill="none" stroke="#98a6b3" strokeWidth={4.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d="M -12 -26 C -20 -50 -34 -78 -26 -95 M 12 -26 C 20 -50 34 -78 26 -95" fill="none" stroke="#eef1f4" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} vectorEffect="non-scaling-stroke" />
                  <path d="M -17 -40 Q 0 -44 17 -40" fill="none" stroke="#7d8b98" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <ellipse cx={-23} cy={-97} rx={6.5} ry={4.6} transform="rotate(-25 -23 -97)" fill="#2b3642" />
                  <ellipse cx={23} cy={-97} rx={6.5} ry={4.6} transform="rotate(25 23 -97)" fill="#2b3642" />
                  <rect x={-5} y={-6} width={10} height={12} rx={3} fill="#3d4854" />
                </g>
              );
            })()}
          </svg>
          <div
            ref={(node) => {
              stethRef.current = node;
            }}
            className={`steth ${snapped ? "snap-ok placed" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            role="button"
            aria-label="Stetoskop göğüs parçası — sürükleyerek veya ok tuşlarıyla oskültasyon bölgesine taşıyın, Enter/Space ile yerleştirin"
            tabIndex={0}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <span className="contact-pulse" key={pulseKey} />
            <Chestpiece />
          </div>
          {!snapped && !playing && visiblePoints.length > 0 && (
            <div className="dwell-hint">Stetoskopu oskültasyon bölgesine sürükleyin</div>
          )}
          {visiblePoints.length === 0 && (
            <div className="dwell-hint">
              Bu görünümde bu içerik için işaretli oskültasyon bölgesi yok — diğer görünümü kullanın.
            </div>
          )}
          {strict && snapped && spentNotice && (
            <div className="dwell-hint">Bu bölge için dinleme hakkı kullanıldı — manuel muayenede tek dinleme kuralı.</div>
          )}
          {audioStatus?.status === "loading" && <div className="dwell-hint">Ses hazırlanıyor…</div>}
          {audioStatus?.status === "error" && (
            <div className="dwell-hint dwell-error" role="alert">
              Ses yüklenemedi. Bağlantınızı kontrol edip bölgeyi yeniden dinleyin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

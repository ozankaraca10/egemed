/// <reference lib="dom" />
/**
 * Pulse runtime'ını (`vendor/`, ADR-011 ile platform kaynağı) platform içinde
 * çalıştırır.
 *
 * Betikler bir gölge DOM kökünde çalışır. Platforma uyarlanan yalnız sınırlardır:
 * - DOM: `document.getElementById/querySelector*` gölge köke, `body` /
 *   `documentElement` köke ait sarmalayıcılara yönlenir; CSS gölge kökte kalır.
 * - Olaylar: `cardai:*`, `pulse:*`, `pagehide`, `pageshow` bağlama özel bir veri
 *   yolunda kalır; gerçek `document`/`window` dinleyicileri izlenir ve `target`
 *   gölge kök içindeki gerçek hedefe döndürülür (retarget).
 * - Kayıt: `localStorage` kullanıcıya özel ad alanıyla önekleniyor (PULSE-08).
 * - Yaşam döngüsü: zamanlayıcı, rAF, ResizeObserver, AudioContext ve
 *   dinleyiciler dispose'da temizlenir; öncesinde kaynak kendi `pagehide`
 *   yoluyla durumu kaydeder.
 */
import { gamiUiStyles } from "@egemed/gami-ui";
import type { PulseScriptEnv } from "./env";
import runApp from "./vendor/app.js";
import runCurriculum from "./vendor/curriculum.js";
import runFeatures from "./vendor/features.js";
import runLanding from "./vendor/landing.js";
import markup from "./vendor/markup.js";
import runModel from "./vendor/model.js";
import runPersistence from "./vendor/persistence.js";
import runState from "./vendor/state.js";
import styles from "./vendor/styles.js";

/** index.html sırası (BUILD.md): model → kalıcılık → curriculum → state → app → features → landing. */
const SCRIPTS: readonly (readonly [string, (env: PulseScriptEnv) => void])[] = [
  ["model", runModel],
  ["persistence", runPersistence],
  ["curriculum", runCurriculum],
  ["state", runState],
  ["app", runApp],
  ["features", runFeatures],
  ["landing", runLanding],
];

/** Bağlama özel kalan olaylar; diğerleri gerçek window'a izlenerek bağlanır. */
const LOCAL_WINDOW_EVENTS = new Set(["pagehide", "pageshow"]);
const isLocalWindowEvent = (type: string): boolean =>
  type.startsWith("cardai:") || type.startsWith("pulse:") || LOCAL_WINDOW_EVENTS.has(type);

/** Kabuğa ve platform kayıt katmanına açılan köprü. */
export interface PulseRuntimeBridge {
  /** `cardai:*` ve `pulse:*` olayları (ör. `cardai:session`, `pulse:learn-complete`). */
  onEvent?(type: string, detail: unknown): void;
}

export interface PulseRuntimeOptions {
  /** `/sims/pulse/` gibi; sonda `/` olmalı. */
  readonly assetBase: string;
  /** Kullanıcıya özel önek, ör. `egemed:u:<actorId>:`. Boş olamaz. */
  readonly storageNamespace: string;
  readonly storage: Storage;
  readonly bridge?: PulseRuntimeBridge;
  /** Ad alanında yoksa yazılan kaynak tercihleri (ör. gömülü modda kapalı tam ekran önerisi). */
  readonly defaultPreferences?: Readonly<Record<string, string>>;
  /**
   * Birleşik bar (UX kararı, 25 Eylül 2026): true ise kaynağın üst çubukları ve
   * footer'ı gizlenir; kontroller kabuğun barına taşınır (`chrome.ts`).
   */
  readonly unifiedChrome?: boolean;
  /**
   * T213: host kaydına göre öğrenme başka cihazda tamamlanmış
   * (`context.learn.complete`). true ise kaynağın `derive()` kapısı vaka/sınav
   * kilidini açar (`window.__pulseLearnComplete`); yerel izlenme kaydı değişmez.
   */
  readonly learnComplete?: boolean;
  /**
   * A3.3: sunucu vaka/sınav oturumu köprüsü (ADR-009). Verilirse kaynak
   * maddeleri `window.__pulseServerItems`ten okur; yoksa kaynak kanalsız sürer
   * (kabuk kanalsız kurulumda kartları kapatır).
   */
  readonly serverItems?: unknown;
}

export interface PulseRuntimeHandle {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  /** Kullanıcı×sim ad alanlı kayıt; platform ekleri (oyunlaştırma) de bunu kullanır. */
  readonly storage: Storage;
  /** Kaynak `window.*` API'leri (CardAIController, CardAIScorm …); testler ve köprü için. */
  global(name: string): unknown;
  /** Gölge pencerede bir global yazar (ör. `__pulseServerResults`). */
  setGlobal(name: string, value: unknown): void;
  /** Gölge pencerede olay yayınlar; köprüye `cardai:*`/`pulse:*` iletilir. */
  emit(type: string, detail: unknown): void;
  dispose(): void;
}

type Listener = EventListenerOrEventListenerObject;
interface TrackedListener {
  readonly target: EventTarget;
  readonly type: string;
  readonly original: Listener;
  readonly wrapper: EventListener;
  readonly capture: boolean;
}

function captureOf(options: boolean | AddEventListenerOptions | undefined): boolean {
  return typeof options === "boolean" ? options : options?.capture === true;
}

/** Gölge kökten çıkan olayın `target`ını kökteki gerçek hedefe döndürür. */
function retarget(event: Event): Event {
  const inner = event.composedPath()[0];
  if (inner === undefined || inner === event.target) return event;
  return new Proxy(event, {
    get(target, prop) {
      if (prop === "target") return inner;
      const value: unknown = Reflect.get(target, prop);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

function namespacedStorage(storage: Storage, prefix: string): Storage {
  const ownKeys = (): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key.slice(prefix.length));
    }
    return keys;
  };
  return {
    get length() {
      return ownKeys().length;
    },
    clear: () => {
      for (const key of ownKeys()) storage.removeItem(prefix + key);
    },
    getItem: (key) => storage.getItem(prefix + key),
    key: (index) => ownKeys()[index] ?? null,
    removeItem: (key) => storage.removeItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
  };
}

export function mountPulseRuntime(target: HTMLElement, options: PulseRuntimeOptions): PulseRuntimeHandle {
  if (options.storageNamespace.length === 0) throw new Error("Pulse: kullanıcı kayıt ad alanı zorunlu.");
  const realWindow = window;
  const realDocument = document;
  let disposed = false;

  // --- Gölge kök ve kaynak işaretlemesi -------------------------------------
  const host = realDocument.createElement("div");
  host.className = options.unifiedChrome === true ? "egemed-pulse-runtime pulse-unified" : "egemed-pulse-runtime";
  host.style.display = "block";
  host.style.position = "relative";
  const shadow = host.attachShadow({ mode: "open" });
  const style = realDocument.createElement("style");
  style.textContent = `${styles}\n${gamiUiStyles}\n${EMBED_CSS}`;
  const htmlEl = realDocument.createElement("div");
  htmlEl.className = "pulse-html";
  const bodyEl = realDocument.createElement("div");
  bodyEl.className = "pulse-body";
  bodyEl.innerHTML = markup.split("__PULSE_ASSET_BASE__").join(options.assetBase);
  htmlEl.append(bodyEl);
  // Tam ekran daima belge düzeyinde (26 Eyl 2026 kararı): kaynağın
  // `document.documentElement.requestFullscreen()` çağrısı sim kökünü değil
  // sayfayı büyütür; böylece platformun birleşik üst barı tam ekranda da kalır.
  htmlEl.requestFullscreen = (fsOptions?: FullscreenOptions) => realDocument.documentElement.requestFullscreen(fsOptions);
  shadow.append(style, htmlEl);
  target.appendChild(host);
  const top = host.getBoundingClientRect().top + realWindow.scrollY;
  host.style.setProperty("--pulse-vh", `calc(100dvh - ${Math.max(0, Math.round(top))}px)`);

  // Kaynak içi `#…` bağlantıları kabuk yönlendiricisini değiştirmemeli.
  shadow.addEventListener(
    "click",
    (event) => {
      const origin = event.composedPath()[0];
      if (origin instanceof Element && origin.closest('a[href^="#"]')) event.preventDefault();
    },
    true,
  );

  // --- İzlenen kaynaklar ------------------------------------------------------
  const listeners: TrackedListener[] = [];
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const observers = new Set<ResizeObserver>();
  const audioContexts = new Set<AudioContext>();
  const bus = new EventTarget();
  const local: Record<PropertyKey, unknown> = {
    __pulseAssetBase: options.assetBase,
    // T213: host tamamlaması `derive()` kilit kararında VEYA'lanır; bayrak
    // yoksa (ziyaretçi/kanalsız) kilit yerel izlenme kaydına göre kalır.
    __pulseLearnComplete: options.learnComplete === true,
    // A3.3: sunucu oturumu köprüsü (varsa) madde önbelleğini buradan okur.
    ...(options.serverItems === undefined ? {} : { __pulseServerItems: options.serverItems }),
  };

  const addTracked = (
    realTarget: EventTarget,
    self: unknown,
    type: string,
    original: Listener | null,
    opts?: boolean | AddEventListenerOptions,
  ): void => {
    if (original === null) return;
    const capture = captureOf(opts);
    if (listeners.some((l) => l.target === realTarget && l.type === type && l.original === original && l.capture === capture)) return;
    const wrapper: EventListener = (event) => {
      if (disposed) return;
      const view = retarget(event);
      if (typeof original === "function") original.call(self, view);
      else original.handleEvent(view);
    };
    listeners.push({ capture, original, target: realTarget, type, wrapper });
    realTarget.addEventListener(type, wrapper, opts);
  };
  const removeTracked = (realTarget: EventTarget, type: string, original: Listener | null, opts?: boolean | EventListenerOptions): void => {
    const capture = typeof opts === "boolean" ? opts : opts?.capture === true;
    const index = listeners.findIndex((l) => l.target === realTarget && l.type === type && l.original === original && l.capture === capture);
    if (index < 0) return;
    const [entry] = listeners.splice(index, 1);
    if (entry) realTarget.removeEventListener(type, entry.wrapper, capture);
  };

  const timers = {
    setTimeout: ((handler: TimerHandler, ms?: number, ...args: unknown[]): number => {
      const id = realWindow.setTimeout(() => {
        timeouts.delete(id);
        if (!disposed && typeof handler === "function") (handler as (...a: unknown[]) => void)(...args);
      }, ms);
      timeouts.add(id);
      return id;
    }) as typeof setTimeout,
    clearTimeout: ((id?: number) => {
      if (id === undefined) return;
      timeouts.delete(id);
      realWindow.clearTimeout(id);
    }) as typeof clearTimeout,
    setInterval: ((handler: TimerHandler, ms?: number, ...args: unknown[]): number => {
      const id = realWindow.setInterval(() => {
        if (!disposed && typeof handler === "function") (handler as (...a: unknown[]) => void)(...args);
      }, ms);
      intervals.add(id);
      return id;
    }) as typeof setInterval,
    clearInterval: ((id?: number) => {
      if (id === undefined) return;
      intervals.delete(id);
      realWindow.clearInterval(id);
    }) as typeof clearInterval,
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      const id = realWindow.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!disposed) callback(time);
      });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame: (id: number): void => {
      frames.delete(id);
      realWindow.cancelAnimationFrame(id);
    },
  };

  const RealResizeObserver = realWindow.ResizeObserver;
  class TrackedResizeObserver extends RealResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        if (!disposed) callback(entries, observer);
      });
      observers.add(this);
    }
  }

  const RealAudioContext = realWindow.AudioContext as typeof AudioContext | undefined;
  const TrackedAudioContext =
    RealAudioContext === undefined
      ? undefined
      : class extends RealAudioContext {
          constructor(options?: AudioContextOptions) {
            super(options);
            audioContexts.add(this);
          }
        };

  const storage = namespacedStorage(options.storage, options.storageNamespace);
  for (const [key, value] of Object.entries(options.defaultPreferences ?? {})) {
    try {
      if (storage.getItem(key) === null) storage.setItem(key, value);
    } catch {
      // Depolama kapalıysa kaynak kendi varsayılanıyla sürer.
    }
  }

  // --- Gölge document ----------------------------------------------------------
  const doc: Document = new Proxy(realDocument, {
    get(realDoc, prop) {
      switch (prop) {
        case "getElementById":
          return (id: string) => shadow.getElementById(id);
        case "querySelector":
          return (selector: string) => shadow.querySelector(selector);
        case "querySelectorAll":
          return (selector: string) => shadow.querySelectorAll(selector);
        case "body":
          return bodyEl;
        case "documentElement":
          return htmlEl;
        case "activeElement":
          return shadow.activeElement;
        case "fullscreenElement":
        case "webkitFullscreenElement":
          return realDoc.fullscreenElement === null ? null : htmlEl;
        case "addEventListener":
          return (type: string, fn: Listener | null, opts?: boolean | AddEventListenerOptions) =>
            addTracked(realDoc, doc, type, fn, opts);
        case "removeEventListener":
          return (type: string, fn: Listener | null, opts?: boolean | EventListenerOptions) =>
            removeTracked(realDoc, type, fn, opts);
        default: {
          const value: unknown = Reflect.get(realDoc, prop);
          return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(realDoc) : value;
        }
      }
    },
  });

  // --- Gölge window ------------------------------------------------------------
  const win: Window = new Proxy(realWindow, {
    get(realWin, prop) {
      if (Object.prototype.hasOwnProperty.call(local, prop)) return local[prop];
      switch (prop) {
        case "window":
        case "self":
        case "globalThis":
        case "parent":
        case "top":
          return win;
        case "opener":
          return null;
        case "document":
          return doc;
        case "localStorage":
          return storage;
        case "ResizeObserver":
          return TrackedResizeObserver;
        case "AudioContext":
        case "webkitAudioContext":
          return TrackedAudioContext;
        case "addEventListener":
          return (type: string, fn: Listener | null, opts?: boolean | AddEventListenerOptions) => {
            if (isLocalWindowEvent(type)) bus.addEventListener(type, fn, opts);
            else addTracked(realWin, win, type, fn, opts);
          };
        case "removeEventListener":
          return (type: string, fn: Listener | null, opts?: boolean | EventListenerOptions) => {
            if (isLocalWindowEvent(type)) bus.removeEventListener(type, fn, opts);
            else removeTracked(realWin, type, fn, opts);
          };
        case "dispatchEvent":
          return (event: Event) => {
            // `pulse:*` (ör. T208 `pulse:learn-complete`) platform köprüsüne
            // `cardai:*` ile aynı yoldan iletilir; T213 bu olayı
            // `markComplete`e bağlar (`learn.ts`).
            if (event.type.startsWith("cardai:") || event.type.startsWith("pulse:")) {
              options.bridge?.onEvent?.(event.type, (event as CustomEvent<unknown>).detail);
            }
            return bus.dispatchEvent(event);
          };
        default:
          if (prop in timers) return timers[prop as keyof typeof timers];
          {
            const value: unknown = Reflect.get(realWin, prop);
            return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(realWin) : value;
          }
      }
    },
    set(_realWin, prop, value: unknown) {
      local[prop] = value;
      return true;
    },
    has(realWin, prop) {
      return Object.prototype.hasOwnProperty.call(local, prop) || prop in realWin;
    },
  });

  const handle: PulseRuntimeHandle = {
    host,
    shadow,
    storage,
    global: (name) => local[name],
    setGlobal(name, value) {
      local[name] = value;
    },
    emit(type, detail) {
      // Gölge penceredeki `dispatchEvent` ile aynı yol: olay yerel veri yolunda
      // yayınlanır ve `cardai:*`/`pulse:*` köprüye iletilir.
      if (type.startsWith("cardai:") || type.startsWith("pulse:")) options.bridge?.onEvent?.(type, detail);
      bus.dispatchEvent(new CustomEvent(type, { detail }));
    },
    dispose() {
      if (disposed) return;
      // Kaynak kendi kayıt yolunu çalıştırsın (app.js / persistence.js `pagehide`).
      try {
        bus.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
      } catch {
        // Kayıt hatası kaynakta raporlanır; temizlik yine de sürer.
      }
      disposed = true;
      for (const id of timeouts) realWindow.clearTimeout(id);
      for (const id of intervals) realWindow.clearInterval(id);
      for (const id of frames) realWindow.cancelAnimationFrame(id);
      for (const observer of observers) observer.disconnect();
      for (const context of audioContexts) void context.close().catch(() => undefined);
      for (const entry of listeners.splice(0)) entry.target.removeEventListener(entry.type, entry.wrapper, entry.capture);
      if (realDocument.fullscreenElement !== null) void realDocument.exitFullscreen().catch(() => undefined);
      shadow.querySelectorAll("dialog[open]").forEach((dialog) => (dialog as HTMLDialogElement).close());
      timeouts.clear();
      intervals.clear();
      frames.clear();
      observers.clear();
      audioContexts.clear();
      host.remove();
    },
  };

  try {
    for (const [, run] of SCRIPTS) {
      run({
        window: win,
        document: doc,
        localStorage: storage,
        ...timers,
        ResizeObserver: TrackedResizeObserver,
        CardAIModel: local["CardAIModel"],
        CardAIScorm: local["CardAIScorm"],
        PulseCurriculum: local["PulseCurriculum"],
        PulseState: local["PulseState"],
      });
    }
  } catch (error) {
    handle.dispose();
    throw error;
  }
  return handle;
}

/**
 * Gömülü mod: kaynak tam ekran bir uygulama olarak yazıldı. Kabuk üst barının
 * altında kalması için `position: fixed` landing ve ekran yüksekliği kabuk
 * alanına indirgenir (`--pulse-vh`, mount'ta ölçülür).
 */
export const EMBED_CSS = `
:host{display:block;position:relative;min-height:var(--pulse-vh,100dvh)}
.pulse-html,.pulse-body{min-height:var(--pulse-vh,100dvh)}
.landing{position:absolute;min-height:var(--pulse-vh,100dvh)}
.transport,.case-toolbar{bottom:calc(8px + var(--pulse-bottom-inset,0px))}
.landing{overflow-y:auto}
/* PULSE-10: kaynak yeşili (#16a34a) açık zeminde ve beyaz metinle WCAG AA altında
   (≈3.1–3.3:1); token koyulaştırılır (#15803d ≈ 4.8–5:1). */
:host{--green-600:#15803d}
.live-badge{min-height:44px}
/* PULSE-10: WCAG AA renk karşıtlığı — kaynak token'ları koyulaştırılır.
   --ink-500 (#5f7ba6) beyazda 4.31:1; #536d95 beyazda 5.3:1, açık mavi
   zeminlerde (--bg-grad-a) ≥4.6:1 — .ds-card dt, .stage-id, notlar.
   --blue-500 (#2e8df7) beyaz metinle 3.35:1; #0c6fdc beyaz metinle 4.9:1
   (.btn.primary: #caseContinue, #caseCheck). */
:host{--ink-500:#536d95}
:host{--blue-500:#0c6fdc}
/* PULSE-10: 44 px dokunma hedefi (AGENTS); kaynak düğme/select/input
   yükseklikleri 27–38 px. Onay kutusu/radyo dışarıda: kutuyu büyütmek katman
   menüsünü kalbin üzerine taşır (kalan kayıtlar özette gerekçeli). */
:host .pulse-html button,:host .pulse-html select,:host .pulse-html input:not([type=checkbox]):not([type=radio]){min-height:44px}
:host .pulse-html .tool-btn,:host .pulse-html .lead-chip,:host .pulse-html .panel-focus,:host .pulse-html .icon-btn{min-inline-size:44px}
/* PULSE-10: katman onay kutuları WCAG 2.2 hedef boyutu (24 px). */
.layer-menu input[type=checkbox],#labelsToggle{inline-size:24px;block-size:24px}
/* Kaynakta 1x1 gizli radyo (opacity:0); ölçülen dokunma hedefi 44 px olur,
   görünür boyut değişmez (etiket tıklaması zaten düğmeyi işaretler). */
:host .pulse-html .opt input[type=radio]{inline-size:44px;block-size:44px}
/* PULSE-10: dar ekranda rapor tablosu yatay kaydırma yerine kaba sığar
   (scrollable-region-focusable: klavyeyle kaydırılamayan bölge). */
.report-table-v2{min-width:min(520px,100%)}
/* Birleşik barda adım göstergesi bardadır; içerikteki kopya çizilmez. */
:host(.pulse-unified) .stepper{display:none!important}
:host(.pulse-unified) .topbar,:host(.pulse-unified) .app>.eg-footer,:host(.pulse-unified) .landing{display:none!important}
:host(.pulse-unified){min-height:calc(var(--pulse-vh,100dvh) - 2.5625rem)}
:host(.pulse-unified) .pulse-html,:host(.pulse-unified) .pulse-body{min-height:calc(var(--pulse-vh,100dvh) - 2.5625rem)}
:host(.pulse-unified) .app:has(#modesView:not([hidden])){height:calc(var(--pulse-vh,100dvh) - 2.5625rem)}
.app:has(#modesView:not([hidden])){min-height:0}
.app:has(#modesView:not([hidden])) main{min-height:0;overflow:auto}
@media(min-width:721px){.app:has(#modesView:not([hidden])){display:flex;flex-direction:column}.app:has(#modesView:not([hidden])) main{flex:1}}
/* T289: mod seçimi ortak dört modlu yolculuktur (@egemed/gami-ui); kaynak kart stilleri kaldırıldı. */
.modes-view{display:flex;flex-direction:column;justify-content:safe center;width:100%;max-width:none;min-height:100%;padding:0}
@media(max-width:720px){:host(.pulse-unified) .app:has(#modesView:not([hidden])){height:auto;min-height:calc(var(--pulse-vh,100dvh) - 2.5625rem)}}
/* T139 (kullanıcı kararı, 25 Eylül 2026): tam ekran yalnız birleşik bardaki ikondan; oynatma
   çubuğundaki ikinci "↗ Tam ekran" düğmesi çizilmez (panel büyütme ↗ düğmeleri tam ekran değildir, kalır). */
:host(.pulse-unified) #transportFullscreen{display:none!important}
`;

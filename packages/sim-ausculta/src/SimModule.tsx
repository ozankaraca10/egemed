import { SESSION_AUDIO_PREFIX } from "./core/serverSession";
import { createElement, type ReactNode } from "react";
import { createRoot as reactCreateRoot } from "react-dom/client";
import type { SimChrome, SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import { App, type AuscultaAudio } from "./App";
import { createAudioEngine, type AbortSignalLike, type AudioBufferLike, type AudioContextLike, type AudioEngine, type AudioEngineDeps } from "./audio/engine";
import type { WindowLike } from "./core/lifecycle";
import { initialState, type StoragePort } from "./core/reducer";
import { createNoopRuntimeAdapter, type RuntimeAdapter } from "./core/runtime";
import { auscultaStorageNamespace, namespacedStoragePort } from "./core/storage";
import { StoreProvider } from "./core/StoreProvider";
import type { LearnScreenEnv } from "./screens/LearnScreen";
import type { ResultsScreenEnv } from "./screens/ResultsScreen";
import type { SimulationScreenEnv } from "./screens/simulation/runtime";
import type { ModalEnv } from "./ui/modal-env";
import { createNoopFullscreenEnv, type FullscreenEnv } from "./ui/chrome";
import { createBrowserStageEnv, StageEnvProvider, type StageEnv } from "./ui/PatientStage";

/** Platform varlık tabanı. Göreli ses yolları bu önekle çözülür. */
export const DEFAULT_AUSCULTA_ASSET_BASE = "/sims/ausculta/";

/** React kök sözleşmesi — testler DOM'suz double enjekte eder. */
export interface AuscultaRoot {
  render(tree: ReactNode): void;
  unmount(): void;
}

/** Mount kapsayıcısı: `node` hosta eklenir, `remove` dispose'ta idempotent çağrılır. */
export interface AuscultaContainer {
  readonly node: unknown;
  remove(): void;
}

export interface AuscultaEngineFactory {
  (options: { readonly assetBase: string; readonly now: () => number }): AuscultaAudio;
}

export interface AuscultaModuleDeps {
  readonly createContainer: () => AuscultaContainer;
  readonly createRoot: (node: unknown) => AuscultaRoot;
  readonly storage: StoragePort;
  readonly env: WindowLike;
  readonly runtime?: RuntimeAdapter;
  readonly assetBase?: string;
  readonly createEngine?: AuscultaEngineFactory;
  readonly scrollToTop?: () => void;
  readonly learnEnv?: LearnScreenEnv;
  readonly simulationEnv?: SimulationScreenEnv;
  readonly modalEnv?: ModalEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly fullscreenEnv?: FullscreenEnv;
  readonly stageEnv?: StageEnv;
}

/** A1: sunucu oturum ses adresleri bu önekle işaretlenir; varlık tabanına eklenmeden aynen kullanılır. */

export function resolveAuscultaAssetUrl(assetBase: string, path: string): string {
  if (path.startsWith(SESSION_AUDIO_PREFIX)) return path.slice(SESSION_AUDIO_PREFIX.length);
  if (/^https?:\/\//i.test(path)) return path;
  const base = assetBase.endsWith("/") ? assetBase : `${assetBase}/`;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`;
}

function createProductionContainer(): AuscultaContainer {
  const doc = (globalThis as unknown as { document: { createElement(tag: string): { className: string; remove(): void } } })
    .document;
  const el = doc.createElement("div");
  el.className = "eg-sim-ausculta";
  return {
    node: el,
    remove() {
      el.remove();
    },
  };
}

function createProductionRoot(node: unknown): AuscultaRoot {
  const root = reactCreateRoot(node as Parameters<typeof reactCreateRoot>[0]);
  return {
    render(tree) {
      root.render(tree);
    },
    unmount() {
      root.unmount();
    },
  };
}

function browserWindow(): WindowLike {
  const win = globalThis as unknown as {
    addEventListener(type: string, handler: () => void): void;
    removeEventListener(type: string, handler: () => void): void;
    setTimeout(handler: () => void, timeoutMs: number): number;
    clearTimeout(handle: number): void;
    document: { readonly visibilityState: "hidden" | "visible" };
    scrollTo?(x: number, y: number): void;
  };
  return {
    addEventListener: (type, handler) => win.addEventListener(type, handler),
    removeEventListener: (type, handler) => win.removeEventListener(type, handler),
    setTimeout: (handler, timeoutMs) => win.setTimeout(handler, timeoutMs),
    clearTimeout: (handle) => win.clearTimeout(handle),
    get visibilityState() {
      return win.document.visibilityState;
    },
  };
}

function browserStorage(): StoragePort {
  const storage = (globalThis as unknown as {
    localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  }).localStorage;
  return {
    get(key) {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage?.setItem(key, value);
      } catch {
        /* depolama dolu veya erişim engelli */
      }
    },
  };
}

/** Motorun iptal sinyali tarayıcı `fetch`'inin kabul ettiği gerçek AbortSignal'a çevrilir. */
function toFetchInit(init: Parameters<AudioEngineDeps["fetchImpl"]>[1]): Parameters<AudioEngineDeps["fetchImpl"]>[1] {
  const Ctor = (globalThis as unknown as { AbortController?: new () => { signal: AbortSignalLike; abort(): void } }).AbortController;
  if (!Ctor) return init;
  const controller = new Ctor();
  init.signal.addEventListener("abort", () => controller.abort());
  return { cache: init.cache, signal: controller.signal };
}

function productionEngine(assetBase: string, now: () => number): AudioEngine {
  const host = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
    fetch: AudioEngineDeps["fetchImpl"];
  };
  return createAudioEngine({
    createContext: () => {
      const Ctor = host.AudioContext ?? host.webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext yok");
      return new Ctor();
    },
    fetchImpl: (url, init) => host.fetch(resolveAuscultaAssetUrl(assetBase, url), toFetchInit(init)),
    decodeAudioData: (ctx, data, signal) => {
      if (signal.aborted) {
        const error = new Error("audio cancelled");
        error.name = "AbortError";
        return Promise.reject(error);
      }
      const decoding = ctx as AudioContextLike & { decodeAudioData(buffer: ArrayBuffer): Promise<AudioBufferLike> };
      return decoding.decodeAudioData(data);
    },
    now,
  });
}

function browserFullscreenEnv(): FullscreenEnv {
  const doc = (globalThis as { document?: {
    readonly fullscreenElement: unknown;
    readonly documentElement?: { requestFullscreen?: () => void };
    exitFullscreen?: () => void;
    addEventListener(type: string, handler: () => void): void;
    removeEventListener(type: string, handler: () => void): void;
  } }).document;
  if (!doc) return createNoopFullscreenEnv();
  return {
    get fullscreenElement() {
      return doc.fullscreenElement;
    },
    requestFullscreen() {
      doc.documentElement?.requestFullscreen?.();
    },
    exitFullscreen() {
      doc.exitFullscreen?.();
    },
    addEventListener(type, handler) {
      doc.addEventListener(type, handler);
    },
    removeEventListener(type, handler) {
      doc.removeEventListener(type, handler);
    },
  };
}

function defaultProductionDeps(): AuscultaModuleDeps {
  const win = globalThis as unknown as { scrollTo?(x: number, y: number): void };
  return {
    createContainer: createProductionContainer,
    createRoot: createProductionRoot,
    storage: browserStorage(),
    env: browserWindow(),
    runtime: createNoopRuntimeAdapter(),
    assetBase: DEFAULT_AUSCULTA_ASSET_BASE,
    scrollToTop: () => win.scrollTo?.(0, 0),
    fullscreenEnv: browserFullscreenEnv(),
    stageEnv: createBrowserStageEnv(),
  };
}

/** SimHost adaptörü: mount başına ses motoru; dispose motoru kapatır. */
export function createAuscultaModule(deps?: AuscultaModuleDeps): SimModule {
  return {
    id: "ausculta",
    mount(target: SimMountTarget, context: SimMountContext): SimDispose {
      const resolved = deps ?? defaultProductionDeps();
      const assetBase = resolved.assetBase ?? DEFAULT_AUSCULTA_ASSET_BASE;
      const storage = namespacedStoragePort(resolved.storage, auscultaStorageNamespace(context.actorId));
      const engine = resolved.createEngine?.({ assetBase, now: context.now }) ?? productionEngine(assetBase, context.now);
      const container = resolved.createContainer();
      target.appendChild(container.node);
      const root = resolved.createRoot(container.node);

      const hostChrome = context.setChrome;
      let chromeOpen = true;
      const setChrome = hostChrome
        ? (chrome: SimChrome | null) => {
            if (chromeOpen) hostChrome(chrome);
          }
        : undefined;
      const appProps = {
        embedded: true as const,
        audio: engine,
        ...(setChrome === undefined ? {} : { setChrome }),
        ...(resolved.fullscreenEnv ? { fullscreenEnv: resolved.fullscreenEnv } : {}),
        ...(resolved.scrollToTop ? { scrollToTop: resolved.scrollToTop } : {}),
        ...(resolved.learnEnv ? { learnEnv: resolved.learnEnv } : {}),
        ...(resolved.simulationEnv ? { simulationEnv: resolved.simulationEnv } : {}),
        ...(resolved.modalEnv ? { modalEnv: resolved.modalEnv } : {}),
        ...(resolved.resultsEnv ? { resultsEnv: resolved.resultsEnv } : {}),
        ...(context.reportAttempt === undefined ? {} : { reportAttempt: context.reportAttempt }),
        ...(context.gamification === undefined ? {} : { gamification: context.gamification }),
        ...(context.audience === undefined ? {} : { audience: context.audience }),
        ...(context.requestSignIn === undefined ? {} : { requestSignIn: context.requestSignIn }),
        ...(context.sessions === undefined ? {} : { sessions: context.sessions }),
        ...(context.learn === undefined ? {} : { learn: context.learn }),
        ...(context.challengeId === undefined ? {} : { challengeId: context.challengeId }),
        ...(context.onChallengeFinished === undefined ? {} : { onChallengeFinished: context.onChallengeFinished }),
      };

      const store = createElement(StoreProvider, {
        now: context.now,
        storage,
        runtime: resolved.runtime ?? createNoopRuntimeAdapter(),
        env: resolved.env,
        initialState: { ...initialState, screen: "modes" },
        children: createElement(App, appProps),
      });
      root.render(resolved.stageEnv ? createElement(StageEnvProvider, { env: resolved.stageEnv }, store) : store);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        chromeOpen = false;
        hostChrome?.(null);
        root.unmount();
        engine.dispose();
        container.remove();
      };
    },
  };
}

export const auscultaModule: SimModule = createAuscultaModule();

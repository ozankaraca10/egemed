import { createElement, type ReactNode } from "react";
import { createRoot as reactCreateRoot } from "react-dom/client";
import type { SimChrome, SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import { audienceOf } from "@egemed/sim-host";
import { App } from "./App";
import { StoreProvider } from "./core/StoreProvider";
import { DEFAULT_ASSET_BASE, resetAssetBase, setAssetBase } from "./core/images";
import { initialState } from "./core/reducer";
import type { WindowLike } from "./core/lifecycle";
import type { StoragePort } from "./core/reducer";
import type { RuntimeAdapter } from "./core/runtime";
import { createNoopRuntimeAdapter } from "./core/runtime";
import { createBrowserOpacaBindings, createNamespacedStoragePort, opacaStorageNamespace } from "./platform-deps";
import { bindGamiStorage } from "./gamification/storage";
import type { ChromeEnv } from "./ui/chrome";
import type { ModalEnv } from "./ui/modal-env";
import type { LearnScreenEnv } from "./screens/LearnScreen";
import type { ResultsScreenEnv } from "./screens/ResultsScreen";
import type { StartScreenEnv } from "./screens/StartScreen";
import type { OpacaAttemptRecord } from "./gamification/attempt";
import type { GamiRepository } from "@egemed/gamification-core";
import { GamiProvider, bindGamiRepository } from "./gamification/GamiContext";

/** React kök sözleşmesi — testler DOM'suz double enjekte eder. */
export interface OpacaRoot {
  render(tree: ReactNode): void;
  unmount(): void;
}

/** Mount kapsayıcısı: `node` hosta eklenir, `remove` dispose'ta idempotent çağrılır. */
export interface OpacaContainer {
  readonly node: unknown;
  remove(): void;
}

export interface OpacaModuleDeps {
  readonly createContainer: () => OpacaContainer;
  readonly createRoot: (node: unknown) => OpacaRoot;
  readonly storage: StoragePort;
  readonly env: WindowLike;
  readonly runtime?: RuntimeAdapter;
  readonly assetBase?: string;
  readonly chromeEnv?: ChromeEnv;
  readonly modalEnv?: ModalEnv;
  readonly startEnv?: StartScreenEnv;
  readonly learnEnv?: LearnScreenEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly gamiEnabled?: boolean;
  readonly gamiRepository?: GamiRepository<OpacaAttemptRecord>;
  readonly devBuild?: boolean;
}

function isDevBuild(): boolean {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

function createProductionContainer(): OpacaContainer {
  const doc = (globalThis as unknown as { document: { createElement(tag: string): { className: string; remove(): void } } })
    .document;
  const el = doc.createElement("div");
  el.className = "eg-sim-opaca";
  return {
    node: el,
    remove() {
      el.remove();
    },
  };
}

function createProductionRoot(node: unknown): OpacaRoot {
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

function defaultProductionDeps(): OpacaModuleDeps {
  const win = (globalThis as unknown as { window: Parameters<typeof createBrowserOpacaBindings>[0] }).window;
  const bindings = createBrowserOpacaBindings(win, createNoopRuntimeAdapter(), isDevBuild());
  return {
    createContainer: createProductionContainer,
    createRoot: createProductionRoot,
    storage: bindings.storage,
    env: bindings.env,
    runtime: bindings.runtime,
    assetBase: DEFAULT_ASSET_BASE,
    chromeEnv: bindings.chromeEnv,
    modalEnv: bindings.modalEnv,
    startEnv: bindings.startEnv,
    learnEnv: bindings.learnEnv,
    resultsEnv: bindings.resultsEnv,
    devBuild: isDevBuild(),
  };
}

/** SimHost adaptörü: mount → React ağacı; dispose → unmount + kapsayıcı kaldırma (E2 §8 S19). */
export function createOpacaModule(deps?: OpacaModuleDeps): SimModule {
  return {
    id: "opaca",
    mount(target: SimMountTarget, context: SimMountContext): SimDispose {
      const resolved = deps ?? defaultProductionDeps();
      const previousBase = setAssetBase(resolved.assetBase ?? DEFAULT_ASSET_BASE);
      // T93: tüm yerel kayıtlar (durum, oyunlaştırma, tercih) actorId ad alanıyla
      // okunur/yazılır; öneksiz eski kayıtlar yeni ad alanına taşınmaz.
      const storage = createNamespacedStoragePort(resolved.storage, opacaStorageNamespace(context.actorId));
      bindGamiStorage(storage);
      const container = resolved.createContainer();
      target.appendChild(container.node);

      const root = resolved.createRoot(container.node);
      const showDevPanel = Boolean(resolved.devBuild && resolved.chromeEnv?.devQuery);

      const hostChrome = context.setChrome;
      let chromeOpen = true;
      const setChrome = hostChrome
        ? (chrome: SimChrome | null) => {
            if (chromeOpen) hostChrome(chrome);
          }
        : undefined;
      // T175: kitle (öğrenci/öğretim üyesi/ziyaretçi) sözleşmesi — oyunlaştırma yüzeyleri
      // App içinde audience'a göre indirgenir (tek kaynak); burada yalnız deneme raporlama
      // öğrenci dışına kapatılır (depo sahibi kararı, plan.md).
      const audience = audienceOf(context);
      const forwardReportAttempt = audience === "student" ? context.reportAttempt : undefined;
      const appProps = {
        embedded: true as const,
        gamiEnabled: resolved.gamiEnabled ?? true,
        audience,
        showDevPanel,
        devBuild: Boolean(resolved.devBuild),
        ...(setChrome === undefined ? {} : { setChrome }),
        ...(context.requestSignIn === undefined ? {} : { requestSignIn: context.requestSignIn }),
        ...(resolved.chromeEnv ? { chromeEnv: resolved.chromeEnv } : {}),
        ...(resolved.modalEnv ? { modalEnv: resolved.modalEnv } : {}),
        ...(resolved.startEnv ? { startEnv: resolved.startEnv } : {}),
        ...(resolved.learnEnv ? { learnEnv: resolved.learnEnv } : {}),
        ...(resolved.resultsEnv ? { resultsEnv: resolved.resultsEnv } : {}),
        // A2.3: sunucu vaka oturumu ve düello bağlamı App'e (dolayısıyla ekranlara) geçer.
        ...(context.sessions === undefined ? {} : { sessions: context.sessions }),
        ...(context.challengeId === undefined ? {} : { challengeId: context.challengeId }),
        ...(context.onChallengeFinished === undefined ? {} : { onChallengeFinished: context.onChallengeFinished }),
      };

      root.render(
        createElement(GamiProvider, {
          repository: resolved.gamiRepository ?? null,
          now: context.now,
          ...(forwardReportAttempt === undefined
            ? {}
            : { reportAttempt: (attempt: OpacaAttemptRecord) => forwardReportAttempt?.(attempt) }),
          ...(context.gamification === undefined ? {} : { gamification: context.gamification }),
          children: createElement(StoreProvider, {
            now: context.now,
            storage,
            runtime: resolved.runtime ?? createNoopRuntimeAdapter(),
            env: resolved.env,
            initialState: { ...initialState, screen: "modes" },
            children: createElement(App, appProps),
          }),
        }),
      );

      bindGamiRepository(resolved.gamiRepository ?? null);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        chromeOpen = false;
        hostChrome?.(null);
        bindGamiRepository(null);
        bindGamiStorage(null);
        root.unmount();
        container.remove();
        resetAssetBase(previousBase);
      };
    },
  };
}

export const opacaModule: SimModule = createOpacaModule();

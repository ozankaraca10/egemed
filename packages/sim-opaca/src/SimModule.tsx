import { createElement, type ReactNode } from "react";
import { createRoot as reactCreateRoot } from "react-dom/client";
import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import { App } from "./App";
import { StoreProvider } from "./core/StoreProvider";
import { DEFAULT_ASSET_BASE, resetAssetBase, setAssetBase } from "./core/images";
import { initialState } from "./core/reducer";
import type { WindowLike } from "./core/lifecycle";
import type { StoragePort } from "./core/reducer";
import type { RuntimeAdapter } from "./core/runtime";
import { createNoopRuntimeAdapter } from "./core/runtime";
import { createBrowserOpacaBindings } from "./platform-deps";
import type { ChromeEnv } from "./ui/chrome";
import type { ModalEnv } from "./ui/modal-env";
import type { LearnScreenEnv } from "./screens/LearnScreen";
import type { ResultsScreenEnv } from "./screens/ResultsScreen";
import type { StartScreenEnv } from "./screens/StartScreen";
import type { SimulationPopoverEnv } from "./screens/SimulationScreen";

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
  readonly popoverEnv?: SimulationPopoverEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly gamiEnabled?: boolean;
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
    popoverEnv: bindings.popoverEnv,
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
      const container = resolved.createContainer();
      target.appendChild(container.node);

      const root = resolved.createRoot(container.node);
      const showDevPanel = Boolean(resolved.devBuild && resolved.chromeEnv?.devQuery);

      const appProps = {
        embedded: true as const,
        gamiEnabled: resolved.gamiEnabled ?? true,
        showDevPanel,
        devBuild: Boolean(resolved.devBuild),
        ...(resolved.chromeEnv ? { chromeEnv: resolved.chromeEnv } : {}),
        ...(resolved.modalEnv ? { modalEnv: resolved.modalEnv } : {}),
        ...(resolved.startEnv ? { startEnv: resolved.startEnv } : {}),
        ...(resolved.learnEnv ? { learnEnv: resolved.learnEnv } : {}),
        ...(resolved.popoverEnv ? { popoverEnv: resolved.popoverEnv } : {}),
        ...(resolved.resultsEnv ? { resultsEnv: resolved.resultsEnv } : {}),
      };

      root.render(
        createElement(StoreProvider, {
          now: context.now,
          storage: resolved.storage,
          runtime: resolved.runtime ?? createNoopRuntimeAdapter(),
          env: resolved.env,
          initialState: { ...initialState, screen: "modes" },
          children: createElement(App, appProps),
        }),
      );

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        root.unmount();
        container.remove();
        resetAssetBase(previousBase);
      };
    },
  };
}

export const opacaModule: SimModule = createOpacaModule();

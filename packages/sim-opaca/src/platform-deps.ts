import type { WindowLike } from "./core/lifecycle";
import type { StoragePort } from "./core/reducer";
import type { RuntimeAdapter } from "./core/runtime";
import { createNoopRuntimeAdapter } from "./core/runtime";
import type { ChromeEnv, ChromeKeyEvent } from "./ui/chrome";
import type { ModalEnv, ModalFocusable, ModalKeyEvent } from "./ui/modal-env";
import type { LearnScreenEnv } from "./screens/LearnScreen";
import type { ResultsScreenEnv } from "./screens/ResultsScreen";
import type { StartScreenEnv } from "./screens/StartScreen";
import type { SimulationPopoverEnv, SimulationPopoverEvent } from "./screens/SimulationScreen";

/** Tarayıcı `localStorage` yüzeyini `StoragePort`'a bağlar; erişim hatalarında sessiz kalır. */
export function createLocalStoragePort(
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void },
): StoragePort {
  return {
    get(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // Depolama dolu veya erişim engelli — kaynak davranışıyla uyumlu sessiz yutma.
      }
    },
  };
}

/** Kayıt ad alanı: kullanıcı×sim (PULSE-08 deseni, T93). Anahtara yalnız actorId
 *  girer; ad/e-posta girmez. Anonim oturumun kaydı hesaba aktarılmaz. */
export function opacaStorageNamespace(actorId: string | undefined): string {
  return actorId === undefined || actorId.length === 0
    ? "egemed:anon:opaca:"
    : `egemed:u:${encodeURIComponent(actorId)}:opaca:`;
}

/** Port'u ad alanıyla sarmalar: tüm okuma/yazma anahtarları önekle gider.
 *  Mount sırasında `context.actorId` ile kurulur (T93); eski öneksiz kayıtlar
 *  yeni ad alanına taşınmaz. */
export function createNamespacedStoragePort(port: StoragePort, prefix: string): StoragePort {
  return {
    get(key) {
      return port.get(prefix + key);
    },
    set(key, value) {
      port.set(prefix + key, value);
    },
  };
}

/** `window` + `document` vekillerinden yaşam döngüsü zamanlayıcı yüzeyi. */
export function createBrowserWindowLike(win: {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(handle: number): void;
  readonly document: { readonly visibilityState: "hidden" | "visible" };
}): WindowLike {
  return {
    addEventListener: (type, handler) => win.addEventListener(type, handler),
    removeEventListener: (type, handler) => win.removeEventListener(type, handler),
    setTimeout: (handler, timeoutMs) => win.setTimeout(handler, timeoutMs),
    clearTimeout: (handle) => win.clearTimeout(handle),
    visibilityState: win.document.visibilityState,
  };
}

function chromeKeyFromEvent(event: {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly target: unknown;
  preventDefault(): void;
}): ChromeKeyEvent {
  const target = event.target as { readonly tagName?: string; readonly isContentEditable?: boolean } | null;
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    target:
      target && typeof target.tagName === "string"
        ? { tagName: target.tagName, isContentEditable: Boolean(target.isContentEditable) }
        : null,
    preventDefault: () => event.preventDefault(),
  };
}

/** Üst bar tam ekran/klavye sınırı (kaynak `document`/`window`). */
export function createBrowserChromeEnv(doc: {
  addEventListener(type: string, handler: (...args: never[]) => void): void;
  removeEventListener(type: string, handler: (...args: never[]) => void): void;
  readonly fullscreenElement: unknown;
  querySelector(selector: string): unknown;
}, win: {
  readonly location: { readonly search: string };
  requestFullscreen?(): void;
  exitFullscreen?(): void;
}, devBuild = false): ChromeEnv {
  const keydownWrappers = new Map<(event: ChromeKeyEvent) => void, (event: Event) => void>();
  return {
    addEventListener(type, handler) {
      if (type === "keydown") {
        const keyHandler = handler as (event: ChromeKeyEvent) => void;
        const wrapped = (event: Event) => keyHandler(chromeKeyFromEvent(event as never));
        keydownWrappers.set(keyHandler, wrapped);
        doc.addEventListener(type, wrapped as (...args: never[]) => void);
        return;
      }
      doc.addEventListener(type, handler as (...args: never[]) => void);
    },
    removeEventListener(type, handler) {
      if (type === "keydown") {
        const keyHandler = handler as (event: ChromeKeyEvent) => void;
        const wrapped = keydownWrappers.get(keyHandler);
        if (wrapped) doc.removeEventListener(type, wrapped as (...args: never[]) => void);
        keydownWrappers.delete(keyHandler);
        return;
      }
      doc.removeEventListener(type, handler as (...args: never[]) => void);
    },
    get fullscreenElement() {
      return doc.fullscreenElement;
    },
    requestFullscreen: () => {
      win.requestFullscreen?.();
    },
    exitFullscreen: () => {
      win.exitFullscreen?.();
    },
    hasOpenModal: () => doc.querySelector(".modal-overlay") !== null,
    devBuild,
    devQuery: win.location.search.includes("dev=1"),
  };
}

/** Modal odak/Esc sınırı (kaynak `document`). */
export function createBrowserModalEnv(doc: {
  readonly activeElement: unknown;
  addEventListener(type: string, handler: (...args: never[]) => void): void;
  removeEventListener(type: string, handler: (...args: never[]) => void): void;
  querySelectorAll(selector: string): unknown;
}): ModalEnv {
  return {
    get activeElement(): ModalFocusable | null {
      const el = doc.activeElement as ModalFocusable | null;
      return el && typeof el.focus === "function" ? el : null;
    },
    addEventListener(type, handler) {
      doc.addEventListener(type, (event) => handler(event as ModalKeyEvent));
    },
    removeEventListener(type, handler) {
      doc.removeEventListener(type, (event) => handler(event as ModalKeyEvent));
    },
    queryFocusables(root, selector) {
      const node = root as { querySelectorAll(sel: string): Iterable<unknown> };
      return [...node.querySelectorAll(selector)].filter(
        (el): el is ModalFocusable => typeof (el as ModalFocusable).focus === "function",
      );
    },
  };
}

export function createBrowserStartScreenEnv(chrome: ChromeEnv, doc: { readonly fullscreenEnabled?: boolean }): StartScreenEnv {
  return { ...chrome, fullscreenEnabled: doc.fullscreenEnabled ?? true };
}

export function createBrowserLearnScreenEnv(doc: { querySelector(selector: string): unknown }): LearnScreenEnv {
  return {
    scrollActiveLibraryItem() {
      const el = doc.querySelector(".lib-item.active") as { scrollIntoView?(opts: { block: string }): void } | null;
      el?.scrollIntoView?.({ block: "nearest" });
    },
  };
}

export function createBrowserSimulationPopoverEnv(doc: {
  addEventListener(type: string, handler: (...args: never[]) => void): void;
  removeEventListener(type: string, handler: (...args: never[]) => void): void;
  contains?(node: unknown): boolean;
}): SimulationPopoverEnv {
  return {
    addEventListener(type, handler) {
      doc.addEventListener(type, (event) => handler(event as SimulationPopoverEvent));
    },
    removeEventListener(type, handler) {
      doc.removeEventListener(type, (event) => handler(event as SimulationPopoverEvent));
    },
    containsNode(root, target) {
      const node = root as { contains?(child: unknown): boolean };
      return node.contains?.(target) ?? doc.contains?.(target) ?? false;
    },
  };
}

export function createBrowserResultsScreenEnv(win: { close(): void }): ResultsScreenEnv {
  return { lmsAttached: false, requestClose: () => win.close() };
}

/** Üretim mount'u için tek noktada tarayıcı vekilleri. */
export interface BrowserOpacaBindings {
  readonly storage: StoragePort;
  readonly env: WindowLike;
  readonly runtime: RuntimeAdapter;
  readonly chromeEnv: ChromeEnv;
  readonly modalEnv: ModalEnv;
  readonly startEnv: StartScreenEnv;
  readonly learnEnv: LearnScreenEnv;
  readonly popoverEnv: SimulationPopoverEnv;
  readonly resultsEnv: ResultsScreenEnv;
}

export function createBrowserOpacaBindings(
  win: {
    localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
    document: {
      readonly fullscreenEnabled?: boolean;
      readonly visibilityState: "hidden" | "visible";
      readonly activeElement: unknown;
      readonly fullscreenElement: unknown;
      addEventListener(type: string, handler: (...args: never[]) => void): void;
      removeEventListener(type: string, handler: (...args: never[]) => void): void;
      querySelector(selector: string): unknown;
      querySelectorAll(selector: string): unknown;
      contains?(node: unknown): boolean;
    };
    addEventListener(type: string, handler: () => void): void;
    removeEventListener(type: string, handler: () => void): void;
    setTimeout(handler: () => void, timeoutMs: number): number;
    clearTimeout(handle: number): void;
    readonly location: { readonly search: string };
    requestFullscreen?(): void;
    exitFullscreen?(): void;
    close(): void;
  },
  runtime: RuntimeAdapter = createNoopRuntimeAdapter(),
  devBuild = false,
): BrowserOpacaBindings {
  const doc = win.document;
  const chromeEnv = createBrowserChromeEnv(doc as never, win, devBuild);
  return {
    storage: createLocalStoragePort(win.localStorage),
    env: createBrowserWindowLike(win),
    runtime,
    chromeEnv,
    modalEnv: createBrowserModalEnv(doc as never),
    startEnv: createBrowserStartScreenEnv(chromeEnv, doc),
    learnEnv: createBrowserLearnScreenEnv(doc),
    popoverEnv: createBrowserSimulationPopoverEnv(doc as never),
    resultsEnv: createBrowserResultsScreenEnv(win),
  };
}

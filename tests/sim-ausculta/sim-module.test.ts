import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimChrome, SimMountContext, SimMountTarget } from "../../packages/sim-host/src/SimHost";
import {
  DEFAULT_AUSCULTA_ASSET_BASE,
  EmbeddedProvider,
  ScreenHeading,
  auscultaModule,
  createAuscultaModule,
  resolveAuscultaAssetUrl,
} from "../../packages/sim-ausculta/src/index";
import type { AuscultaAudio, AuscultaContainer, AuscultaModuleDeps, AuscultaRoot } from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** SimHost adaptörü — DOM kütüphanesi yok; kök double enjekte edilir. */

const NOW = 1_728_000_000_000;
const CONTEXT: SimMountContext = { simId: "ausculta", now: () => NOW };

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

interface FakeNode {
  parent: FakeTarget | null;
  removed: boolean;
  rendered: boolean;
  tree: ReactNode | null;
}

interface FakeTarget extends SimMountTarget {
  children: FakeNode[];
}

function stubAudio(disposed: { count: number; closed: number }): AuscultaAudio {
  return {
    play: async () => undefined,
    replay: async () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    getActive: () => null,
    ensureContext: async () => ({
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        frequency: { value: 0 },
        type: "",
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      }),
      createGain: () => ({
        gain: { value: 0, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
        connect: () => undefined,
      }),
    }),
    dispose() {
      disposed.count += 1;
      disposed.closed += 1;
    },
  };
}

function createTestDeps(overrides: Partial<AuscultaModuleDeps> = {}): {
  deps: AuscultaModuleDeps;
  disposed: { count: number; closed: number };
} {
  const disposed = { count: 0, closed: 0 };
  const createContainer = (): AuscultaContainer => {
    const node: FakeNode = { parent: null, removed: false, rendered: false, tree: null };
    return {
      node,
      remove() {
        if (node.removed) return;
        node.removed = true;
        if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
      },
    };
  };
  const createRoot = (node: unknown): AuscultaRoot => ({
    render(tree) {
      const fake = node as FakeNode;
      fake.rendered = true;
      fake.tree = tree;
    },
    unmount() {
      const fake = node as FakeNode;
      fake.rendered = false;
      fake.tree = null;
    },
  });
  return {
    disposed,
    deps: {
      createContainer,
      createRoot,
      storage: memoryStorage(),
      env: inertWindow,
      assetBase: DEFAULT_AUSCULTA_ASSET_BASE,
      createEngine: () => stubAudio(disposed),
      ...overrides,
    },
  };
}

function fakeTarget(): FakeTarget {
  const target: FakeTarget = {
    children: [],
    appendChild(node) {
      const child = node as FakeNode;
      child.parent = target;
      target.children.push(child);
      return node;
    },
  };
  return target;
}

describe("createAuscultaModule (SimHost adaptörü)", () => {
  it("modül kimliği ausculta ve varsayılan dışa aktarım aynı sözleşmeyi kullanır", () => {
    expect(createAuscultaModule().id).toBe("ausculta");
    expect(auscultaModule.id).toBe("ausculta");
    expect(DEFAULT_AUSCULTA_ASSET_BASE).toBe("/sims/ausculta/");
    expect(resolveAuscultaAssetUrl("/sims/ausculta/", "assets/audio/runtime/heart/f_n_rc.wav")).toBe(
      "/sims/ausculta/assets/audio/runtime/heart/f_n_rc.wav",
    );
  });

  it("ScreenHeading bağımsız modda h1 çizer", () => {
    const html = renderToStaticMarkup(createElement(ScreenHeading, { className: "mode-title", children: "Başlık" }));
    expect(html).toMatch(/^<h1\b[^>]*class="mode-title"[^>]*>/);
    expect(html).toContain("Başlık");
    const embedded = renderToStaticMarkup(
      createElement(EmbeddedProvider, {
        embedded: true,
        children: createElement(ScreenHeading, { className: "mode-title", children: "Başlık" }),
      }),
    );
    expect(embedded).toMatch(/^<h2\b[^>]*class="mode-title"[^>]*>/);
    expect(embedded).toContain("Başlık");
  });

  it("öğretim üyesi kitlesinde birleşik bardan İlerlemem eylemi çıkarılır", async () => {
    const { deps } = createTestDeps();
    const target = fakeTarget();
    const sent: Array<SimChrome | null> = [];
    createAuscultaModule(deps).mount(target, {
      ...CONTEXT,
      audience: "faculty",
      setChrome: (chrome) => {
        sent.push(chrome);
      },
    });
    renderToStaticMarkup(target.children[0]?.tree as ReactNode);
    await Promise.resolve();
    expect(sent.at(-1)?.actions?.map((action) => action.id)).toEqual(["fullscreen", "help", "about"]);
  });

  it("ziyaretçi kitlesinde mod seçiminde kilit şeridi ve kilitli kart CTA'ları görünür", async () => {
    const { deps } = createTestDeps();
    const target = fakeTarget();
    createAuscultaModule(deps).mount(target, { ...CONTEXT, audience: "visitor" });
    await Promise.resolve();
    const html = renderToStaticMarkup(target.children[0]?.tree as ReactNode);
    expect(html).toContain("Ziyaretçi modu");
    expect(html).toContain("Öğrenci girişi");
    expect(html).toContain("data-audience-locked=\"true\"");
    expect(html).toContain("Bu mod yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır.");
  });
});

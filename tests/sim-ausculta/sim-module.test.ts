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
    setMuted: () => undefined,
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

  it("mount → dispose → remount yaşam döngüsünü tamamlar", () => {
    const { deps } = createTestDeps();
    const module = createAuscultaModule(deps);
    const target = fakeTarget();

    const dispose1 = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.rendered).toBe(true);

    dispose1();
    expect(target.children).toHaveLength(0);

    const dispose2 = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.rendered).toBe(true);
    dispose2();
    expect(target.children).toHaveLength(0);
  });

  it("çift dispose idempotent kalır ve ses motorunu bir kez kapatır", () => {
    const { deps, disposed } = createTestDeps();
    const module = createAuscultaModule(deps);
    const target = fakeTarget();
    const dispose = module.mount(target, CONTEXT);
    const child = target.children[0];

    dispose();
    dispose();
    dispose();

    expect(child?.removed).toBe(true);
    expect(target.children).toHaveLength(0);
    expect(disposed.count).toBe(1);
    expect(disposed.closed).toBe(1);
  });

  it("gömülü ağaçta tanıtım atlanır, üst bar yoktur ve başlık h2'dir", () => {
    const { deps } = createTestDeps();
    const target = fakeTarget();
    const dispose = createAuscultaModule(deps).mount(target, CONTEXT);
    const tree = target.children[0]?.tree;
    const html = renderToStaticMarkup(tree as ReactNode);
    expect(html).toContain("Çalışma Modunu Seçin");
    expect(html).not.toContain("Simülatörü başlat");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).toContain('<h2 class="mode-title">Çalışma Modunu Seçin</h2>');
    expect(html).not.toContain("<h1");
    dispose();
    expect(target.children).toHaveLength(0);
  });

  it("ScreenHeading bağımsız modda h1 çizer", () => {
    const html = renderToStaticMarkup(createElement(ScreenHeading, { className: "mode-title", children: "Başlık" }));
    expect(html).toBe('<h1 class="mode-title">Başlık</h1>');
    const embedded = renderToStaticMarkup(
      createElement(EmbeddedProvider, {
        embedded: true,
        children: createElement(ScreenHeading, { className: "mode-title", children: "Başlık" }),
      }),
    );
    expect(embedded).toBe('<h2 class="mode-title">Başlık</h2>');
  });

  it("setChrome varken adımı ve eylemleri gönderir, araç çubuğu ile adım göstergesini çizmez", async () => {
    const { deps } = createTestDeps();
    const target = fakeTarget();
    const sent: Array<SimChrome | null> = [];
    const dispose = createAuscultaModule(deps).mount(target, {
      ...CONTEXT,
      setChrome: (chrome) => {
        sent.push(chrome);
      },
    });
    const html = renderToStaticMarkup(target.children[0]?.tree as ReactNode);
    await Promise.resolve();
    expect(html).not.toContain("eg-sim-toolbar");
    expect(html).not.toContain('class="stepper"');
    const chrome = sent.at(-1);
    expect(chrome?.steps).toEqual({ current: 0, labels: ["Mod seçimi", "Çalışma", "Tamamla"] });
    expect(chrome?.actions?.map((action) => action.id)).toEqual(["progress", "fullscreen", "sound", "help"]);
    dispose();
    expect(sent.at(-1)).toBeNull();
  });
});

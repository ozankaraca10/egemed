import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimChrome, SimMountContext, SimMountTarget } from "../../packages/sim-host/src/SimHost";
import type { GamiRepository } from "../../packages/gamification-core/src/repository";
import type { OpacaAttemptRecord } from "../../packages/sim-opaca/src/gamification/attempt";
import {
  DEFAULT_ASSET_BASE,
  createMemoryRuntimeAdapter,
  createOpacaModule,
  opacaModule,
  resolveAssetUrl,
  setAssetBase,
} from "../../packages/sim-opaca/src/index";
import type { OpacaContainer, OpacaModuleDeps, OpacaRoot } from "../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-opaca/src/index";

const NOW = 1_728_000_000_000;
const CONTEXT: SimMountContext = { simId: "opaca", now: () => NOW };

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
}

interface FakeTarget extends SimMountTarget {
  children: FakeNode[];
}

function createTestDeps(overrides: Partial<OpacaModuleDeps> = {}): OpacaModuleDeps {
  const unmounts: string[] = [];
  const createContainer = (): OpacaContainer => {
    const node: FakeNode = { parent: null, removed: false, rendered: false };
    return {
      node,
      remove() {
        if (node.removed) return;
        node.removed = true;
        if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
      },
    };
  };
  const createRoot = (node: unknown): OpacaRoot => ({
    render() {
      (node as FakeNode).rendered = true;
    },
    unmount() {
      (node as FakeNode).rendered = false;
      unmounts.push("unmount");
    },
  });
  return {
    createContainer,
    createRoot,
    storage: memoryStorage(),
    env: inertWindow,
    runtime: createMemoryRuntimeAdapter(),
    assetBase: DEFAULT_ASSET_BASE,
    devBuild: false,
    ...overrides,
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

describe("createOpacaModule (SimHost adaptörü)", () => {
  it("modül kimliği opaca ve varsayılan dışa aktarım aynı örneği kullanır", () => {
    expect(createOpacaModule().id).toBe("opaca");
    expect(opacaModule.id).toBe("opaca");
  });

  it("mount → dispose → remount yaşam döngüsünü tamamlar", () => {
    const deps = createTestDeps();
    const module = createOpacaModule(deps);
    const target = fakeTarget();

    const dispose1 = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.rendered).toBe(true);

    dispose1();
    expect(target.children).toHaveLength(0);
    expect(target.children[0]?.removed).toBeUndefined();

    const dispose2 = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.rendered).toBe(true);
    dispose2();
    expect(target.children).toHaveLength(0);
  });

  it("çift dispose idempotent; kök kaldırıldıktan sonra tekrar remove çağrılmaz", () => {
    const deps = createTestDeps();
    const module = createOpacaModule(deps);
    const target = fakeTarget();
    const dispose = module.mount(target, CONTEXT);
    const child = target.children[0];
    expect(child).toBeDefined();

    dispose();
    expect(child?.removed).toBe(true);
    expect(target.children).toHaveLength(0);

    dispose();
    dispose();
    expect(target.children).toHaveLength(0);
  });

  it("mount başına varlık taban yolunu ayarlar ve dispose sonrası geri alır", () => {
    setAssetBase("/onceki/");
    const deps = createTestDeps({ assetBase: "/test/opaca/" });
    const module = createOpacaModule(deps);
    const dispose = module.mount(fakeTarget(), CONTEXT);
    expect(resolveAssetUrl("assets/xray/runtime/demo.webp")).toBe("/test/opaca/assets/xray/runtime/demo.webp");
    expect(resolveAssetUrl("/assets/brand/logo.png")).toBe("/test/opaca/assets/brand/logo.png");
    dispose();
    expect(resolveAssetUrl("brand/logo.png")).toBe("/onceki/brand/logo.png");
    setAssetBase("/sims/opaca/");
  });

  it("DOM'suz double ile StoreProvider + App ağacını render eder", () => {
    const rendered: unknown[] = [];
    const deps = createTestDeps({
      createRoot: () => ({
        render(tree) {
          rendered.push(tree);
        },
        unmount() {
          rendered.length = 0;
        },
      }),
    });
    const dispose = createOpacaModule(deps).mount(fakeTarget(), CONTEXT);
    expect(rendered).toHaveLength(1);
    const provider = rendered[0] as { type: unknown; props: { children: { props: { children: { props: { embedded: boolean } } } } } };
    expect(provider.props.children.props.children.props.embedded).toBe(true);
    dispose();
    expect(rendered).toHaveLength(0);
  });

  it("gamiRepository enjekte edilince mount/dispose ile bağlanır", () => {
    const apiRepo: GamiRepository<OpacaAttemptRecord> = {
      getMe: async () => ({ id: "me", displayName: null, public: true, cohort: null }),
      updateMe: async () => undefined,
      recordAttempt: async () => undefined,
      recordLearn: async () => undefined,
      listAttempts: async () => [],
      getLeaderboard: async (_period, _cohort, now) => ({
        period: "week" as const,
        cohort: "all" as const,
        generatedAt: now.toISOString(),
        isDemo: false,
        rows: [],
      }),
      getMonthlyReward: async () => null,
      getRewardWinners: async () => [],
    };
    const deps = createTestDeps({ gamiRepository: apiRepo });
    const dispose = createOpacaModule(deps).mount(fakeTarget(), CONTEXT);
    dispose();
    expect(createOpacaModule(deps).id).toBe("opaca");
  });

  it("setChrome varken adımı ve eylemleri gönderir, araç çubuğu ile adım göstergesini çizmez", async () => {
    let tree: ReactNode = null;
    const sent: Array<SimChrome | null> = [];
    const deps = createTestDeps({
      createRoot: () => ({
        render(next) {
          tree = next;
        },
        unmount() {
          tree = null;
        },
      }),
    });
    const dispose = createOpacaModule(deps).mount(fakeTarget(), {
      ...CONTEXT,
      setChrome: (chrome) => {
        sent.push(chrome);
      },
    });
    const html = renderToStaticMarkup(tree);
    await Promise.resolve();
    expect(html).not.toContain("eg-sim-toolbar");
    expect(html).not.toContain('class="stepper"');
    const chrome = sent.at(-1);
    expect(chrome?.steps?.current).toBe(0);
    expect(chrome?.steps?.labels).toEqual(["Mod seçimi", "Çalışma", "Tamamla"]);
    // T183: kabuk yalnız tamamlanan adımlar için çağırır; sim, adım 0 dışındaki indeksleri
    // (ileri adım/geçersiz) sessizce yok sayar — burada çağrıldığında hata fırlatmaz.
    expect(typeof chrome?.steps?.onSelect).toBe("function");
    expect(() => chrome?.steps?.onSelect?.(1)).not.toThrow();
    expect(() => chrome?.steps?.onSelect?.(0)).not.toThrow();
    expect(chrome?.actions?.map((action) => action.id)).toEqual(["progress", "fullscreen", "help"]);
    dispose();
    expect(sent.at(-1)).toBeNull();
  });

  it("T218: learn kanalı App'e taşınır: host complete ise mod kartları açılır; kanal yoksa kilitli", async () => {
    let tree: ReactNode = null;
    const deps = createTestDeps({
      createRoot: () => ({
        render(next) {
          tree = next;
        },
        unmount() {
          tree = null;
        },
      }),
    });
    const calls: string[] = [];
    const dispose = createOpacaModule(deps).mount(fakeTarget(), {
      ...CONTEXT,
      learn: {
        complete: true,
        async markComplete(version: string): Promise<void> {
          calls.push(version);
        },
      },
    });
    await Promise.resolve();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(calls).toEqual([]);
    dispose();

    let lockedTree: ReactNode = null;
    const lockedDeps = createTestDeps({
      createRoot: () => ({
        render(next) {
          lockedTree = next;
        },
        unmount() {
          lockedTree = null;
        },
      }),
    });
    createOpacaModule(lockedDeps).mount(fakeTarget(), CONTEXT);
    await Promise.resolve();
    const lockedHtml = renderToStaticMarkup(lockedTree);
    expect(lockedHtml).toContain('data-learn-locked="true"');
    expect(lockedHtml).toContain("Önce öğrenme modunu tamamlayın: 0/33 konu açıldı.");
  });

  it("T175: audience='faculty' — App'e audience geçer, reportAttempt iletilmez (App gamiEnabled'ı kendi indirger)", () => {
    let tree: ReactNode = null;
    const reported: unknown[] = [];
    const deps = createTestDeps({
      createRoot: () => ({
        render(next) {
          tree = next;
        },
        unmount() {
          tree = null;
        },
      }),
    });
    const dispose = createOpacaModule(deps).mount(fakeTarget(), {
      ...CONTEXT,
      audience: "faculty",
      reportAttempt: (attempt) => reported.push(attempt),
    });
    const provider = tree as unknown as {
      props: { reportAttempt?: unknown; children: { props: { children: { props: { audience: string } } } } };
    };
    expect(provider.props.reportAttempt).toBeUndefined();
    expect(provider.props.children.props.children.props.audience).toBe("faculty");
    dispose();
  });

  it("T175: audience='visitor' — App'e audience + requestSignIn geçer, reportAttempt iletilmez", () => {
    let tree: ReactNode = null;
    const deps = createTestDeps({
      createRoot: () => ({
        render(next) {
          tree = next;
        },
        unmount() {
          tree = null;
        },
      }),
    });
    const requestSignIn = () => undefined;
    const dispose = createOpacaModule(deps).mount(fakeTarget(), {
      ...CONTEXT,
      audience: "visitor",
      requestSignIn,
    });
    const provider = tree as unknown as {
      props: { reportAttempt?: unknown; children: { props: { children: { props: { audience: string; requestSignIn?: unknown } } } } };
    };
    expect(provider.props.reportAttempt).toBeUndefined();
    expect(provider.props.children.props.children.props.audience).toBe("visitor");
    expect(provider.props.children.props.children.props.requestSignIn).toBe(requestSignIn);
    dispose();
  });

  it("T175: audience yok/'student' — davranış geriye uyumlu (reportAttempt iletilir)", () => {
    let tree: ReactNode = null;
    const reported: unknown[] = [];
    const deps = createTestDeps({
      createRoot: () => ({
        render(next) {
          tree = next;
        },
        unmount() {
          tree = null;
        },
      }),
    });
    const dispose = createOpacaModule(deps).mount(fakeTarget(), {
      ...CONTEXT,
      reportAttempt: (attempt) => reported.push(attempt),
    });
    const provider = tree as unknown as {
      props: { reportAttempt?: unknown; children: { props: { children: { props: { gamiEnabled: boolean; audience: string } } } } };
    };
    expect(typeof provider.props.reportAttempt).toBe("function");
    expect(provider.props.children.props.children.props.gamiEnabled).toBe(true);
    expect(provider.props.children.props.children.props.audience).toBe("student");
    dispose();
  });
});

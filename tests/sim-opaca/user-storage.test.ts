import { beforeEach, describe, expect, it } from "vitest";
import type { SimMountContext, SimMountTarget } from "../../packages/sim-host/src/SimHost";
import {
  DEFAULT_ASSET_BASE,
  createMemoryRuntimeAdapter,
  createNamespacedStoragePort,
  createOpacaModule,
  opacaStorageNamespace,
} from "../../packages/sim-opaca/src/index";
import type { OpacaModuleDeps, OpacaRoot, StoragePort, WindowLike } from "../../packages/sim-opaca/src/index";
import { bindGamiStorage, emptyState, loadState, saveState, STORAGE_KEY } from "../../packages/sim-opaca/src/gamification/storage";
import { resetGamiRepo } from "../../packages/sim-opaca/src/gamification/repo";
import { installMemoryStorage } from "./gamification/helpers";

/** T93 — yerel kayıtların kullanıcıya ayrılması (PULSE-08 deseni, Opaca).
 *  Mount `context.actorId` ile tüm StoragePort anahtarlarını ad alanına alır;
 *  öneksiz eski kayıtlar yeni ad alanına taşınmaz. Emsal: pulse runtime. */

const NOW = 1_728_000_000_000;
const CONTEXT: SimMountContext = { simId: "opaca", now: () => NOW };
const CONTEXT_ADMIN: SimMountContext = { simId: "opaca", now: () => NOW, actorId: "dev-admin-0001" };
const ADMIN_NS = "egemed:u:dev-admin-0001:opaca:";

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function probePort(entries: Map<string, string>): StoragePort {
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

interface FakeNode {
  parent: FakeTarget | null;
  removed: boolean;
  rendered: boolean;
}

interface FakeTarget extends SimMountTarget {
  children: FakeNode[];
}

/** Depoyu kaydeden render double'ı; mount sonrası StoreProvider portunu okunur kılar. */
function depsWithCapture(
  entries: Map<string, string>,
  trees: unknown[],
): OpacaModuleDeps {
  return {
    createContainer: () => {
      const node: FakeNode = { parent: null, removed: false, rendered: false };
      return {
        node,
        remove() {
          node.removed = true;
          if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
        },
      };
    },
    createRoot: (): OpacaRoot => ({
      render(tree) {
        trees.push(tree);
      },
      unmount() {
        trees.length = 0;
      },
    }),
    storage: probePort(entries),
    env: inertWindow,
    runtime: createMemoryRuntimeAdapter(),
    assetBase: DEFAULT_ASSET_BASE,
    devBuild: false,
  };
}

function providerStorageOf(trees: unknown[]): StoragePort {
  const provider = trees[0] as { props: { children: { props: { storage: StoragePort } } } };
  return provider.props.children.props.storage;
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

describe("opacaStorageNamespace (T93)", () => {
  it("actorId varsa kullanıcı ad alanı; yalnız actorId anahtara girer", () => {
    expect(opacaStorageNamespace("dev-admin-0001")).toBe("egemed:u:dev-admin-0001:opaca:");
  });

  it("actorId yoksa/boşsa anonim ad alanı", () => {
    expect(opacaStorageNamespace(undefined)).toBe("egemed:anon:opaca:");
    expect(opacaStorageNamespace("")).toBe("egemed:anon:opaca:");
  });

  it("actorId kodlanır; ad/e-posta ham hâliyle girmez", () => {
    expect(opacaStorageNamespace("öğrenci 1/a:b")).toBe(
      `egemed:u:${encodeURIComponent("öğrenci 1/a:b")}:opaca:`,
    );
    expect(opacaStorageNamespace("öğrenci 1/a:b")).not.toContain("öğrenci");
  });
});

describe("createNamespacedStoragePort (T93)", () => {
  it("okuma ve yazma önekle gider; öneksiz anahtar oluşmaz", () => {
    const entries = new Map<string, string>();
    const ns = createNamespacedStoragePort(probePort(entries), "egemed:u:u1:opaca:");
    expect(ns.get("opaca.bestScore")).toBeNull();
    ns.set("opaca.bestScore", '{"practice":77,"assessment":0}');
    expect(entries.get("egemed:u:u1:opaca:opaca.bestScore")).toBe('{"practice":77,"assessment":0}');
    expect(entries.has("opaca.bestScore")).toBe(false);
    expect(ns.get("opaca.bestScore")).toBe('{"practice":77,"assessment":0}');
  });

  it("farklı ad alanları birbirini görmez; eski öneksiz kayıt okunmaz", () => {
    const entries = new Map<string, string>([["opaca.bestScore", '{"practice":5,"assessment":0}']]);
    const ns = createNamespacedStoragePort(probePort(entries), "egemed:u:u2:opaca:");
    expect(ns.get("opaca.bestScore")).toBeNull();
    const anon = createNamespacedStoragePort(probePort(entries), "egemed:anon:opaca:");
    expect(anon.get("opaca.bestScore")).toBeNull();
  });
});

describe("oyunlaştırma depo bağı (bindGamiStorage)", () => {
  beforeEach(() => {
    bindGamiStorage(null);
    resetGamiRepo();
  });

  it("bağlıyken load/save portu kullanır; bağ yoksa kaynak localStorage yolu", () => {
    const portEntries = new Map<string, string>();
    bindGamiStorage(createNamespacedStoragePort(probePort(portEntries), "egemed:u:u3:opaca:"));
    const state = { ...emptyState(), profile: { ...emptyState().profile, displayName: "Test" } };
    saveState(state);
    expect(portEntries.get("egemed:u:u3:opaca:opaca.gami.v1")).not.toBeNull();
    expect(loadState()).toEqual(state);

    const store = installMemoryStorage();
    bindGamiStorage(null);
    store.set(STORAGE_KEY, JSON.stringify({ ...emptyState(), earned: [] }));
    expect(loadState()).toEqual({ ...emptyState(), earned: [] });
  });

  it("localStorage yoksa ve bağ yoksa boş durum; yazım sessiz geçer", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadState()).toEqual(emptyState());
    expect(() =>
      saveState({ ...emptyState(), profile: { ...emptyState().profile, displayName: "Test" } }),
    ).not.toThrow();
  });
});

describe("createOpacaModule mount ad alanı (T93)", () => {
  beforeEach(() => {
    bindGamiStorage(null);
    resetGamiRepo();
  });

  it("StoreProvider'a actorId önekli port geçer; yazım önekli anahtara gider", () => {
    const entries = new Map<string, string>();
    const trees: unknown[] = [];
    const module = createOpacaModule(depsWithCapture(entries, trees));
    const dispose = module.mount(fakeTarget(), CONTEXT_ADMIN);
    const storage = providerStorageOf(trees);
    expect(storage.get("opaca.bestScore")).toBeNull();
    storage.set("opaca.bestScore", "1");
    expect(entries.get(`${ADMIN_NS}opaca.bestScore`)).toBe("1");
    expect(entries.has("opaca.bestScore")).toBe(false);
    dispose();
  });

  it("actorId yoksa anonim ad alanı kullanılır", () => {
    const entries = new Map<string, string>();
    const trees: unknown[] = [];
    const module = createOpacaModule(depsWithCapture(entries, trees));
    const dispose = module.mount(fakeTarget(), CONTEXT);
    providerStorageOf(trees).set("opaca.fsPromptDone", "1");
    expect(entries.get("egemed:anon:opaca:opaca.fsPromptDone")).toBe("1");
    expect(entries.has("opaca.fsPromptDone")).toBe(false);
    dispose();
  });

  it("dispose oyunlaştırma bağını kaldırır; kaynak localStorage yolu döner", () => {
    const store = installMemoryStorage();
    const seeded = { ...emptyState(), earned: ["badge-1"] };
    store.set(STORAGE_KEY, JSON.stringify(seeded));
    const entries = new Map<string, string>();
    const trees: unknown[] = [];
    const module = createOpacaModule(depsWithCapture(entries, trees));
    const dispose = module.mount(fakeTarget(), CONTEXT_ADMIN);
    // Bağ aktifken load portu okur: boş (portta kayıt yok).
    expect(loadState()).toEqual(emptyState());
    dispose();
    // Bağ kalkınca kaynak localStorage yolu: tohumlanmış durum döner.
    expect(loadState()).toEqual(seeded);
  });
});

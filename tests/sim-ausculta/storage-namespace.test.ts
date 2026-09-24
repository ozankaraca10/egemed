import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { SimMountContext, SimMountTarget } from "../../packages/sim-host/src/SimHost";
import {
  AUSCULTA_GAMI_STORAGE_KEY,
  BEST_SCORE_KEY,
  LocalGamiRepository,
  auscultaStorageNamespace,
  createAuscultaModule,
  gamiStoragePort,
  loadBestScore,
  namespacedStoragePort,
} from "../../packages/sim-ausculta/src/index";
import type {
  AuscultaAudio,
  AuscultaContainer,
  AuscultaModuleDeps,
  AuscultaRoot,
  StoragePort,
  WindowLike,
} from "../../packages/sim-ausculta/src/index";

/** T94 — Ausculta yerel kayıtları kullanıcı (actorId) ad alanına ayrılır (PULSE-08 deseni). */

const NOW = 1_728_000_000_000;

interface MemoryStorage extends StoragePort {
  readonly entries: Map<string, string>;
}

function memoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
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

function stubAudio(): AuscultaAudio {
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
    dispose: () => undefined,
  };
}

/** Mount ağacını yakalar; React effect'leri koşmaz, yalnız iletilen `storage` incelenir. */
function mountCapture(storage: StoragePort, context: SimMountContext): ReactNode {
  let tree: ReactNode = null;
  const container: AuscultaContainer = { node: {}, remove: () => undefined };
  const root: AuscultaRoot = {
    render(next) {
      tree = next;
    },
    unmount() {
      tree = null;
    },
  };
  const deps: AuscultaModuleDeps = {
    createContainer: () => container,
    createRoot: () => root,
    storage,
    env: inertWindow,
    createEngine: () => stubAudio(),
  };
  const target: SimMountTarget = { appendChild: () => undefined };
  const dispose = createAuscultaModule(deps).mount(target, context);
  const captured = tree;
  dispose();
  if (captured === null) throw new Error("mount ağacı yakalanamadı");
  return captured;
}

describe("auscultaStorageNamespace", () => {
  it("aktör kimliğiyle kullanıcı×sim önekini üretir; anonimde ayrı ad alanı", () => {
    expect(auscultaStorageNamespace("dev-admin-0001")).toBe("egemed:u:dev-admin-0001:ausculta:");
    expect(auscultaStorageNamespace(undefined)).toBe("egemed:anon:ausculta:");
    expect(auscultaStorageNamespace("")).toBe("egemed:anon:ausculta:");
  });

  it("kimliği anahtara kaçışlı yazar; ad/e-posta taşımaz", () => {
    expect(auscultaStorageNamespace("a@b c:d")).toBe("egemed:u:a%40b%20c%3Ad:ausculta:");
  });
});

describe("namespacedStoragePort", () => {
  it("okuma/yazmayı önekler; öneksiz kaydı görmez ve oluşturmaz", () => {
    const backing = memoryStorage({ [BEST_SCORE_KEY]: '{"practice":77,"assessment":0}' });
    const port = namespacedStoragePort(backing, auscultaStorageNamespace("dev-admin-0001"));
    expect(loadBestScore(port), "eski öneksiz kayıt yeni hesaba taşınmaz").toEqual({ practice: 0, assessment: 0 });
    port.set(BEST_SCORE_KEY, '{"practice":80,"assessment":55}');
    expect(backing.entries.has(`egemed:u:dev-admin-0001:ausculta:${BEST_SCORE_KEY}`)).toBe(true);
    expect(backing.entries.get(BEST_SCORE_KEY)).toBe('{"practice":77,"assessment":0}');
    expect(port.get(BEST_SCORE_KEY)).toBe('{"practice":80,"assessment":55}');
  });

  it("aynı depoda hesaplar birbirinin kaydını okumaz", () => {
    const backing = memoryStorage();
    const admin = namespacedStoragePort(backing, auscultaStorageNamespace("dev-admin-0001"));
    const student = namespacedStoragePort(backing, auscultaStorageNamespace("dev-student-0001"));
    admin.set(BEST_SCORE_KEY, '{"practice":91,"assessment":0}');
    expect(student.get(BEST_SCORE_KEY)).toBeNull();
    expect(loadBestScore(student)).toEqual({ practice: 0, assessment: 0 });
  });

  it("oyunlaştırma kaydı da aynı ad alanına yazar", () => {
    const backing = memoryStorage();
    const repo = new LocalGamiRepository({
      storage: gamiStoragePort(namespacedStoragePort(backing, auscultaStorageNamespace("dev-admin-0001"))),
      now: () => new Date(0),
    });
    repo.recordEvent({ type: "correct_diagnosis", id: "x", finishedAt: new Date(0).toISOString() });
    expect([...backing.entries.keys()]).toEqual([`egemed:u:dev-admin-0001:ausculta:${AUSCULTA_GAMI_STORAGE_KEY}`]);
    expect(backing.entries.get(AUSCULTA_GAMI_STORAGE_KEY)).toBeUndefined();
  });
});

describe("createAuscultaModule kayıt ad alanı", () => {
  it("mount bağlamındaki actorId StoreProvider deposuna önek olarak geçer", () => {
    const backing = memoryStorage();
    const tree = mountCapture(backing, { simId: "ausculta", now: () => NOW, actorId: "dev-admin-0001" });
    const { storage } = (tree as ReactElement<{ storage: StoragePort }>).props;
    storage.set(BEST_SCORE_KEY, '{"practice":80,"assessment":0}');
    expect([...backing.entries.keys()]).toEqual([`egemed:u:dev-admin-0001:ausculta:${BEST_SCORE_KEY}`]);
  });

  it("actorId yoksa anonim ad alanına yazar", () => {
    const backing = memoryStorage();
    const tree = mountCapture(backing, { simId: "ausculta", now: () => NOW });
    const { storage } = (tree as ReactElement<{ storage: StoragePort }>).props;
    storage.set(BEST_SCORE_KEY, '{"practice":10,"assessment":0}');
    expect([...backing.entries.keys()]).toEqual([`egemed:anon:ausculta:${BEST_SCORE_KEY}`]);
  });
});

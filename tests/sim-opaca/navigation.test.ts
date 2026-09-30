import { describe, expect, it } from "vitest";
import type { SimNavigation } from "../../packages/sim-host/src/SimHost";
import {
  StoreProvider,
  createMemoryRuntimeAdapter,
  initialState,
  type AppState,
  type StoragePort,
  type StoreContextValue,
  type WindowLike,
} from "../../packages/sim-opaca/src/index";
import { createHookHarness, providerValue } from "./nav-harness";

/** T271b: Opaca StoreProvider'ın SimNavigation köprüsü — ekran → anahtar eşlemesi,
 *  derin bağlantı düzeltmesi, kilitli anahtarın güvenli ekrana düşmesi ve
 *  abonelik kaynaklı geçişte rapor döngüsünün kırılması. DOM'suz koşar
 *  (`nav-harness.ts`); kaynak koda dokunulmaz (T279). */

const NOW = 1_728_000_000_000;

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

interface NavigationWrite {
  readonly key: string | null;
  readonly replace: boolean;
}

/** Kayıt tutan sahte SimNavigation: report yazımlarını ve aboneleri saklar. */
function createRecordingNavigation(initial: string | null) {
  const writes: NavigationWrite[] = [];
  const listeners = new Set<(key: string | null) => void>();
  const navigation: SimNavigation = {
    initial,
    report(key, options) {
      writes.push({ key, replace: options?.replace === true });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    navigation,
    writes,
    /** Kabuk kaynaklı (geri/ileri ya da hash) anahtar değişimini tetikler. */
    navigate(key: string | null): void {
      for (const listener of [...listeners]) listener(key);
    },
  };
}

function setup(options: { initial?: string | null; state?: Partial<AppState> } = {}) {
  const recording = createRecordingNavigation(options.initial ?? null);
  const harness = createHookHarness(StoreProvider, {
    children: null,
    now: () => NOW,
    storage: memoryStorage(),
    runtime: createMemoryRuntimeAdapter(),
    env: inertWindow,
    initialState: { ...initialState, screen: "modes", ...options.state },
    navigation: recording.navigation,
  });
  return {
    ...recording,
    store: (): StoreContextValue => providerValue<StoreContextValue>(harness.tree),
  };
}

describe("Opaca gezinme köprüsü (T271b)", () => {
  it("derin bağlantı ekranla uyuşmuyorsa geçerli ekran replace ile düzeltilir; uyuşuyorsa çağrı yok", () => {
    const deepLink = setup({ initial: "ogrenme", state: { screen: "modes" } });
    expect(deepLink.writes).toEqual([{ key: "modlar", replace: true }]);

    const matching = setup({ initial: "modlar", state: { screen: "modes" } });
    expect(matching.writes).toEqual([]);

    const absent = setup({ initial: null, state: { screen: "modes" } });
    expect(absent.writes).toEqual([]);
  });

  it("iç ekran değişiminde doğru anahtar push ile bildirilir", () => {
    const { store, writes } = setup();
    store().dispatch({ type: "goto", screen: "learn" });
    store().dispatch({ type: "goto", screen: "simulation" });
    store().dispatch({ type: "startMode", mode: "assessment" });
    store().dispatch({ type: "goto", screen: "results" });
    store().dispatch({ type: "goto", screen: "achievements" });
    store().dispatch({ type: "goto", screen: "leaderboard" });
    store().dispatch({ type: "goto", screen: "modes" });
    expect(writes).toEqual([
      { key: "ogrenme", replace: false },
      { key: "uygulama", replace: false },
      { key: "degerlendirme", replace: false },
      { key: "sonuc", replace: false },
      { key: "ilerlemem", replace: false },
      { key: "ilerlemem", replace: false },
      { key: "modlar", replace: false },
    ]);
  });

  it("abonelikten gelen geçişte ekran taşınır ama rapor yazılmaz (döngü kırılır)", () => {
    const { navigate, store, writes } = setup();
    navigate("ogrenme");
    expect(store().state.screen).toBe("learn");
    expect(writes).toEqual([]);

    store().dispatch({ type: "goto", screen: "modes" });
    expect(writes).toEqual([{ key: "modlar", replace: false }]);
  });

  it("abonelik bilinen anahtarları taşır, bilinmeyeni yok sayar", () => {
    const { navigate, store, writes } = setup();
    navigate("ilerlemem");
    expect(store().state.screen).toBe("achievements");
    navigate(null);
    expect(store().state.screen).toBe("modes");
    navigate("yardim");
    navigate("hakkinda");
    expect(store().state.screen).toBe("modes");
    expect(writes).toEqual([]);
  });

  it("erişilemeyen anahtar güvenli ekrana düşer ve replace ile geri bildirilir", () => {
    const missingResults = setup({ state: { screen: "learn" } });
    missingResults.navigate("sonuc");
    expect(missingResults.store().state.screen).toBe("learn");
    expect(missingResults.writes).toEqual([{ key: "ogrenme", replace: true }]);

    const wrongMode = setup({ state: { screen: "modes", mode: "assessment" } });
    wrongMode.navigate("uygulama");
    wrongMode.navigate("sonuc");
    expect(wrongMode.store().state.screen).toBe("modes");
    expect(wrongMode.writes).toEqual([
      { key: "modlar", replace: true },
      { key: "modlar", replace: true },
    ]);

    const noSession = setup({ state: { screen: "modes", mode: "assessment", server: null } });
    noSession.navigate("degerlendirme");
    expect(noSession.store().state.screen).toBe("modes");
    expect(noSession.writes).toEqual([{ key: "modlar", replace: true }]);
  });
});

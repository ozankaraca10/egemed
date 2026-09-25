import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreProvider, createMemoryRuntimeAdapter, initialState } from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";
import { LocalGamiRepository, type GamiStorage } from "../../packages/sim-ausculta/src/gamification/repo";
import { ProgressScreen } from "../../packages/sim-ausculta/src/screens/ProgressScreen";
import { ResultsScreen } from "../../packages/sim-ausculta/src/screens/ResultsScreen";
import type { AppState } from "../../packages/sim-ausculta/src/index";

const NOW = 1_758_700_000_000;
const at = new Date(NOW);

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
    set: (key, value) => { entries.set(key, value); },
  };
}

class MemoryGami implements GamiStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function render(node: ReactNode, state: AppState = initialState): string {
  return renderToStaticMarkup(createElement(StoreProvider, {
    children: node,
    env: inertWindow,
    initialState: state,
    now: () => NOW,
    runtime: createMemoryRuntimeAdapter(),
    storage: memoryStorage(),
  }));
}

describe("Ausculta ilerleme ekranı", () => {
  it("Başarılarım ve Liderlik sekmelerini ve demo bandını çizer", () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const html = render(createElement(ProgressScreen, { repository }));
    expect(html).toContain("Başarılarım");
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain("Demo verisi");
    expect(html).toContain("Başarılarım burada birikecek");
    expect(html).toContain("Kısa dinleme");
    expect(html).not.toContain("eg-ausculta-progress");
  });

  it("liderlik sekmesinde yerel demo sıralamasını çizer", () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const html = render(createElement(ProgressScreen, { repository, tab: "leaderboard" }));
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain("Demo verisi");
    expect(html).toContain("Bu dönemde henüz sıralamaya giren yok.");
    expect(html).toContain('aria-selected="true"');
  });

  it("sonuç ekranında kazanım kartını çizer", () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const state: AppState = {
      ...initialState,
      screen: "results",
      mode: "practice",
      caseResults: [{
        caseId: "c1",
        total: 90,
        max: 100,
        mastery: true,
        domains: {
          technique: { earned: 1, max: 1 },
          localization: { earned: 1, max: 1 },
          recognition: { earned: 1, max: 1 },
          interpretation: { earned: 1, max: 1 },
          diagnosis: { earned: 0, max: 0 },
          systematic: { earned: 1, max: 1 },
        },
        answers: [],
        hintsUsed: 0,
      }],
    };
    const html = render(createElement(ResultsScreen, { repository }), state);
    expect(html).toContain("Bu oturumda kazandıkların");
    expect(html).toContain("Demo verisi");
    expect(html).toContain("Başarılarımı gör");
    expect(html).toContain("Sıralamaya bak");
  });
});

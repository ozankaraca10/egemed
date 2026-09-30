import { createElement, type ReactNode } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreProvider, createMemoryRuntimeAdapter, initialState } from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";
import { LocalGamiRepository, type GamiStorage } from "../../packages/sim-ausculta/src/gamification/repo";
import { ProgressScreen } from "../../packages/sim-ausculta/src/screens/ProgressScreen";
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

async function markup(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

describe("Ausculta ilerleme ekranı", () => {
  it("kanal anlık görüntüsündeki ödülü ve geçmiş kazananı liderlikte gösterir", () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const html = render(createElement(ProgressScreen, {
      repository,
      rewards: {
        current: {
          month: "2026-09", title: "Eylül ödülü", description: "Aylık ödül", sponsor: "EGEMED",
          winnersCount: 1, eligibility: { cohorts: [], minAssessments: 2, requirePublicName: false }, terms: [],
        },
        winners: [{ month: "2026-08", rank: 1, displayName: "Önceki kazanan", score: 88, isMe: false }],
      },
      tab: "leaderboard",
    }));
    expect(html).toContain("Eylül ödülü");
    expect(html).toContain("Önceki kazanan");
  });


  it("sahte kaynakta demo bandını gizler ve sunucu rozetini kazanıldı gösterir", async () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const html = await markup(createElement(StoreProvider, {
      children: createElement(ProgressScreen, {
        gamification: {
          async summary() {
            return {
              badges: [{ awardedAt: "2026-09-20T10:15:00.000+03:00", key: "listen-3" }],
              level: 2,
              streak: { best: 3, current: 2 },
              xp: 40,
            };
          },
          async leaderboard() {
            return { rows: [] };
          },
        },
        repository,
      }),
      env: inertWindow,
      initialState,
      now: () => NOW,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    }));
    expect(html).not.toContain("Demo verisi");
    expect(html).toContain("Kısa dinleme");
    expect(html).toContain("is-earned");
    expect(html).toContain("kazanıldı");
  });

  it("liderlik sekmesinde yerel demo sıralamasını çizer", () => {
    const repository = new LocalGamiRepository({ storage: new MemoryGami(), now: () => at });
    const html = render(createElement(ProgressScreen, { repository, tab: "leaderboard" }));
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain("Demo verisi");
    expect(html).toContain("Bu dönemde henüz sıralamaya giren yok.");
    expect(html).toContain('aria-selected="true"');
  });
});

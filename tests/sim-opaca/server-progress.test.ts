import { createElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamiProvider } from "../../packages/sim-opaca/src/gamification/GamiContext";
import { StoreProvider, createMemoryRuntimeAdapter, initialState } from "../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-opaca/src/index";
import { AchievementsScreen } from "../../packages/sim-opaca/src/screens/AchievementsScreen";

const NOW = 1_758_700_000_000;

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

async function markup(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

describe("Opaca İlerlemem sunucu kaynağı", () => {
  it("sahte kaynakta demo bandını gizler ve sunucu rozetini kazanıldı gösterir", async () => {
    const html = await markup(createElement(GamiProvider, {
      children: createElement(StoreProvider, {
        children: createElement(AchievementsScreen, { devBuild: false }),
        env: inertWindow,
        initialState,
        now: () => NOW,
        runtime: createMemoryRuntimeAdapter(),
        storage: memoryStorage(),
      }),
      gamification: {
        async summary() {
          return {
            badges: [{ awardedAt: "2026-09-20T10:15:00.000+03:00", key: "systematic" }],
            level: 3,
            streak: { best: 5, current: 2 },
            xp: 80,
          };
        },
        async leaderboard() {
          return { rows: [] };
        },
      },
      now: () => NOW,
    }));
    expect(html).not.toContain("Demo verisi");
    expect(html).toContain("Sistematik Okuyucu");
    expect(html).toContain("is-earned");
    expect(html).toContain("kazanıldı");
  });
});

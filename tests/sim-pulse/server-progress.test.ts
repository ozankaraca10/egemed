import { createElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GamiLeaderboardRow } from "../../packages/gamification-core/src/index";
import { emptyPulseGamiState } from "../../packages/sim-pulse/src/gamification/repo";
import { PulseProgressPage } from "../../packages/sim-pulse/src/runtime/progress";

const AWARDED = "2026-09-20T10:15:00.000+03:00";
const NOW = new Date("2026-09-24T12:00:00.000Z");

const row: GamiLeaderboardRow = {
  attemptsCount: 2,
  cohort: 3,
  displayName: "A K",
  id: "peer",
  isMe: false,
  isPublic: true,
  level: 2,
  periodScore: 80,
  rank: 1,
  reachedAt: AWARDED,
  totalXp: 100,
};

function source() {
  return {
    async summary() {
      return {
        badges: [{ awardedAt: AWARDED, key: "rhythm-streak-3" }],
        level: 2,
        streak: { best: 9, current: 4 },
        xp: 60,
      };
    },
    async leaderboard() {
      return { rows: [row] };
    },
  };
}

async function markup(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

describe("Pulse İlerlemem sunucu kaynağı", () => {
  it("sahte kaynakta demo bandını gizler ve sunucu rozetini kazanıldı gösterir", async () => {
    const html = await markup(createElement(PulseProgressPage, {
      actions: { onAssessment: () => undefined, onClose: () => undefined, onStudy: () => undefined },
      gamification: source(),
      now: NOW,
      state: emptyPulseGamiState(),
    }));
    expect(html).not.toContain("Demo verisi");
    expect(html).toContain("Ritim izleyicisi");
    expect(html).toContain("is-earned");
    expect(html).toContain("kazanıldı");
    expect(html).toMatch(/Seviye <!-- -->2/);
    expect(html).toMatch(/4<!-- --> gün/);
  });
});

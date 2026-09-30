import { describe, expect, it } from "vitest";
import { buildAttemptRecord } from "../../packages/sim-pulse/src/gamification/attempt";
import { pulseSessionGains } from "../../packages/sim-pulse/src/gamification/gains";
import { emptyPulseGamiState } from "../../packages/sim-pulse/src/gamification/repo";

const NOW = new Date("2026-09-24T12:00:00.000Z");

function attempt(sessionId: string) {
  return buildAttemptRecord({
    sessionId,
    mode: "assessment",
    ecgMode: "normal",
    score: 85,
    correctAnswers: 8,
    totalQuestions: 10,
    hintsUsed: 0,
    durationMs: 60_000,
    finishedAt: NOW,
  });
}

describe("Pulse aylık ödül kazanımı", () => {
  it("ödül kanalı varken değerlendirme sırası için ay dönemini kullanır", () => {
    const prior = attempt("prior");
    const current = attempt("current");
    if (!prior || !current) throw new Error("geçerli test denemesi oluşturulmalı");
    const state = { ...emptyPulseGamiState(), attempts: [prior, current] };
    const gains = pulseSessionGains({ state, attempt: current, earnedIds: [], now: NOW, rewardActive: true });
    expect(gains.rank).toEqual({ period: "month", rank: 1, of: 1, delta: null });
  });

  it("ödül kanalı yokken mevcut kazanım davranışını korur", () => {
    const current = attempt("current");
    if (!current) throw new Error("geçerli test denemesi oluşturulmalı");
    const gains = pulseSessionGains({ state: { ...emptyPulseGamiState(), attempts: [current] }, attempt: current, earnedIds: [], now: NOW });
    expect(gains.rank).toBeNull();
  });
});

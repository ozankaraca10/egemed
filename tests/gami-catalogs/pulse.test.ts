import { describe, expect, it } from "vitest";
import {
  PULSE_MODES,
  encodePulseSummary,
  pulseStatsFromSummaries,
} from "../../packages/gami-catalogs/src/index";
import { MODES } from "../../packages/sim-pulse/src/engine/shapes";
import { computePulseStats } from "../../packages/sim-pulse/src/gamification/repo";
import type { PulseAttemptRecord } from "../../packages/sim-pulse/src/gamification/attempt";
import { attemptSummarySchema } from "../../packages/contracts/src/index";

/** Deterministik tohumlu üreteç (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAttempt(next: () => number, index: number): PulseAttemptRecord {
  const caliper = next();
  return {
    id: `pulse-assessment-${index}`,
    mode: next() < 0.5 ? "assessment" : "practice",
    finishedAt: new Date(Date.UTC(2026, 8, 1) + index * 3_600_000).toISOString(),
    score: Math.floor(next() * 101),
    mastery: next() < 0.5,
    caseCount: 10,
    hintsUsed: 0,
    durationMs: 1000,
    domains: {},
    extra: {
      ecgMode: MODES[Math.floor(next() * MODES.length)] ?? "normal",
      modeMastered: next() < 0.4,
      correctlyReadLeads: Math.floor(next() * 13),
      caliperAccurate: caliper < 0.33 ? null : caliper < 0.66,
      rhythmRecognitionStreak: Math.floor(next() * 40),
    },
  } as PulseAttemptRecord;
}

describe("Pulse kodlu özet ve rozet istatistiği (ADR-008)", () => {
  it("mod sırası sim motoruyla aynıdır", () => {
    expect([...PULSE_MODES]).toEqual([...MODES]);
  });

  it("özetlerden türetilen istatistik denemelerden türetilenle birebir aynıdır (500 tohumlu deneme)", () => {
    const next = rng(20260924);
    for (let round = 0; round < 50; round += 1) {
      const attempts = Array.from({ length: 1 + Math.floor(next() * 12) }, (_, i) => randomAttempt(next, round * 100 + i));
      const summaries = attempts.map((attempt) => encodePulseSummary(attempt));
      for (const summary of summaries) expect(attemptSummarySchema.safeParse(summary).success).toBe(true);
      expect(pulseStatsFromSummaries(summaries)).toEqual(computePulseStats(attempts));
    }
  });

  it("bozuk, sürümsüz ya da sınır dışı kodlar istatistiği şişiremez", () => {
    const stats = pulseStatsFromSummaries([
      { "pulse.streak": 999 },
      { "pulse.v": 1, "pulse.leads": 400, "pulse.streak": 5, "pulse.mode": 99, "pulse.mastered": 1 },
    ]);
    expect(stats).toEqual({ rhythmRecognitionStreak: 5, correctlyReadLeads: 12, accurateCaliperCount: 0, modeMastery: {} });
  });
});

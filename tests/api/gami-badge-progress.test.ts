import { describe, expect, it } from "vitest";
import { createMemoryGamificationRepo } from "../../apps/api/src/me/gamification";

describe("bellek gamification özeti", () => {
  it("Opaca öğrenme ve deneme rozet ilerlemesini verir, diğer simlere alan eklemez", async () => {
    const store = createMemoryGamificationRepo();
    const userId = "student-1";
    const institutionId = "institution-1";
    const at = 1_800_000_000_000;
    for (let index = 0; index < 7; index += 1) {
      await store.repo.recordLearn({ userId, institutionId, simId: "opaca", topic: `opaca:topic:test-${index}`, at });
    }
    const summary = await store.repo.getSummary({ userId, institutionId, simId: "opaca", at });
    expect(summary.badgeProgress?.explorer).toEqual({ value: 7, max: 10 });

    await store.repo.writeAttempt({
      id: "attempt-1",
      userId,
      institutionId,
      simId: "opaca",
      attemptNo: 1,
      startedAt: at - 100_000,
      finishedAt: at,
      score: 40,
      maxScore: 100,
      passed: false,
      summary: { "opaca.v": 2, "opaca.mode": 1 },
      createdAt: at,
      mode: "assessment",
      caseCount: 1,
      hintsUsed: 0,
    });
    const afterAttempt = await store.repo.getSummary({ userId, institutionId, simId: "opaca", at });
    expect(afterAttempt.badgeProgress?.["first-step"]).toEqual({ value: 1, max: 1 });
    // T277: capstone ilerlemesi de sunucudan gelir; payda 39 (kazanılamayan rozet yok).
    expect(afterAttempt.badgeProgress?.["gercek-rozet"]).toEqual({ value: 1, max: 39 });

    const ausculta = await store.repo.getSummary({ userId, institutionId, simId: "ausculta", at });
    expect(ausculta).not.toHaveProperty("badgeProgress");
  });
});

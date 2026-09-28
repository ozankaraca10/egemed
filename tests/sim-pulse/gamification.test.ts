import { describe, expect, it } from "vitest";
import { assessmentXp, computeWeeklyGoals, evaluateBadges } from "../../packages/gamification-core/src/index";
import type { AttemptRecord, EarnedBadge } from "../../packages/gamification-core/src/index";
import { PULSE_BADGES, PULSE_MODE_LABELS } from "../../packages/sim-pulse/src/gamification/catalog";
import type { PulseStats } from "../../packages/sim-pulse/src/gamification/catalog";
import { DUEL_BADGES } from "../../packages/gami-catalogs/src/index";
import { buildAttemptRecord } from "../../packages/sim-pulse/src/gamification/attempt";
import { PULSE_RULES } from "../../packages/sim-pulse/src/gamification/rules";
import { LEADS, MODES } from "../../packages/sim-pulse/src/engine/shapes";

const ids = (earned: readonly EarnedBadge[]) => earned.map((badge) => badge.id);
const now = new Date("2026-09-24T10:00:00.000Z");

describe("Pulse oyunlaştırması", () => {
  it("en az 16 Türkçe rozeti benzersiz kimlik ve kategori/tier bilgisiyle tanımlar", () => {
    expect(PULSE_BADGES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(PULSE_BADGES.map((badge) => badge.id)).size).toBe(PULSE_BADGES.length);
    expect(new Set(PULSE_BADGES.map((badge) => badge.category))).toEqual(new Set(["skill", "streak", "topic", "challenge"]));
    // T221: düello rozetleri her simin kataloğunda ayrı listelenir (kazanım sunucuda).
    expect(PULSE_BADGES.filter((badge) => badge.category === "challenge").map((badge) => badge.id)).toEqual(
      DUEL_BADGES.map((badge) => badge.id),
    );
    expect(PULSE_BADGES.some((badge) => badge.tier === "bronze")).toBe(true);
    expect(PULSE_BADGES.every((badge) => /[A-Za-z]/.test(badge.name) && badge.description.length > 0)).toBe(true);
    expect(Object.keys(PULSE_MODE_LABELS)).toEqual([...MODES]);
    expect(PULSE_BADGES.filter((badge) => badge.id.startsWith("mode-"))).toHaveLength(13);
  });

  it("ritim serisi, 12 derivasyon, kaliper ve 13 mod ustalığı eşiklerini değerlendirir", () => {
    const stats: PulseStats = {
      rhythmRecognitionStreak: 10,
      correctlyReadLeads: 12,
      accurateCaliperCount: 10,
      modeMastery: { normal: 1, af: 1 },
    };
    const earned = ids(evaluateBadges(PULSE_BADGES, stats, [], { now }));
    expect(earned).toEqual(expect.arrayContaining([
      "rhythm-streak-3", "rhythm-streak-10", "twelve-leads", "caliper-1", "caliper-2", "mode-normal", "mode-af",
    ]));
    expect(earned).not.toContain("rhythm-streak-25");
    expect(earned).not.toContain("caliper-3");
    expect(ids(evaluateBadges(PULSE_BADGES, { ...stats, rhythmRecognitionStreak: 2 }, [], { now }))).not.toContain("rhythm-streak-3");
  });

  it("varsayılan XP çekirdeğini korurken haftalık hedefleri Pulse için ayarlar", () => {
    expect(PULSE_RULES.week).toEqual({ assessmentSessionsGoal: 3, avgScoreGoal: 75, newBadgesGoal: 2 });
    const attempt: AttemptRecord = {
      id: "pulse-test", mode: "assessment", finishedAt: now.toISOString(), score: 80, mastery: true,
      caseCount: 10, hintsUsed: 0, durationMs: 60_000, domains: {}, extra: {},
    };
    expect(assessmentXp(attempt, PULSE_RULES)).toBe(120);
    const attempts = [0, 1, 2].map((n) => ({ ...attempt, id: `a-${n}` }));
    const earned = ["rhythm-streak-3", "twelve-leads"].map((id) => ({ id, at: now.toISOString() }));
    const goals = computeWeeklyGoals(attempts, earned, now, PULSE_RULES);
    expect(goals.goals[0]).toMatchObject({ value: 3, max: 3, done: true });
    expect(goals.goals[1]).toMatchObject({ value: 1, max: 1, done: true });
    expect(goals.goals[2]).toMatchObject({ value: 2, max: 2, done: true });
  });

  it("tamamlanmış Pulse sonucunu 12 derivasyon ve kaliper verileriyle kayda dönüştürür", () => {
    const record = buildAttemptRecord({
      sessionId: "session-42", mode: "assessment", ecgMode: "af", score: 80,
      correctAnswers: 8, totalQuestions: 10, hintsUsed: 1, durationMs: 120_000,
      finishedAt: now, correctlyReadLeads: LEADS, caliperErrorMs: -20, rhythmRecognitionStreak: 4,
    });
    expect(record).toMatchObject({
      id: "pulse-assessment-session-42", mode: "assessment", score: 80, mastery: true, caseCount: 10,
      finishedAt: now.toISOString(), domains: { rhythmRecognition: 80, leadReading: 100, intervalMeasurement: 100 },
      extra: {
        ecgMode: "af", modeMastered: true, correctlyReadLeads: 12, leadCount: 12,
        caliperAccurate: true, rhythmRecognitionStreak: 4,
      },
    });
  });

  it("eşik sınırlarını ve eksik ölçümü korur; boş veya geçersiz sonucu reddeder", () => {
    const base = {
      sessionId: "session", mode: "practice" as const, ecgMode: "normal" as const,
      score: 79, correctAnswers: 7, totalQuestions: 10, hintsUsed: 0, durationMs: 1,
      finishedAt: now,
    };
    expect(buildAttemptRecord({ ...base, caliperErrorMs: 20 })?.extra.caliperAccurate).toBe(true);
    expect(buildAttemptRecord({ ...base, caliperErrorMs: 20.1 })?.extra.caliperAccurate).toBe(false);
    expect(buildAttemptRecord(base)?.extra.caliperAccurate).toBeNull();
    expect(buildAttemptRecord({ ...base, sessionId: "" })).toBeNull();
    expect(buildAttemptRecord({ ...base, sessionId: "   " })).toBeNull();
    expect(buildAttemptRecord({ ...base, totalQuestions: 0 })).toBeNull();
    expect(buildAttemptRecord({ ...base, totalQuestions: 1.5 })).toBeNull();
    expect(buildAttemptRecord({ ...base, score: 101 })).toBeNull();
    expect(buildAttemptRecord({ ...base, caliperErrorMs: Number.NaN })).toBeNull();
    expect(buildAttemptRecord({ ...base, rhythmRecognitionStreak: -1 })).toBeNull();
    expect(buildAttemptRecord({ ...base, finishedAt: new Date(Number.NaN) })).toBeNull();
  });
});

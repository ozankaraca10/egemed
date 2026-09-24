import { describe, expect, it } from "vitest";
import type { PulseLeaderboardView } from "../../packages/sim-pulse/src/gamification/repo";
import {
  PULSE_ANONYMOUS_LABEL,
  createMemoryGamiRepo,
  emptyPulseGamiState,
} from "../../packages/sim-pulse/src/gamification/repo";
import {
  PULSE_PERIOD_LABELS,
  achievementsMarkup,
  createPulseAchievementsView,
  createPulseGainsView,
  createPulseLeaderboardView,
  gainsMarkup,
  leaderboardMarkup,
} from "../../packages/sim-pulse/src/gamification/ui";
import type { PulseAttemptRecord } from "../../packages/sim-pulse/src/gamification/attempt";

const NOW = new Date("2026-09-24T10:00:00.000Z");

const attempt = (overrides: Partial<PulseAttemptRecord> = {}): PulseAttemptRecord => ({
  id: "pulse-assessment-s1",
  mode: "assessment",
  finishedAt: NOW.toISOString(),
  score: 90,
  mastery: true,
  caseCount: 10,
  hintsUsed: 0,
  durationMs: 60_000,
  domains: { rhythmRecognition: 90 },
  extra: {
    ecgMode: "normal",
    modeMastered: true,
    correctlyReadLeads: 12,
    leadCount: 12,
    caliperAccurate: true,
    rhythmRecognitionStreak: 5,
  },
  ...overrides,
});

describe("Başarılarım görünümü", () => {
  it("kazanım yokken boş durum kartı ve değerlendirme çağrısı gösterir", () => {
    const view = createPulseAchievementsView(emptyPulseGamiState(), NOW);
    expect(view.hasAttempts).toBe(false);
    const html = achievementsMarkup(view);
    expect(html).toContain("Başarılarım");
    expect(html).toContain("Henüz kazanım yok");
    expect(html).toContain('data-pulse-view="quiz"');
    expect(html).not.toContain("Rozetler");
  });

  it("düzey, seri, haftalık hedefler ve rozet ilerlemesini taşır", () => {
    const state = { ...emptyPulseGamiState(), attempts: [attempt()], earned: [{ id: "twelve-leads", at: NOW.toISOString() }] };
    const view = createPulseAchievementsView(state, NOW);
    expect(view.hasAttempts).toBe(true);
    expect(view.totalXp).toBe(120);
    expect(view.level.level).toBe(2);
    expect(view.streak.current).toBe(1);
    expect(view.earnedCount).toBe(1);
    expect(view.badges).toHaveLength(20);

    const html = achievementsMarkup(view);
    expect(html).toContain("12 derivasyon okuru");
    expect(html).toContain("Düzey 2");
    expect(html).toContain("120 XP");
    expect(html).toContain("1 gün seri");
    expect(html).toContain("1/20 rozet");
    expect(html).toContain("değerlendirme oturumu");
    expect(html).toContain("progressbar");
    expect(html).toContain("Kazanıldı");
  });
});

describe("Liderlik görünümü", () => {
  const board: PulseLeaderboardView = {
    period: "week",
    cohort: "all",
    generatedAt: NOW.toISOString(),
    isDemo: true,
    rows: [
      { id: "demo-01", displayName: "Deniz Kaya", isMe: false, isPublic: true, cohort: 5, periodScore: 90, attemptsCount: 3, reachedAt: NOW.toISOString(), totalXp: 800, level: 4, rank: 1 },
      { id: "demo-02", displayName: PULSE_ANONYMOUS_LABEL, isMe: false, isPublic: false, cohort: 3, periodScore: 70, attemptsCount: 2, reachedAt: NOW.toISOString(), totalXp: 400, level: 3, rank: null },
      { id: "me", displayName: "<img src=x onerror=alert(1)>", isMe: true, isPublic: true, cohort: null, periodScore: 85, attemptsCount: 2, reachedAt: NOW.toISOString(), totalXp: 300, level: 2, rank: 2 },
    ],
  };

  it("dönem sekmelerini ve sıralama satırlarını tabloya yazar", () => {
    expect(PULSE_PERIOD_LABELS).toEqual({ today: "Bugün", week: "Bu hafta", month: "Bu ay", academic_year: "Akademik yıl" });
    const view = createPulseLeaderboardView(board);
    expect(view.me?.id).toBe("me");
    expect(view.rows).toHaveLength(3);
    const html = leaderboardMarkup(view);
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain('data-pulse-gami-period="week" aria-pressed="true"');
    expect(html).toContain("Deniz Kaya");
    expect(html).toContain("Sen");
    expect(html).toContain("85,0");
    expect(html).toContain(`<td>1</td>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("boş sıralamada not gösterir", () => {
    const empty = createPulseLeaderboardView({ ...board, rows: [] });
    expect(empty.me).toBeNull();
    expect(empty.rows).toHaveLength(0);
    expect(leaderboardMarkup(empty)).toContain("Bu dönemde henüz sıralamaya giren yok");
  });

  it("sıralamaya girmemiş 'ben' için tamamlama notu yazar", () => {
    const qualifies = createPulseLeaderboardView({
      ...board,
      rows: [{ ...board.rows[2]!, rank: null, periodScore: null, attemptsCount: 1 }],
    });
    expect(leaderboardMarkup(qualifies)).toContain("1 değerlendirme daha tamamla");
  });
});

describe("Sonuç ekranı kazanımlar kartı", () => {
  it("yeni rozet yoksa özet ve yönlendirme gösterir", () => {
    const view = createPulseGainsView(emptyPulseGamiState(), [], NOW);
    expect(view.newlyEarned).toHaveLength(0);
    const html = gainsMarkup(view);
    expect(html).toContain("Kazanımlar");
    expect(html).toContain("Yeni rozet yok");
    expect(html).toContain('data-pulse-view="achievements"');
  });

  it("önizlemede kazanılan rozet adını ve toplam ilerlemeyi taşır", async () => {
    const repo = createMemoryGamiRepo();
    const result = await repo.recordAttempt(attempt(), NOW);
    const view = createPulseGainsView(result.state, result.earnedIds, NOW);
    expect(view.newlyEarned.map((badge) => badge.def.id)).toEqual(expect.arrayContaining(["twelve-leads", "mode-normal"]));
    const html = gainsMarkup(view);
    expect(html).toContain("12 derivasyon okuru");
    expect(html).toContain("Düzey 2");
    expect(html).not.toContain("Yeni rozet yok");
  });
});

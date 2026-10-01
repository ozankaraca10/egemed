import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, computeStreak, computeWeeklyGoals, levelForXp, type AttemptRecord, type BadgeDef } from "../../packages/gamification-core/src/index";
import { badgeCategoryOptions, buildAchievementsModel, buildLeaderboardModel, defaultGamiIcons, filterBadgesByCategory, GAMI_BADGE_CATEGORIES } from "../../packages/gami-ui/src/index";
import type { GamiLeaderboardRow } from "../../packages/gamification-core/src/index";

const now = new Date("2026-09-24T09:00:00.000Z");

const catalog: BadgeDef<{ n: number }>[] = [{
  id: "one",
  category: "skill",
  tier: "bronze",
  name: "İlk adım",
  description: "Bir değerlendirme.",
  rule: "1 oturum",
  icon: "Star",
  progress: (state) => ({ value: state.n, max: 2 }),
}];

const attempt: AttemptRecord<"technique"> = {
  id: "a1",
  mode: "assessment",
  finishedAt: "2026-09-20T09:00:00.000Z",
  score: 80,
  mastery: true,
  caseCount: 1,
  hintsUsed: 0,
  durationMs: 1_000,
  domains: { technique: 40 },
  extra: {},
};

const row = (patch: Partial<GamiLeaderboardRow>): GamiLeaderboardRow => ({
  id: "me",
  displayName: "Sen",
  isMe: true,
  isPublic: true,
  cohort: 3,
  periodScore: null,
  attemptsCount: 0,
  reachedAt: null,
  totalXp: 0,
  level: 1,
  rank: null,
  ...patch,
});

describe("gami-ui model sözleşmesi", () => {
  it("rozet, profil, grafik, alan, kategori ve dönem seçimini üretir", () => {
    const model = buildAchievementsModel({
      now,
      period: "last30",
      attempts: [attempt],
      rules: DEFAULT_RULES,
      catalog,
      stats: { n: 1 },
      earned: [],
      badgeContext: { now },
      level: levelForXp(80, DEFAULT_RULES),
      streak: computeStreak([attempt], now),
      goals: computeWeeklyGoals([attempt], [], now, DEFAULT_RULES),
      profile: { public: true, displayName: "Ayşe Yılmaz" },
      weekRows: [row({ rank: 4 })],
      domainMeta: [{ key: "technique", label: "Teknik", icon: createElement("span", { "data-icon": "scan" }) }],
      lockedNote: (id) => (id === "podium" ? "demo" : null),
    });
    expect(model.periods.map((item) => item.label)).toEqual(["Son 30 gün", "Son 12 hafta", "Akademik yıl"]);
    expect(model.categories.map((item) => item.label)).toContain("Beceri");
    expect(model.hasAttempts).toBe(true);
    expect(model.profile?.avatarName).toBe("Ayşe Yılmaz");
    expect(model.profile?.weekRank).toBe(4);
    expect(model.profile?.periodAssessments).toBe(1);
    expect(model.points).toHaveLength(1);
    expect(model.points[0]?.score).toBe(80);
    expect(model.domains).toEqual([expect.objectContaining({ key: "technique", pct: 40, weak: true })]);
    expect(model.badges[0]).toEqual(expect.objectContaining({
      id: "one",
      state: "progress",
      value: 1,
      max: 2,
      tierLabel: "Bronz",
      iconName: "Star",
      assessmentOnly: true,
      lockedNote: null,
    }));
    expect(model.goals).toHaveLength(3);
    expect(model.weekLabel).toContain("–");
    expect(defaultGamiIcons.badge("Star", 16, "skill")).not.toBeNull();
    // bilinmeyen iconName için de asla boş kalmaz — kategoriye göre yedek ikon döner
    expect(defaultGamiIcons.badge("Yok", 16, "skill")).not.toBeNull();
  });

  it("kategori filtresi: 'Meydan Okuma' yalnız düello rozetlerini, 'Tümü' hepsini gösterir", () => {
    const duelCatalog: BadgeDef<{ n: number }>[] = [
      { id: "skill-one", category: "skill", name: "Beceri bir", description: "Bir beceri.", progress: (s) => ({ value: s.n, max: 1 }) },
      {
        id: "duel-first",
        category: "challenge",
        tier: "bronze",
        name: "İlk karşılaşma",
        description: "İlk karşılaşmayı tamamla.",
        progress: (s) => ({ value: s.n, max: 1 }),
      },
    ];
    const model = buildAchievementsModel({
      now,
      period: "last30",
      attempts: [attempt],
      rules: DEFAULT_RULES,
      catalog: duelCatalog,
      stats: { n: 1 },
      earned: [],
      badgeContext: { now },
      level: levelForXp(80, DEFAULT_RULES),
      streak: computeStreak([attempt], now),
      goals: computeWeeklyGoals([attempt], [], now, DEFAULT_RULES),
      profile: { public: true, displayName: "Ayşe Yılmaz" },
      weekRows: null,
      domainMeta: [],
    });
    expect(GAMI_BADGE_CATEGORIES.find((category) => category.id === "challenge")?.label).toBe("Meydan Okuma");
    expect(badgeCategoryOptions(model.badges, model.categories).map((option) => option.label)).toEqual([
      "Tümü",
      "Beceri",
      "Meydan Okuma",
    ]);
    expect(filterBadgesByCategory(model.badges, "challenge").map((badge) => badge.id)).toEqual(["duel-first"]);
    expect(filterBadgesByCategory(model.badges, "all").map((badge) => badge.id)).toEqual(["skill-one", "duel-first"]);
    expect(filterBadgesByCategory(model.badges, "milestone")).toEqual([]);
  });

  it("liderlik dönem etiketini, boş sıralamayı ve kalan denemeyi üretir", () => {
    const empty = buildLeaderboardModel({
      now,
      clock: now,
      period: "week",
      cohort: "all",
      rows: [row({})],
      prevRows: [row({ rank: 3 })],
      monthRows: null,
      reward: null,
      boardReady: true,
    });
    expect(empty.periods.map((item) => item.id)).toEqual(["today", "week", "month", "academic_year"]);
    expect(empty.cohorts[0]?.label).toBe("Tüm dönemler");
    expect(empty.periodLabel).toContain("2026");
    expect(empty.rankedEmpty).toBe(true);
    expect(empty.qualify).toEqual({ left: 2 });
    expect(empty.status).toBeNull();
    expect(empty.countdown.length).toBeGreaterThan(0);

    const moved = buildLeaderboardModel({
      now,
      clock: now,
      period: "week",
      cohort: "all",
      rows: [row({ rank: 2, attemptsCount: 3, periodScore: 90 })],
      prevRows: [row({ rank: 5, attemptsCount: 3, periodScore: 70 })],
      monthRows: null,
      reward: null,
      boardReady: true,
    });
    expect(moved.meDelta).toBe(3);
    expect(moved.qualify).toBeNull();
    expect(moved.rankedEmpty).toBe(false);
    expect(moved.items[0]).toEqual({ kind: "row", row: expect.objectContaining({ rank: 2 }) });
  });
});

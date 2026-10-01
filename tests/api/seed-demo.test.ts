import { describe, expect, it } from "vitest";
import { SIM_IDS, type SimId } from "../../packages/contracts/src/index";
import {
  DEMO_NOW,
  DEMO_SEED,
  DEMO_USERNAME_PREFIX,
  buildDemoPlan,
  seedDemoDatabase,
  type DemoDb,
} from "../../apps/api/src/seed/demo";
import { buildLeaderboardRows, cohortFromUnitCode } from "../../apps/api/src/me/leaderboard";
import { serverAttemptXp } from "../../apps/api/src/me/gamification";
import {
  DEFAULT_RULES,
  levelForXp,
  rewardStandings,
} from "../../packages/gamification-core/src/index";
import { REWARD_SEED, SIM_BADGE_EVALUATORS } from "../../packages/gami-catalogs/src/index";

// T258 — `seed:demo` planı (DB'siz): determinizm, dönem/kohort dağılımı, Eylül
// liderliği ve ödül uygunluğu, rozet anahtarlarının katalogda olması, XP'nin
// sunucu kuralıyla aynılığı ve üretim kapısı. Gerçek kişi verisi yoktur.

const NOW = DEMO_NOW;
const plan = buildDemoPlan({ now: NOW });

function leaderboardRowsFor(simId: SimId): ReturnType<typeof buildLeaderboardRows> {
  const users = plan.users.filter((user) => user.status === "active" && user.simAccess.includes(simId));
  const profiles = new Map(
    plan.profiles.filter((profile) => profile.simId === simId).map((profile) => [
      profile.userId,
      { xp: profile.xp, level: profile.level },
    ]),
  );
  const attempts = plan.attempts
    .filter((attempt) => attempt.simId === simId && attempt.mode === "assessment")
    .map((attempt) => ({
      userId: attempt.userId,
      simId,
      finishedAt: attempt.finishedAt,
      score: attempt.score,
    }));
  return buildLeaderboardRows({
    viewerUserId: users[0]!.id,
    peers: users.map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      unitCode: user.unitCode,
      public: user.leaderboardVisible,
    })),
    profiles,
    attempts,
    simId,
    period: "month",
    cohort: "all",
    at: NOW,
  });
}

describe("seed:demo — deterministik plan", () => {
  it("aynı tohum ve an ile bit bit aynı planı üretir; farklı tohum farklı veri verir", () => {
    const first = buildDemoPlan({ now: NOW });
    const second = buildDemoPlan({ now: NOW });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const other = buildDemoPlan({ now: NOW, seed: DEMO_SEED + 1 });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
  });

  it("öğrenciler dönemlere dağılır; kohort birim kodundan türetilir", () => {
    const students = plan.users.filter((user) => user.kind === "student");
    expect(students).toHaveLength(180);
    for (const cohort of [1, 2, 3, 4, 5, 6]) {
      const cohortStudents = students.filter((user) => user.unitCode === `${cohort}-sinif`);
      expect(cohortStudents).toHaveLength(30);
      expect(cohortStudents.every((user) => cohortFromUnitCode(user.unitCode) === cohort)).toBe(true);
    }
    const residents = plan.users.filter((user) => user.kind === "resident");
    expect(residents).toHaveLength(6);
    expect(residents.every((user) => user.roles.includes("uzmanlik_ogrencisi"))).toBe(true);
    expect(cohortFromUnitCode(residents[0]!.unitCode)).toBeNull();
    const faculty = plan.users.filter((user) => user.kind === "faculty");
    expect(faculty).toHaveLength(4);
    expect(faculty.every((user) => user.roles.includes("ogretim_uyesi"))).toBe(true);
  });

  it("kullanıcı adları demo. önekli, e-postalar example.edu.tr; durumlar karışık", () => {
    expect(plan.users.every((user) => user.username.startsWith(DEMO_USERNAME_PREFIX))).toBe(true);
    expect(plan.users.every((user) => user.email === null || user.email.endsWith("@example.edu.tr"))).toBe(true);
    expect(plan.users.filter((user) => user.status === "suspended")).toHaveLength(6);
    expect(plan.users.filter((user) => user.status === "deleted")).toHaveLength(2);
    expect(plan.users.filter((user) => !user.leaderboardVisible)).toHaveLength(10);
    const activeLogins = plan.users.filter((user) => user.status === "active");
    expect(activeLogins.every((user) => user.lastLoginAt !== null && user.lastLoginAt! >= NOW - 30 * 86_400_000)).toBe(true);
  });

  it("Eylül liderliği her simde en az 30 kişilik; ödüle uygun en az 5 kişi var", () => {
    const hiddenIds = new Set(plan.users.filter((user) => !user.leaderboardVisible).map((user) => user.id));
    for (const simId of SIM_IDS) {
      const rows = leaderboardRowsFor(simId);
      expect(rows.filter((row) => row.rank !== null).length, `${simId} Eylül liderliği`).toBeGreaterThanOrEqual(30);
      // T295: anonim demo hesapları hiçbir liderlik satırında yer almaz.
      expect(rows.some((row) => hiddenIds.has(row.userId)), `${simId} anonim satır`).toBe(false);
      expect(rows.every((row) => row.isPublic)).toBe(true);
      const reward = REWARD_SEED.find((item) => item.simId === simId)!.reward;
      const standings = rewardStandings(
        rows.map((row) => ({
          id: row.userId,
          cohort: row.cohort,
          public: row.isPublic,
          periodScore: row.periodScore,
          attemptsCount: row.attemptsCount,
          reachedAt: row.reachedAt,
        })),
        reward,
      );
      expect(
        standings.rows.filter((row) => row.reason === "eligible").length,
        `${simId} ödüle uygun`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("rozet anahtarları sim kataloğunda geçerlidir", () => {
    for (const simId of SIM_IDS) {
      expect(SIM_BADGE_EVALUATORS[simId]!.badgeIds.length).toBeGreaterThan(0);
      expect(plan.badges.some((badge) => badge.simId === simId)).toBe(true);
    }
    for (const badge of plan.badges) {
      expect(SIM_BADGE_EVALUATORS[badge.simId]!.badgeIds, badge.badgeKey).toContain(badge.badgeKey);
    }
  });

  it("deneme XP'si sunucu kuralına, profil XP'si deneme+öğrenme toplamına eşittir", () => {
    for (const attempt of plan.attempts.filter((_, index) => index % 37 === 0)) {
      expect(attempt.xp).toBe(
        serverAttemptXp({
          mode: attempt.mode,
          caseCount: attempt.caseCount,
          hintsUsed: attempt.hintsUsed,
          score: attempt.score,
          maxScore: attempt.maxScore,
          passed: attempt.passed,
        }),
      );
    }
    for (const profile of plan.profiles) {
      const attemptXpTotal = plan.attempts
        .filter((attempt) => attempt.userId === profile.userId && attempt.simId === profile.simId)
        .reduce((sum, attempt) => sum + attempt.xp, 0);
      const learnXpTotal =
        plan.learn.filter((entry) => entry.userId === profile.userId && entry.simId === profile.simId).length *
        DEFAULT_RULES.xp.learnTopicFirstView;
      expect(profile.xp).toBe(attemptXpTotal + learnXpTotal);
      expect(profile.level).toBe(levelForXp(profile.xp, DEFAULT_RULES).level);
    }
  });
});

describe("seed:demo — üretim kapısı", () => {
  it("üretimde hiçbir sorgu çalıştırmadan reddeder", async () => {
    let queries = 0;
    const query: DemoDb["query"] = async () => {
      queries += 1;
      return { rows: [], rowCount: 0 };
    };
    const db: DemoDb = { query, transaction: (work) => work(query) };
    await expect(
      seedDemoDatabase(db, { nodeEnv: "production", institutionCode: "egemed-test", now: NOW }),
    ).rejects.toThrow(/üretim/);
    expect(queries).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  LEARN_TOPIC_PATTERN,
  authMeResponseSchema,
  gamiAllResponseSchema,
  gamiLeaderboardQuerySchema,
  gamiLeaderboardResponseSchema,
  gamiSimIdParamSchema,
  gamiSummaryResponseSchema,
  learnRecordResponseSchema,
  learnWriteRequestSchema,
} from "../../packages/contracts/src/index";

const INSTITUTION = "00000000-0000-4000-8000-000000000010";
const STUDENT = "00000000-0000-4000-8000-000000000002";

const simSummary = () => ({
  simId: "pulse",
  xp: 1450,
  level: 4,
  streak: { current: 3, best: 7, lastDate: "2026-09-22" },
  weeklyGoal: { targetXp: 300, currentXp: 120 },
  badges: [{ key: "ritim-ustasi", awardedAt: "2026-09-20T10:15:00.000+03:00" }],
  leaderboard: { rank: 5, total: 42 },
  attempts: [
    {
      attemptNo: 2,
      finishedAt: "2026-09-22T14:05:00.000+03:00",
      score: 80,
      maxScore: 100,
      passed: true,
    },
  ],
});


describe("GET /auth/me yanıtı", () => {
  const authMe = () => ({
    data: {
      id: STUDENT,
      displayName: "Örnek Öğrenci",
      roles: [{ role: "kullanici" }],
      institution: { id: INSTITUTION, name: "Örnek Kurum" },
      simAccess: ["pulse", "opaca"],
    },
  });

  it("iki rol örneğini kabul eder", () => {
    expect(authMeResponseSchema.safeParse(authMe()).success).toBe(true);
    const admin = authMe();
    admin.data.roles = [{ role: "admin" }];
    expect(authMeResponseSchema.safeParse(admin).success).toBe(true);
    expect(authMeResponseSchema.safeParse({ data: { ...authMe().data, roles: [] } }).success).toBe(false);
  });

  it("eşleme anahtarını ve opak aktör kimliğini yanıtta reddeder", () => {
    const withUsername = { data: { ...authMe().data, username: "ornek.ogrenci" } };
    expect(authMeResponseSchema.safeParse(withUsername).success).toBe(false);
    const withActor = { data: { ...authMe().data, xapiActorId: "opak-aktör-0001" } };
    expect(authMeResponseSchema.safeParse(withActor).success).toBe(false);
  });
});

describe("GET /me/gamification/:simId yanıtı", () => {
  it("sim özetini kabul eder; null ölçüm alanları geçerlidir", () => {
    const parsed = gamiSummaryResponseSchema.safeParse({ data: simSummary() });
    expect(parsed.success).toBe(true);
    const nulls = {
      ...simSummary(),
      streak: { ...simSummary().streak, lastDate: null },
      attempts: [
        {
          attemptNo: 1,
          finishedAt: "2026-09-21T10:00:00.000+03:00",
          score: null,
          maxScore: null,
          passed: null,
        },
      ],
    };
    expect(gamiSummaryResponseSchema.safeParse({ data: nulls }).success).toBe(true);
  });

  it("ham yanıt alanlarını ve bilinmeyen simi reddeder", () => {
    expect(
      gamiSummaryResponseSchema.safeParse({ data: { ...simSummary(), rawAnswers: ["a", "b"] } }).success,
    ).toBe(false);
    expect(gamiSummaryResponseSchema.safeParse({ data: { ...simSummary(), simId: "kalp" } }).success).toBe(false);
    expect(
      gamiSummaryResponseSchema.safeParse({
        data: { ...simSummary(), weeklyGoal: { targetXp: 300, currentXp: -60 } },
      }).success,
    ).toBe(false);
    expect(gamiSimIdParamSchema.safeParse("ausculta").success).toBe(true);
    expect(gamiSimIdParamSchema.safeParse("kalp").success).toBe(false);
  });

  it("üç simin ayrı özetini kabul eder; birleştirme ve tekrar reddedilir", () => {
    const sims = [
      simSummary(),
      { ...simSummary(), simId: "ausculta" },
      { ...simSummary(), simId: "opaca" },
    ];
    expect(gamiAllResponseSchema.safeParse({ data: { sims } }).success).toBe(true);
    expect(gamiAllResponseSchema.safeParse({ data: { sims: [...sims, simSummary()] } }).success).toBe(false);
    expect(gamiAllResponseSchema.safeParse({ data: { sims: [simSummary(), simSummary()] } }).success).toBe(false);
    expect(gamiAllResponseSchema.safeParse({ data: { sims, totalXp: 4200 } }).success).toBe(false);
  });
});

describe("GET /me/gamification/:simId/leaderboard yanıtı", () => {
  const leaderboard = () => ({
    data: {
      period: "month",
      cohort: "all",
      generatedAt: "2026-09-24T10:00:00.000+03:00",
      isDemo: false,
      rows: [
        {
          id: "peer-1",
          displayName: "MK",
          isMe: false,
          isPublic: true,
          cohort: 5,
          periodScore: 92.5,
          attemptsCount: 2,
          reachedAt: "2026-09-22T14:05:00.000+03:00",
          totalXp: 9999,
          level: 9,
          rank: 1,
        },
        {
          id: "me",
          displayName: "AV",
          isMe: true,
          isPublic: true,
          cohort: 3,
          periodScore: 70,
          attemptsCount: 2,
          reachedAt: "2026-09-22T14:05:00.000+03:00",
          totalXp: 1450,
          level: 4,
          rank: 2,
        },
      ],
    },
    meta: { page: 1, pageSize: 50, total: 2 },
  });

  it("liderlik tablosu yanıtını kabul eder", () => {
    expect(gamiLeaderboardResponseSchema.safeParse(leaderboard()).success).toBe(true);
  });

  it("isDemo true veya bilinmeyen alanları reddeder", () => {
    const demo = {
      ...leaderboard(),
      data: { ...leaderboard().data, isDemo: true },
    };
    expect(gamiLeaderboardResponseSchema.safeParse(demo).success).toBe(false);
    expect(
      gamiLeaderboardResponseSchema.safeParse({ ...leaderboard(), totalXp: 1 }).success,
    ).toBe(false);
  });

  it("sorgu şeması varsayılanları ve kohort filtresini doğrular", () => {
    expect(gamiLeaderboardQuerySchema.parse({})).toEqual({
      period: "month",
      cohort: "all",
      page: 1,
      pageSize: 50,
    });
    expect(gamiLeaderboardQuerySchema.safeParse({ cohort: "7" }).success).toBe(false);
    expect(gamiLeaderboardQuerySchema.parse({ cohort: "3" }).cohort).toBe(3);
  });
});

describe("POST /me/gamification/:simId/attempts gövdesi (A4/ADR-009)", () => {
  it("yalnız puansız öğrenme kaydını kabul eder: tek alan `topic`", () => {
    const parsed = learnWriteRequestSchema.safeParse({ topic: "opaca:topic:finding.pleura" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.topic).toBe("opaca:topic:finding.pleura");
    expect(LEARN_TOPIC_PATTERN.test("pulse:mode:af")).toBe(true);
  });

  it("puanlı deneme alanlarını (skor, özet, mod, zaman) reddeder", () => {
    for (const body of [
      { topic: "pulse:mode:af", score: 80 },
      { topic: "pulse:mode:af", maxScore: 100, passed: true },
      { topic: "pulse:mode:af", summary: { "pulse.streak": 4 } },
      { topic: "pulse:mode:af", mode: "assessment" },
      { topic: "pulse:mode:af", attemptNo: 2 },
      { topic: "pulse:mode:af", startedAt: "2026-09-22T13:40:00.000+03:00", finishedAt: "2026-09-22T14:05:00.000+03:00" },
    ]) {
      const parsed = learnWriteRequestSchema.safeParse(body);
      expect(parsed.success, JSON.stringify(body)).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((issue) => issue.code), JSON.stringify(body)).toContain("unrecognized_keys");
      }
    }
  });

  it("serbest metni ve serbest metin anahtarlarını reddeder", () => {
    for (const topic of ["serbest metin", "OPACA:topic:x", "opaca:topic:ÇĞÜ", "-topic", ""]) {
      expect(learnWriteRequestSchema.safeParse({ topic }).success, topic).toBe(false);
    }
    expect(learnWriteRequestSchema.safeParse({ topic: "x".repeat(121) }).success).toBe(false);
  });

  it("yanıt şeması XP'yi yalnız sunucu alanlarından okur", () => {
    const parsed = learnRecordResponseSchema.safeParse({
      data: {
        simId: "pulse",
        topic: "pulse:mode:af",
        recordedAt: "2026-09-28T12:00:00.000+03:00",
        xpGained: 2,
      },
    });
    expect(parsed.success).toBe(true);
    expect(
      learnRecordResponseSchema.safeParse({
        data: { simId: "pulse", topic: "pulse:mode:af", recordedAt: "2026-09-28T12:00:00.000+03:00", xpGained: -1 },
      }).success,
    ).toBe(false);
  });
});

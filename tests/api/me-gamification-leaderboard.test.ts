import { describe, expect, it } from "vitest";
import { gamiLeaderboardResponseSchema } from "../../packages/contracts/src/index";
import {
  ALI_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  UNIT_CODE,
  createAdminHarness,
  login,
} from "./admin-harness";

const HOUR = 3_600_000;

const LEADERBOARD_SEED = {
  profiles: [
    {
      userId: ALI_ID,
      institutionId: INSTITUTION_ID,
      simId: "pulse" as const,
      xp: 1450,
      level: 4,
      displayName: "Ali Veli",
      unitCode: UNIT_CODE,
      updatedAt: FIXED_NOW - 2 * HOUR,
    },
    {
      userId: MERT_ID,
      institutionId: INSTITUTION_ID,
      simId: "pulse" as const,
      xp: 9999,
      level: 9,
      displayName: "Mert İkinci",
      unitCode: "5-sinif",
      updatedAt: FIXED_NOW - HOUR,
    },
  ],
  attempts: [
    {
      id: "00000000-0000-4000-8000-000000000031",
      userId: ALI_ID,
      simId: "pulse" as const,
      attemptNo: 2,
      startedAt: FIXED_NOW - 2 * HOUR,
      finishedAt: FIXED_NOW - HOUR,
      score: 80,
      maxScore: 100,
      passed: true,
      summary: { xp: 120, ritim: 80 },
    },
    {
      id: "00000000-0000-4000-8000-000000000032",
      userId: ALI_ID,
      simId: "pulse" as const,
      attemptNo: 1,
      startedAt: FIXED_NOW - 8 * HOUR,
      finishedAt: FIXED_NOW - 7 * HOUR,
      score: 60,
      maxScore: 100,
      passed: false,
      summary: { xp: 100, ritim: 60 },
    },
    {
      id: "00000000-0000-4000-8000-000000000033",
      userId: MERT_ID,
      simId: "pulse" as const,
      attemptNo: 1,
      startedAt: FIXED_NOW - 2 * HOUR,
      finishedAt: FIXED_NOW - HOUR,
      score: 95,
      maxScore: 100,
      passed: true,
      summary: { xp: 200, ritim: 95 },
    },
  ],
};

describe("GET /me/gamification/:simId/leaderboard", () => {
  it("oturumsuz istek 401 unauthorized döner", async () => {
    const response = await createAdminHarness({ gamification: LEADERBOARD_SEED }).app.request(
      "/me/gamification/pulse/leaderboard",
    );
    expect(response.status).toBe(401);
  });

  it("baş harf gösterir; tam ad ve e-posta yanıtta yoktur", async () => {
    const harness = createAdminHarness({ gamification: LEADERBOARD_SEED });
    const ali = await login(harness, "ali.veli");
    const response = await harness.app.request("/me/gamification/pulse/leaderboard?period=month&cohort=all", {
      headers: ali.headers,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    const parsed = gamiLeaderboardResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/ali\.veli@|mert@|Ali Veli|Mert İkinci/i);
    const me = parsed.data.data.rows.find((row) => row.isMe);
    expect(me?.displayName).toBe("AV");
    expect(me?.id).toBe("me");
    expect(parsed.data.meta.total).toBe(2);
  });

  it("kohort filtresi yalnız seçili sınıfı döner", async () => {
    const harness = createAdminHarness({ gamification: LEADERBOARD_SEED });
    const ali = await login(harness, "ali.veli");
    const response = await harness.app.request("/me/gamification/pulse/leaderboard?cohort=3", {
      headers: ali.headers,
    });
    expect(response.status).toBe(200);
    const body = gamiLeaderboardResponseSchema.parse(await response.json());
    expect(body.data.cohort).toBe(3);
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0]?.isMe).toBe(true);
    expect(body.meta.total).toBe(1);
  });

  it("sayfalama meta bilgisini döner", async () => {
    const harness = createAdminHarness({ gamification: LEADERBOARD_SEED });
    const ali = await login(harness, "ali.veli");
    const response = await harness.app.request(
      "/me/gamification/pulse/leaderboard?page=1&pageSize=1",
      { headers: ali.headers },
    );
    expect(response.status).toBe(200);
    const body = gamiLeaderboardResponseSchema.parse(await response.json());
    expect(body.data.rows).toHaveLength(1);
    expect(body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
  });

  it("bilinmeyen sim 404 not_found döner", async () => {
    const harness = createAdminHarness({ gamification: LEADERBOARD_SEED });
    const ali = await login(harness, "ali.veli");
    const response = await harness.app.request("/me/gamification/kalp/leaderboard", {
      headers: ali.headers,
    });
    expect(response.status).toBe(404);
  });

  it("geçersiz sorgu 400 invalid_request döner", async () => {
    const harness = createAdminHarness({ gamification: LEADERBOARD_SEED });
    const ali = await login(harness, "ali.veli");
    const response = await harness.app.request("/me/gamification/pulse/leaderboard?cohort=9", {
      headers: ali.headers,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });
});

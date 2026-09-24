import { describe, expect, it } from "vitest";
import {
  attemptWriteRequestSchema,
  gamiAllResponseSchema,
  gamiSummaryResponseSchema,
} from "../../packages/contracts/src/index";
import { WEEKLY_XP_TARGET } from "../../apps/api/src/me/gamification";
import {
  ALI_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  createAdminHarness,
  login,
  type AdminHarness,
} from "./admin-harness";

// T67 — `/me/gamification*` (E3 §d): oturum sahibinin kendi verisi; üç simin
// AYRI özeti; idempotent deneme yazımı ve `.strict()` kodlu özet reddi. DB
// gerekmez; bellek deposu, sabit saat ve sentetik tohum kullanılır.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000030";

const GAMIFICATION_SEED = {
  profiles: [
    {
      userId: ALI_ID,
      institutionId: INSTITUTION_ID,
      simId: "pulse" as const,
      xp: 1450,
      level: 4,
      streak: { current: 3, best: 7, lastDate: "2026-09-22" },
      updatedAt: FIXED_NOW - 2 * HOUR,
    },
    {
      userId: MERT_ID,
      institutionId: INSTITUTION_ID,
      simId: "pulse" as const,
      xp: 9999,
      level: 9,
      updatedAt: FIXED_NOW - HOUR,
    },
    {
      userId: ALI_ID,
      institutionId: INSTITUTION_ID,
      simId: "ausculta" as const,
      xp: 120,
      level: 2,
      updatedAt: FIXED_NOW - HOUR,
    },
  ],
  badges: [
    { userId: ALI_ID, simId: "pulse" as const, key: "ritim-ustasi", awardedAt: FIXED_NOW - 3 * DAY },
    { userId: ALI_ID, simId: "pulse" as const, key: "ilk-adim", awardedAt: FIXED_NOW - 5 * DAY },
    { userId: MERT_ID, simId: "pulse" as const, key: "ritim-ustasi", awardedAt: FIXED_NOW - DAY },
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
      startedAt: FIXED_NOW - 8 * DAY,
      finishedAt: FIXED_NOW - 8 * DAY + HOUR,
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

function harness(): AdminHarness {
  return createAdminHarness({ gamification: GAMIFICATION_SEED });
}

function attemptBody(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    attemptNo: 3,
    startedAt: "2023-11-14T21:40:00.000+03:00",
    finishedAt: "2023-11-14T22:05:00.000+03:00",
    score: 80,
    maxScore: 100,
    passed: true,
    summary: { ritim: 80, tani: 60 },
    ...overrides,
  };
}

/** Program DOM tipleri içermez; yanıt yalnız kullanılan dar yüzeyle okunur. */
interface JsonResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

async function postAttempt(
  harnessUnderTest: AdminHarness,
  headers: Record<string, string>,
  body: unknown,
  simId = "pulse",
): Promise<JsonResponse> {
  return harnessUnderTest.app.request(`/me/gamification/${simId}/attempts`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("yetki ve kendi verisi (E3 §d)", () => {
  it("oturumsuz istek 401 unauthorized döner", async () => {
    const response = await harness().app.request("/me/gamification");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("kullanici kendi özetini okur; başka kurumdaki kullanıcı görünmez", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await testHarness.app.request("/me/gamification/pulse", {
      headers: ali.headers,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { xp: number; leaderboard: { total: number } } };
    expect(body.data.xp).toBe(1450);
    // Liderlik yalnız kendi kurumunu sayar (bellek tohumunda iki profil var).
    expect(body.data.leaderboard.total).toBe(2);
  });

  it("başkasının kimliği parametre veya gövdeyle istenemez", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const viaQuery = await testHarness.app.request(
      `/me/gamification/pulse?userId=${MERT_ID}`,
      { headers: ali.headers },
    );
    expect(((await viaQuery.json()) as { data: { xp: number } }).data.xp).toBe(1450);

    const injected = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      userId: MERT_ID,
    });
    expect(injected.status).toBe(400);
    expect(await injected.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(testHarness.gamificationStore.attempts.has(ATTEMPT_ID)).toBe(false);
  });
});

describe("GET /me/gamification", () => {
  it("üç simin ayrı özetini döner; birleşik puan yok", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await testHarness.app.request("/me/gamification", { headers: ali.headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    const parsed = gamiAllResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    const sims = (body as { data: { sims: readonly { simId: string; xp: number; level: number }[] } })
      .data.sims;
    expect(sims.map((sim) => sim.simId)).toEqual(["pulse", "ausculta", "opaca"]);
    expect(sims.map((sim) => sim.xp)).toEqual([1450, 120, 0]);
    // Profil satırı olmayan sim sıfırlanır; uydurma puan üretilmez.
    expect(sims[2]?.level).toBe(1);
    expect(Object.keys(body as object)).toEqual(["data"]);
  });
});

describe("GET /me/gamification/:simId", () => {
  it("kendi özetini sözleşme şemasıyla döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await testHarness.app.request("/me/gamification/pulse", {
      headers: ali.headers,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    const parsed = gamiSummaryResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    const data = (body as {
      data: {
        xp: number;
        level: number;
        streak: { current: number; best: number; lastDate: string | null };
        weeklyGoal: { targetXp: number; currentXp: number };
        badges: readonly { key: string }[];
        leaderboard: { rank: number; total: number };
        attempts: readonly { attemptNo: number; score: number | null; passed: boolean | null }[];
      };
    }).data;
    expect(data.xp).toBe(1450);
    expect(data.level).toBe(4);
    expect(data.streak).toEqual({ current: 3, best: 7, lastDate: "2026-09-22" });
    // Haftalık XP yalnız bu hafta biten denemenin kodlu özetinden gelir.
    expect(data.weeklyGoal).toEqual({ targetXp: WEEKLY_XP_TARGET, currentXp: 120 });
    expect(data.badges.map((badge) => badge.key)).toEqual(["ritim-ustasi", "ilk-adim"]);
    // MERT'in 9999 XP'i önde; ALI ikinci sıradadır.
    expect(data.leaderboard).toEqual({ rank: 2, total: 2 });
    expect(data.attempts.map((attempt) => [attempt.attemptNo, attempt.score, attempt.passed])).toEqual([
      [2, 80, true],
      [1, 60, false],
    ]);
  });

  it("her oturum yalnız kendi verisini görür", async () => {
    const testHarness = harness();
    const mert = await login(testHarness, "mert.ikinci");
    const response = await testHarness.app.request("/me/gamification/pulse", {
      headers: mert.headers,
    });
    const data = ((await response.json()) as { data: { xp: number; attempts: unknown[] } }).data;
    expect(data.xp).toBe(9999);
    expect(data.attempts).toHaveLength(1);
  });

  it("bilinmeyen sim 404 not_found döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    for (const simId of ["kalp", "PULSE"]) {
      const response = await testHarness.app.request(`/me/gamification/${simId}`, {
        headers: ali.headers,
      });
      expect(response.status, simId).toBe(404);
      expect(await response.json(), simId).toMatchObject({ error: { code: "not_found" } });
    }
  });
});

describe("POST /me/gamification/:simId/attempts", () => {
  it("kodlu özeti yazar ve idempotent tekrarda aynı yanıtı döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const body = attemptBody();
    expect(attemptWriteRequestSchema.safeParse(body).success).toBe(true);

    const created = await postAttempt(testHarness, ali.headers, body);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: { attemptNo: number; summary: unknown } };
    expect(createdBody.data.attemptNo).toBe(3);
    expect(createdBody.data.summary).toEqual({ ritim: 80, tani: 60 });
    expect(testHarness.gamificationStore.attempts.size).toBe(4);

    const repeated = await postAttempt(testHarness, ali.headers, body);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(createdBody);
    expect(testHarness.gamificationStore.attempts.size).toBe(4);

    // Yazım özeti de görünür: yeni deneme artık okuma yanıtındadır.
    const summary = await testHarness.app.request("/me/gamification/pulse", {
      headers: ali.headers,
    });
    const attempts = ((await summary.json()) as { data: { attempts: readonly { attemptNo: number }[] } })
      .data.attempts;
    expect(attempts.map((attempt) => attempt.attemptNo)).toEqual([3, 2, 1]);
  });

  it("aynı id farklı gövdeyle veya aynı attemptNo başka id ile 409 conflict", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    expect((await postAttempt(testHarness, ali.headers, attemptBody())).status).toBe(201);

    const differentBody = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      score: 70,
    });
    expect(differentBody.status).toBe(409);
    expect(await differentBody.json()).toMatchObject({ error: { code: "conflict" } });

    const differentId = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      id: "00000000-0000-4000-8000-000000000034",
    });
    expect(differentId.status).toBe(409);
    expect(testHarness.gamificationStore.attempts.size).toBe(4);
  });

  it("strict gövde: serbest metin, ham yanıt ve fazla alan reddedilir", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const rejected = [
      { ...attemptBody(), answers: ["ham cevap"] },
      { ...attemptBody(), summary: { "serbest metin": "cevap" } },
      { ...attemptBody(), summary: { ritim: "iyi" } },
      { ...attemptBody(), notes: "hasta iyi görünüyordu" },
    ];
    for (const body of rejected) {
      const response = await postAttempt(testHarness, ali.headers, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({
        error: { code: "invalid_request" },
      });
    }
    expect(testHarness.gamificationStore.attempts.size).toBe(3);
  });

  it("puan tutarsızlığı 422 validation_failed döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      score: 120,
      maxScore: 100,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "score_exceeds_max" }] } },
    });
    // Şema `maxScore = 0`ı kabul eder; `gami_attempts` check kısıtı pozitif
    // ister, bu yüzden uç 500 yerine doğrulama hatası döner.
    const zeroMax = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      score: 0,
      maxScore: 0,
    });
    expect(zeroMax.status).toBe(422);
    expect(await zeroMax.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "max_score_positive" }] } },
    });
    expect(testHarness.gamificationStore.attempts.size).toBe(3);
  });

  it("bilinmeyen sim 404, oturumsuz 401, CSRF'siz 403 döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    expect((await postAttempt(testHarness, ali.headers, attemptBody(), "kalp")).status).toBe(404);
    expect((await postAttempt(testHarness, {}, attemptBody())).status).toBe(401);
    const withoutCsrf = await postAttempt(testHarness, { cookie: ali.headers["cookie"] ?? "" }, attemptBody());
    expect(withoutCsrf.status).toBe(403);
    expect(testHarness.gamificationStore.attempts.size).toBe(3);
  });
});

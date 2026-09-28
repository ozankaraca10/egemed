import { describe, expect, it } from "vitest";
import {
  attemptWriteRequestSchema,
  gamiAllResponseSchema,
  gamiSummaryResponseSchema,
  type SimId,
} from "../../packages/contracts/src/index";
import { WEEKLY_XP_TARGET, createPgGamificationRepo, levelForXpClosedForm, nextStreak } from "../../apps/api/src/me/gamification";
import { DEFAULT_RULES, levelForXp } from "../../packages/gamification-core/src/index";
import { encodeAuscultaSummary, encodeOpacaSummary, encodePulseSummary } from "../../packages/gami-catalogs/src/index";
import {
  ALI_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  DEFAULT_USERS,
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
      xp: 120,
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
      xp: 100,
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
      xp: 200,
      summary: { xp: 200, ritim: 95 },
    },
  ],
};

/** `access` verilirse ilgili kullanıcıların sim erişimi değiştirilir (API-03). */
function harness(access: Readonly<Record<string, readonly SimId[]>> = {}): AdminHarness {
  const users = DEFAULT_USERS.map((entry) => (access[entry.id] === undefined ? entry : { ...entry, simAccess: access[entry.id] ?? [] }));
  return createAdminHarness({ gamification: GAMIFICATION_SEED, users });
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
    // Kabuğun genel kodları (`codedAttemptSummary`); T149'dan beri diğer kodlar `<simId>.` önekli olmalı.
    summary: { score: 80, correct: 8, total: 10 },
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
  it("öğretim üyesi deneme yazamaz (403 role_not_permitted); özetini okuyabilir (26 Eyl 2026)", async () => {
    const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, roles: ["ogretim_uyesi" as const] } : entry));
    const testHarness = createAdminHarness({ gamification: GAMIFICATION_SEED, users });
    const ali = await login(testHarness, "ali.veli");
    const write = await postAttempt(testHarness, ali.headers, attemptBody());
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    const read = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    expect(read.status).toBe(200);
  });

  it("uzmanlık öğrencisi deneme yazamaz (403 role_not_permitted); özetini okuyabilir (T219)", async () => {
    const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, roles: ["uzmanlik_ogrencisi" as const] } : entry));
    const testHarness = createAdminHarness({ gamification: GAMIFICATION_SEED, users });
    const ali = await login(testHarness, "ali.veli");
    const write = await postAttempt(testHarness, ali.headers, attemptBody());
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    expect(testHarness.gamificationStore.attempts.has(ATTEMPT_ID)).toBe(false);
    const read = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    expect(read.status).toBe(200);
  });

  it("liderlik sorgusu öğretim üyesi ve uzmanlık öğrencisini dışlar (T184/T219)", async () => {
    const queries: string[] = [];
    const repo = createPgGamificationRepo({
      query: (text) => {
        queries.push(text);
        return Promise.resolve({ rows: [] });
      },
    });
    await repo.getLeaderboard({
      at: FIXED_NOW,
      cohort: "all",
      institutionId: INSTITUTION_ID,
      page: 1,
      pageSize: 20,
      period: "month",
      simId: "pulse",
      userId: ALI_ID,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("r.role in ('ogretim_uyesi', 'uzmanlik_ogrencisi')");
  });

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
  it("yalnız erişim verilen simlerin ayrı özetini döner; birleşik puan yok (API-03)", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await testHarness.app.request("/me/gamification", { headers: ali.headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    const parsed = gamiAllResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    const sims = (body as { data: { sims: readonly { simId: string; xp: number; level: number }[] } })
      .data.sims;
    // ALI'nin yalnız Pulse erişimi var; diğer simlerin verisi (ör. Ausculta 120 XP) dönmez.
    expect(sims.map((sim) => sim.simId)).toEqual(["pulse"]);
    expect(sims.map((sim) => sim.xp)).toEqual([1450]);
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
    const testHarness = harness({ [MERT_ID]: ["pulse"] });
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
    expect(createdBody.data.summary).toEqual({ score: 80, correct: 8, total: 10 });
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

  it("negatif özet ve ters zaman reddedilir; GET yanıtı kendi şemasını sağlar", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const negative = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      summary: { xp: -100, ritim: 80 },
    });
    expect(negative.status).toBe(400);
    const inverted = await postAttempt(testHarness, ali.headers, {
      ...attemptBody(),
      startedAt: "2023-11-14T22:05:00.000+03:00",
      finishedAt: "2023-11-14T21:40:00.000+03:00",
    });
    expect(inverted.status).toBe(400);
    expect(testHarness.gamificationStore.attempts.size).toBe(3);

    const summary = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    const summaryBody = await summary.json();
    const parsedSummary = gamiSummaryResponseSchema.safeParse(summaryBody);
    if (!parsedSummary.success) expect.unreachable(JSON.stringify(parsedSummary.error.issues));
    expect(parsedSummary.data.data.weeklyGoal.currentXp).toBeGreaterThanOrEqual(0);

    const all = await testHarness.app.request("/me/gamification", { headers: ali.headers });
    const allBody = await all.json();
    const parsedAll = gamiAllResponseSchema.safeParse(allBody);
    if (!parsedAll.success) expect.unreachable(JSON.stringify(parsedAll.error.issues));
    for (const sim of parsedAll.data.data.sims) {
      expect(sim.weeklyGoal.currentXp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("sim erişim yetkisi ve deneme kapsamı (API-03/API-04)", () => {
  it("erişimi olmayan sim için okuma, liderlik ve yazma 403 forbidden döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    for (const path of ["/me/gamification/opaca", "/me/gamification/opaca/leaderboard"]) {
      const response = await testHarness.app.request(path, { headers: ali.headers });
      expect(response.status, path).toBe(403);
      expect(await response.json(), path).toMatchObject({ error: { code: "forbidden" } });
    }
    const write = await testHarness.app.request("/me/gamification/opaca/attempts", {
      method: "POST",
      headers: { ...ali.headers, "content-type": "application/json" },
      body: JSON.stringify(attemptBody()),
    });
    expect(write.status).toBe(403);
  });

  it("aynı deneme kimliği başka sime yazılırsa 409; aynı sime tekrar 200 ve yol simId'si döner", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const post = (simId: SimId) =>
      testHarness.app.request(`/me/gamification/${simId}/attempts`, {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(attemptBody()),
      });
    expect((await post("pulse")).status).toBe(201);
    const again = await post("pulse");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ data: { simId: "pulse" } });
    const crossSim = await post("opaca");
    expect(crossSim.status).toBe(409);
    expect(await crossSim.json()).toMatchObject({ error: { code: "conflict" } });
  });

  it("başka kullanıcının deneme kimliği idempotent tekrar sayılmaz (409)", async () => {
    const testHarness = harness({ [MERT_ID]: ["pulse"] });
    const ali = await login(testHarness, "ali.veli");
    const mert = await login(testHarness, "mert.ikinci");
    const post = (headers: Record<string, string>) =>
      testHarness.app.request("/me/gamification/pulse/attempts", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(attemptBody()),
      });
    expect((await post(ali.headers)).status).toBe(201);
    expect((await post(mert.headers)).status).toBe(409);
  });
});

describe("sunucu yetkili XP, düzey ve seri (API-05)", () => {
  it("kapalı biçim düzey formülü levelForXp ile her XP'de aynıdır", () => {
    for (let xp = 0; xp <= 60_000; xp += 7) {
      expect(levelForXpClosedForm(xp), String(xp)).toBe(levelForXp(xp, DEFAULT_RULES).level);
    }
    for (let level = 1; level <= 40; level += 1) {
      const start = (DEFAULT_RULES.level.unitXp * (level - 1) * level) / 2;
      expect(levelForXpClosedForm(start), `sınır ${start}`).toBe(level);
      if (start > 0) expect(levelForXpClosedForm(start - 1), `sınır-1 ${start}`).toBe(level - 1);
    }
  });

  it("seri: aynı gün değişmez, ertesi gün artar, boşlukta 1'e döner, geç gelen eski gün etkisiz", () => {
    const start = { current: 0, best: 0, lastDate: null };
    const d1 = nextStreak(start, "2026-09-20");
    expect(d1).toEqual({ current: 1, best: 1, lastDate: "2026-09-20" });
    expect(nextStreak(d1, "2026-09-20")).toEqual(d1);
    const d2 = nextStreak(d1, "2026-09-21");
    expect(d2).toEqual({ current: 2, best: 2, lastDate: "2026-09-21" });
    expect(nextStreak(d2, "2026-09-19")).toEqual(d2);
    expect(nextStreak(d2, "2026-09-24")).toEqual({ current: 1, best: 2, lastDate: "2026-09-24" });
  });

  it("XP istemci özetinden değil sunucu kuralından gelir; profil oluşur, tekrar XP'yi çoğaltmaz", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const post = () =>
      testHarness.app.request("/me/gamification/opaca/attempts", {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(
          attemptBody({ caseCount: 10, maxScore: 100, mode: "assessment", score: 80, summary: { score: 80, "opaca.xp": 999_999 } }),
        ),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const summary = await testHarness.app.request("/me/gamification/opaca", { headers: ali.headers });
    const data = ((await summary.json()) as { data: { xp: number; level: number; streak: { current: number } } }).data;
    // assessment: 10 vaka × 10 XP + 80 eşiği bonusu 20 = 120 XP (özetteki 999999 yok sayılır).
    expect(data.xp).toBe(120);
    expect(data.level).toBe(levelForXp(120, DEFAULT_RULES).level);
    expect(data.streak.current).toBe(1);
  });
});

describe("liderlik tablosuna katılım tercihi (opt-out)", () => {
  it("varsayılan görünür; PATCH ile çıkan kullanıcı başkalarının listesinde yoktur, kendi satırını görür", async () => {
    const testHarness = harness({ [MERT_ID]: ["pulse"] });
    const ali = await login(testHarness, "ali.veli");
    const mert = await login(testHarness, "mert.ikinci");
    const prefs = await testHarness.app.request("/me/preferences", { headers: ali.headers });
    expect(await prefs.json()).toEqual({ data: { leaderboardVisible: true } });
    const rowsFor = async (headers: Record<string, string>) => {
      const response = await testHarness.app.request("/me/gamification/pulse/leaderboard?period=academic_year&cohort=all", { headers });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { rows: readonly { isMe: boolean }[] }; meta: { total: number } };
      return body;
    };
    const before = await rowsFor(mert.headers);
    const patch = await testHarness.app.request("/me/preferences", {
      method: "PATCH",
      headers: { ...ali.headers, "content-type": "application/json" },
      body: JSON.stringify({ leaderboardVisible: false }),
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toEqual({ data: { leaderboardVisible: false } });
    const after = await rowsFor(mert.headers);
    expect(after.meta.total).toBe(before.meta.total - 1);
    const own = await rowsFor(ali.headers);
    expect(own.data.rows.some((row) => row.isMe)).toBe(true);
  });

  it("gövde katı şemadır; bilinmeyen alan 400 döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const response = await testHarness.app.request("/me/preferences", {
      method: "PATCH",
      headers: { ...ali.headers, "content-type": "application/json" },
      body: JSON.stringify({ leaderboardVisible: false, displayName: "x" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("sunucu rozet değerlendirmesi (ADR-008)", () => {
  it("Pulse denemesinin kodlu özetinden rozetler sunucuda verilir; tekrar rozet çoğaltmaz", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const summary = encodePulseSummary({
      score: 90,
      extra: { ecgMode: "af", modeMastered: true, correctlyReadLeads: 3, caliperAccurate: null, rhythmRecognitionStreak: 4 },
    });
    const post = () =>
      testHarness.app.request("/me/gamification/pulse/attempts", {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(attemptBody({ summary })),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const response = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    const keys = ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(keys).toContain("rhythm-streak-3");
    expect(keys).toContain("mode-af");
    expect(keys).not.toContain("rhythm-streak-10");
    expect(keys.filter((key) => key === "mode-af")).toHaveLength(1);
  });

  it("Opaca denemesinin kodlu özetinden rozetler sunucuda verilir; tekrar rozet çoğaltmaz", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const summary = encodeOpacaSummary({
      mode: "assessment",
      finishedAt: "2026-09-24T09:00:00.000Z",
      score: 100,
      caseCount: 10,
      hintsUsed: 0,
      extra: {
        localizationHits: 10,
        abcdeComplete: 1,
        qualityCorrect: 2,
        interpretationCorrect: 3,
        fastPerfect: true,
        topicCorrect: { pleura: 2 },
      },
      learn: { topicsCount: 2, stacksCount: 0, libraryTopicsTotal: 30, libraryTopicsCovered: 1 },
    });
    const post = () =>
      testHarness.app.request("/me/gamification/opaca/attempts", {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(attemptBody({ summary })),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const response = await testHarness.app.request("/me/gamification/opaca", { headers: ali.headers });
    const keys = ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(keys).toContain("first-step");
    expect(keys).toContain("threshold");
    expect(keys).toContain("perfect");
    expect(keys).toContain("sharp-eye-1");
    expect(keys).toContain("systematic");
    expect(keys).toContain("fast-accurate");
    expect(keys).not.toContain("sharp-eye-2");
    expect(keys).not.toContain("pleura");
    expect(keys).not.toContain("podium");
    expect(keys.filter((key) => key === "first-step")).toHaveLength(1);
  });

  it("Ausculta denemesinin kodlu özetinden rozetler sunucuda verilir; tekrar rozet çoğaltmaz", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "ausculta"] });
    const ali = await login(testHarness, "ali.veli");
    const summary = encodeAuscultaSummary({
      listenDisciplineCases: 3,
      systematicExams: 1,
      cardiacFociExams: 5,
      posteriorLungExams: 5,
      heartCorrect: { normal: 3, extraSounds: 3, murmurTiming: 5, rhythm: 3 },
      lungCorrect: { vesicular: 3, continuous: 5, crackles: 5, pleuralRub: 3 },
      pediatricCorrect: 5,
      mixedCorrect: 3,
      headChoiceCorrect: 5,
      correctDiagnosisCount: 3,
    });
    const post = () =>
      testHarness.app.request("/me/gamification/ausculta/attempts", {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(attemptBody({ summary })),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    const response = await testHarness.app.request("/me/gamification/ausculta", { headers: ali.headers });
    const keys = ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(keys).toContain("listen-3");
    expect(keys).toContain("systematic-1");
    expect(keys).toContain("cardiac-foci");
    expect(keys).toContain("posterior-lung");
    expect(keys).toContain("heart-normal");
    expect(keys).toContain("lung-continuous");
    expect(keys).toContain("mixed-sounds");
    expect(keys).toContain("diagnosis-3");
    expect(keys).not.toContain("listen-8");
    expect(keys).not.toContain("systematic-5");
    expect(keys.filter((key) => key === "diagnosis-3")).toHaveLength(1);
  });
});

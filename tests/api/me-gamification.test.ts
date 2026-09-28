import { describe, expect, it } from "vitest";
import {
  gamiAllResponseSchema,
  gamiSummaryResponseSchema,
  learnRecordResponseSchema,
  type SimId,
} from "../../packages/contracts/src/index";
import {
  WEEKLY_XP_TARGET,
  createPgGamificationRepo,
  levelForXpClosedForm,
  nextStreak,
  type GamiAttemptInput,
} from "../../apps/api/src/me/gamification";
import { DEFAULT_RULES, levelForXp } from "../../packages/gamification-core/src/index";
import { encodeAuscultaSummary, encodeOpacaSummary, encodePulseSummary } from "../../packages/gami-catalogs/src/index";
import { opaca as assessmentBankOpaca } from "../../packages/assessment-bank/src/index";
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

// T67 + A4 (ADR-009) — `/me/gamification*` (E3 §d): oturum sahibinin kendi
// verisi; üç simin AYRI özeti. `POST /me/gamification/:simId/attempts` artık
// PUANLI deneme kabul etmez (403 `server_scored`); yalnız puansız öğrenme
// kaydı (`{ topic }`) yazılır, XP sabit sunucu kuralından gelir. DB gerekmez;
// bellek deposu, sabit saat ve sentetik tohum kullanılır.

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

/** A4: eski puanlı deneme gövdesi; uç artık 403 `server_scored` döndürür. */
function scoredAttemptBody(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    attemptNo: 3,
    startedAt: "2023-11-14T21:40:00.000+03:00",
    finishedAt: "2023-11-14T22:05:00.000+03:00",
    score: 80,
    maxScore: 100,
    passed: true,
    summary: { score: 80, correct: 8, total: 10 },
    ...overrides,
  };
}

/** Program DOM tipleri içermez; yanıt yalnız kullanılan dar yüzeyle okunur. */
interface JsonResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

async function postWrite(
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

/** Sunucu oturumunun deneme yazımı (A1/A4): puanlı yol YALNIZ buradan geçer. */
function serverAttemptInput(overrides: Partial<GamiAttemptInput> = {}): GamiAttemptInput {
  return {
    id: ATTEMPT_ID,
    userId: ALI_ID,
    simId: "opaca",
    attemptNo: 1,
    startedAt: FIXED_NOW - 2 * HOUR,
    finishedAt: FIXED_NOW - HOUR,
    score: 80,
    maxScore: 100,
    passed: true,
    summary: { score: 80, correct: 8, total: 10 },
    createdAt: FIXED_NOW,
    institutionId: INSTITUTION_ID,
    mode: "assessment",
    caseCount: 10,
    hintsUsed: 0,
    ...overrides,
  };
}

describe("yetki ve kendi verisi (E3 §d)", () => {
  it("öğretim üyesi deneme yazamaz (403 role_not_permitted); özetini okuyabilir (26 Eyl 2026)", async () => {
    const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, roles: ["ogretim_uyesi" as const] } : entry));
    const testHarness = createAdminHarness({ gamification: GAMIFICATION_SEED, users });
    const ali = await login(testHarness, "ali.veli");
    const write = await postWrite(testHarness, ali.headers, scoredAttemptBody());
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    const read = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    expect(read.status).toBe(200);
  });

  it("uzmanlık öğrencisi deneme yazamaz (403 role_not_permitted); özetini okuyabilir (T219)", async () => {
    const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, roles: ["uzmanlik_ogrencisi" as const] } : entry));
    const testHarness = createAdminHarness({ gamification: GAMIFICATION_SEED, users });
    const ali = await login(testHarness, "ali.veli");
    const write = await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af" });
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    expect(testHarness.gamificationStore.learn.size).toBe(0);
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

    const injected = await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af", userId: MERT_ID });
    expect(injected.status).toBe(400);
    expect(await injected.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(testHarness.gamificationStore.learn.size).toBe(0);
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
    // Haftalık XP yalnız bu hafta biten denemenin sunucu XP'sinden gelir.
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

describe("POST /me/gamification/:simId/attempts — puanlı yol kapalı (A4/ADR-009)", () => {
  it("practice/assessment/challenge gövdeleri 403 server_scored döner; hiçbir kayıt yazılmaz", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const bodies: Record<string, unknown>[] = [
      scoredAttemptBody(),
      { ...scoredAttemptBody(), mode: "practice" },
      { ...scoredAttemptBody(), mode: "assessment" },
      { ...scoredAttemptBody(), mode: "challenge" },
    ];
    for (const body of bodies) {
      const response = await postWrite(testHarness, ali.headers, body);
      expect(response.status, JSON.stringify(body)).toBe(403);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({ error: { code: "server_scored" } });
    }
    // Modsuz ama skor taşıyan eski gövde de puanlı sayılır.
    const legacy = await postWrite(testHarness, ali.headers, {
      ...scoredAttemptBody(),
      mode: undefined,
    });
    expect(legacy.status).toBe(403);
    expect(await legacy.json()).toMatchObject({ error: { code: "server_scored" } });
    expect(testHarness.gamificationStore.attempts.size).toBe(3);
    expect(testHarness.gamificationStore.learn.size).toBe(0);
  });

  it("puansız öğrenme kaydı 201 kabul edilir; tekrarı 200 ve yeni XP üretmez", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const created = await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af" });
    expect(created.status).toBe(201);
    const body = await created.json();
    const parsed = learnRecordResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    expect(parsed.data.data).toMatchObject({
      simId: "pulse",
      topic: "pulse:topic:af",
      xpGained: DEFAULT_RULES.xp.learnTopicFirstView,
    });
    expect(testHarness.gamificationStore.learn.size).toBe(1);

    const repeated = await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af" });
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ data: { topic: "pulse:topic:af", xpGained: 0 } });
    expect(testHarness.gamificationStore.learn.size).toBe(1);
  });

  it("öğrenme kaydı XP'yi yalnız sunucu kuralından alır; seri ve deneme saymaz", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    expect((await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af" })).status).toBe(201);
    expect((await postWrite(testHarness, ali.headers, { topic: "pulse:topic:svt" })).status).toBe(201);
    const summary = await testHarness.app.request("/me/gamification/pulse", { headers: ali.headers });
    const data = ((await summary.json()) as { data: { xp: number; level: number; streak: { current: number; best: number; lastDate: string | null }; attempts: unknown[]; weeklyGoal: { currentXp: number } } }).data;
    // 1450 + 2 × 2 XP; istemci hiçbir XP/doğru sayısı bildirmez.
    expect(data.xp).toBe(1450 + 2 * DEFAULT_RULES.xp.learnTopicFirstView);
    expect(data.level).toBe(levelForXp(data.xp, DEFAULT_RULES).level);
    // Öğrenme kaydı seri üretmez ve deneme listesine girmez.
    expect(data.streak).toEqual({ current: 3, best: 7, lastDate: "2026-09-22" });
    expect(data.attempts).toHaveLength(2);
    // Haftalık hedef deneme XP'sini sayar; öğrenme kaydı eklenmez (A4 kuralı).
    expect(data.weeklyGoal.currentXp).toBe(120);
  });

  it("strict gövde: serbest metin ve fazla alan reddedilir", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const rejected = [
      { topic: "serbest metin" },
      { topic: "pulse:topic:af", answers: ["ham cevap"] },
      { topic: "pulse:topic:af", xp: 999_999 },
      { topic: "" },
    ];
    for (const body of rejected) {
      const response = await postWrite(testHarness, ali.headers, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({
        error: { code: "invalid_request" },
      });
    }
    expect(testHarness.gamificationStore.learn.size).toBe(0);
  });

  it("bilinmeyen sim 404, oturumsuz 401, CSRF'siz 403 döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    expect((await postWrite(testHarness, ali.headers, { topic: "pulse:topic:af" }, "kalp")).status).toBe(404);
    expect((await postWrite(testHarness, {}, { topic: "pulse:topic:af" })).status).toBe(401);
    const withoutCsrf = await postWrite(testHarness, { cookie: ali.headers["cookie"] ?? "" }, { topic: "pulse:topic:af" });
    expect(withoutCsrf.status).toBe(403);
    expect(testHarness.gamificationStore.learn.size).toBe(0);
  });
});

describe("sim erişim yetkisi ve yazım kapsamı (API-03/API-04)", () => {
  it("erişimi olmayan sim için okuma, liderlik ve yazma 403 forbidden döner", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    for (const path of ["/me/gamification/opaca", "/me/gamification/opaca/leaderboard"]) {
      const response = await testHarness.app.request(path, { headers: ali.headers });
      expect(response.status, path).toBe(403);
      expect(await response.json(), path).toMatchObject({ error: { code: "forbidden" } });
    }
    const learnWrite = await postWrite(testHarness, ali.headers, { topic: "opaca:topic:finding.pleura" }, "opaca");
    expect(learnWrite.status).toBe(403);
    // Puanlı gövde de erişim kapısına takılır (gövde hiç okunmaz).
    const scoredWrite = await postWrite(testHarness, ali.headers, scoredAttemptBody(), "opaca");
    expect(scoredWrite.status).toBe(403);
    expect(testHarness.gamificationStore.learn.size).toBe(0);
  });

  it("öğrenme kaydı sim başına ayrıdır: aynı anahtar başka simde yeni kayıt ve XP üretir", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    expect((await postWrite(testHarness, ali.headers, { topic: "ortak:konu" }, "pulse")).status).toBe(201);
    expect((await postWrite(testHarness, ali.headers, { topic: "ortak:konu" }, "opaca")).status).toBe(201);
    expect(testHarness.gamificationStore.learn.size).toBe(2);
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

  it("sunucu oturumu denemesinin XP'si özetten değil sunucu kuralından gelir (A1 yolu)", async () => {
    const testHarness = harness({ [ALI_ID]: ["opaca"] });
    const ali = await login(testHarness, "ali.veli");
    // Özet içindeki `opaca.xp` kodu yetkili değildir; assessment XP'si sunucu kuralıdır.
    const input = serverAttemptInput({
      summary: { score: 80, correct: 8, total: 10, "opaca.xp": 999_999 },
    });
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("created");
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("existing");
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

describe("sunucu rozet değerlendirmesi (ADR-008) — deneme sunucu yazımından", () => {
  it("Pulse denemesinin kodlu özetinden rozetler sunucuda verilir; tekrar rozet çoğaltmaz", async () => {
    const testHarness = harness();
    const ali = await login(testHarness, "ali.veli");
    const summary = encodePulseSummary({
      score: 90,
      extra: { ecgMode: "af", modeMastered: true, correctlyReadLeads: 3, caliperAccurate: null, rhythmRecognitionStreak: 4 },
    });
    // Tohumda ALI'nin iki Pulse denemesi var; sunucu sıradaki numarayı kullanır.
    const input = serverAttemptInput({ simId: "pulse", attemptNo: 3, summary });
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("created");
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("existing");
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
    const input = serverAttemptInput({ simId: "opaca", score: 100, passed: true, summary, hintsUsed: 0 });
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("created");
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("existing");
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

  it("T239: tüm kütüphane konuları doğru yanıtlanınca all-topics verilir; biri eksikken verilmez", async () => {
    const testHarness = harness({ [ALI_ID]: ["opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const libraryItems = assessmentBankOpaca.OPACA_LIBRARY_ITEMS;
    const findingTopics = libraryItems.filter((item) => item.finding !== null).map((item) => item.key);
    const learnOnlyTopics = libraryItems.filter((item) => item.finding === null).map((item) => item.key);

    for (const key of learnOnlyTopics) {
      await testHarness.gamificationStore.repo.recordLearn({
        userId: ALI_ID,
        simId: "opaca",
        topic: `opaca:topic:${key}`,
        at: FIXED_NOW,
        institutionId: INSTITUTION_ID,
      });
    }

    let attemptNo = 1;
    const writeCoveredTopics = async (libraryTopicsCorrect: readonly string[]) => {
      const finishedAt = FIXED_NOW + attemptNo * 1_000;
      const summary = encodeOpacaSummary({
        mode: "assessment",
        finishedAt: new Date(finishedAt).toISOString(),
        score: 0,
        caseCount: libraryTopicsCorrect.length,
        hintsUsed: 0,
        extra: {
          localizationHits: 0,
          abcdeComplete: 0,
          qualityCorrect: 0,
          interpretationCorrect: 0,
          fastPerfect: false,
          libraryTopicsCorrect,
        },
      });
      const result = await testHarness.gamificationStore.repo.writeAttempt(
        serverAttemptInput({
          id: `00000000-0000-4000-8000-${String(100 + attemptNo).padStart(12, "0")}`,
          attemptNo,
          startedAt: finishedAt - HOUR,
          finishedAt,
          createdAt: finishedAt,
          summary,
        }),
      );
      expect(result.kind).toBe("created");
      attemptNo += 1;
    };

    const coveredBeforeFinalTopic = findingTopics.slice(0, -1);
    for (let offset = 0; offset < coveredBeforeFinalTopic.length; offset += 10) {
      await writeCoveredTopics(coveredBeforeFinalTopic.slice(offset, offset + 10));
    }
    const before = await testHarness.app.request("/me/gamification/opaca", { headers: ali.headers });
    const beforeKeys = ((await before.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(beforeKeys).not.toContain("all-topics");

    await writeCoveredTopics(findingTopics.slice(-1));
    const after = await testHarness.app.request("/me/gamification/opaca", { headers: ali.headers });
    const afterKeys = ((await after.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(afterKeys).toContain("all-topics");
  });

  it("T235: gami_learn opaca konuları explorer rozetini kazandırır; başka sim etkilemez", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const badgeKeys = async (simId: string) => {
      const response = await testHarness.app.request(`/me/gamification/${simId}`, { headers: ali.headers });
      expect(response.status).toBe(200);
      return ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    };
    for (let index = 0; index < 9; index += 1) {
      expect((await postWrite(testHarness, ali.headers, { topic: `opaca:topic:konu-${index}` }, "opaca")).status).toBe(201);
    }
    // Eşiğin (10 konu) altında rozet verilmez.
    expect(await badgeKeys("opaca")).not.toContain("explorer");
    expect((await postWrite(testHarness, ali.headers, { topic: "opaca:topic:konu-9" }, "opaca")).status).toBe(201);
    expect(await badgeKeys("opaca")).toContain("explorer");
    // Tek BT yığını ct-explorer rozetini kazandırır.
    expect((await postWrite(testHarness, ali.headers, { topic: "opaca:stack:seri-1" }, "opaca")).status).toBe(201);
    expect(await badgeKeys("opaca")).toContain("ct-explorer");
    // Pulse öğrenme kaydı Opaca rozeti üretmez (sim başına ayrı katalog).
    expect(await badgeKeys("pulse")).not.toContain("explorer");
  });

  it("T235: eski istemci özetlerindeki opaca.learn kodları okunmaya devam eder", async () => {
    const testHarness = harness({ [ALI_ID]: ["pulse", "opaca"] });
    const ali = await login(testHarness, "ali.veli");
    const summary = encodeOpacaSummary({
      mode: "assessment",
      finishedAt: "2026-09-24T09:00:00.000Z",
      score: 0,
      caseCount: 1,
      hintsUsed: 0,
      extra: { localizationHits: 0, abcdeComplete: 0, qualityCorrect: 0, interpretationCorrect: 0, fastPerfect: false },
      learn: { topicsCount: 10, stacksCount: 1, libraryTopicsTotal: 0, libraryTopicsCovered: 0 },
    });
    const input = serverAttemptInput({ simId: "opaca", summary });
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("created");
    const response = await testHarness.app.request("/me/gamification/opaca", { headers: ali.headers });
    const keys = ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
    expect(keys).toContain("explorer");
    expect(keys).toContain("ct-explorer");
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
    const input = serverAttemptInput({ simId: "ausculta", summary });
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("created");
    expect((await testHarness.gamificationStore.repo.writeAttempt(input)).kind).toBe("existing");
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

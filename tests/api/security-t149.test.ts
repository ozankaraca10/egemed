import { describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "../../apps/api/src/app";
import { ATTEMPT_RATE_MAX } from "../../apps/api/src/me/gamification";
import { ADMIN_ID, ALI_ID, DEFAULT_USERS, FIXED_NOW, MERT_ID, createAdminHarness, login, type AdminHarness } from "./admin-harness";

/**
 * T149 — derin güvenlik denetiminin (25 Eylül 2026) bulgularına regresyon testleri.
 * A4 (ADR-009) sonrası uç puanlı deneme kabul etmez (403 `server_scored`); kalan
 * yazım yüzeyi puansız öğrenme kaydıdır. İstemci artık tarih, özet, skor veya XP
 * bildiremez; seri/skor şişirme yolları uç seviyesinde kapalıdır.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let sequence = 0;

function harness(): AdminHarness {
  return createAdminHarness({
    users: DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, simAccess: ["pulse", "opaca"] } : entry)),
  });
}

/** Eski puanlı istemci gövdesi (A4'te kapandı); 403 `server_scored` beklenir. */
function scoredAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(900_000_000_000 + sequence).padStart(12, "0")}`,
    attemptNo: sequence,
    startedAt: new Date(FIXED_NOW - HOUR - 5 * MINUTE).toISOString(),
    finishedAt: new Date(FIXED_NOW - HOUR).toISOString(),
    score: 80,
    maxScore: 100,
    passed: true,
    summary: { score: 80, correct: 8, total: 10 },
    ...overrides,
  };
}

/** A4 kabul edilen biçim: puansız öğrenme kaydı. */
function learnRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  sequence += 1;
  return { topic: `pulse:topic:konu-${sequence}`, ...overrides };
}

function post(h: AdminHarness, headers: Record<string, string>, simId: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    h.app.request(`/me/gamification/${simId}/attempts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("T149/A4 — puanlı deneme yolu kapalı", () => {
  it("skor, özet veya mod taşıyan gövde 403 server_scored döner; hiçbir kayıt yazılmaz", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (const body of [
      scoredAttempt(),
      scoredAttempt({ mode: "practice" }),
      scoredAttempt({ mode: "challenge" }),
      // Gelecek tarihli denemeyle seri dondurma girişimi de puanlı gövdedir.
      scoredAttempt({ finishedAt: new Date(FIXED_NOW + 365 * 24 * HOUR).toISOString() }),
      // Geçmişe yayılan sahte seri girişimi.
      scoredAttempt({ startedAt: new Date(FIXED_NOW - 30 * 24 * HOUR).toISOString() }),
    ]) {
      const response = await post(h, ali.headers, "pulse", body);
      expect(response.status, JSON.stringify(body)).toBe(403);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({ error: { code: "server_scored" } });
    }
    expect(h.gamificationStore.attempts.size).toBe(0);
    expect(h.gamificationStore.learn.size).toBe(0);
  });

  it("istemci tarih/skor alanı taşıyan öğrenme gövdesi reddedilir; seri üretilemez", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const forged = await post(h, ali.headers, "pulse", {
      ...learnRecord(),
      finishedAt: new Date(FIXED_NOW + 365 * 24 * HOUR).toISOString(),
    });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ error: { code: "server_scored" } });
    const withScore = await post(h, ali.headers, "pulse", { ...learnRecord(), score: 100 });
    expect(withScore.status).toBe(403);
    const streak = ((await (await h.app.request("/me/gamification/pulse", { headers: ali.headers })).json()) as {
      data: { streak: { current: number } };
    }).data.streak.current;
    expect(streak).toBe(0);
  });
});

describe("T149 — puansız öğrenme kaydı sınırları", () => {
  it("serbest metin, özet ve tanımsız alanlar reddedilir (özet 403, diğerleri 400)", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    // `summary` puanlı deneme imzasıdır: eski yol sinyali olarak 403 döner.
    const withSummary = await post(h, ali.headers, "pulse", { topic: "pulse:topic:af", summary: { "pulse.streak": 4 } });
    expect(withSummary.status).toBe(403);
    expect(await withSummary.json()).toMatchObject({ error: { code: "server_scored" } });
    for (const body of [
      { topic: "serbest metin" },
      { topic: "pulse:topic:af", notes: "öğrenci notu" },
      { topic: "pulse:topic:af", answers: ["ham cevap"] },
    ]) {
      const response = await post(h, ali.headers, "pulse", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({ error: { code: "invalid_request" } });
    }
    expect(h.gamificationStore.learn.size).toBe(0);
  });

  it("aynı konu tekrarı yeni XP üretmez (idempotent öğrenme kaydı)", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const body = learnRecord();
    expect((await post(h, ali.headers, "pulse", body)).status).toBe(201);
    expect((await post(h, ali.headers, "pulse", body)).status).toBe(200);
    const summary = ((await (await h.app.request("/me/gamification/pulse", { headers: ali.headers })).json()) as {
      data: { xp: number };
    }).data;
    expect(summary.xp).toBe(2);
    expect(h.gamificationStore.learn.size).toBe(1);
  });
});

describe("T149 — yazım hız sınırı", () => {
  it(`kullanıcı saatte en fazla ${ATTEMPT_RATE_MAX} öğrenme kaydı yazar; pencere geçince yeniden açılır`, async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (let index = 0; index < ATTEMPT_RATE_MAX; index += 1) {
      expect((await post(h, ali.headers, "pulse", learnRecord())).status).toBe(201);
    }
    const limited = await post(h, ali.headers, "pulse", learnRecord());
    expect(limited.status).toBe(429);
    h.advance(HOUR + MINUTE);
    const fresh = await login(h, "ali.veli");
    expect((await post(h, fresh.headers, "pulse", learnRecord())).status).toBe(201);
  });
});

describe("T149 — istek gövdesi sınırı", () => {
  it("JSON uçlarında sınırı aşan gövde 413 payload_too_large döner", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const response = await h.app.request("/me/gamification/pulse/attempts", {
      method: "POST",
      headers: { ...ali.headers, "content-type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(BODY_LIMIT_BYTES) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("CSV içe aktarma ucu 1 MB üstü dosyayı gövde sınırına takılmadan alır", async () => {
    const h = harness();
    const admin = await login(h, "ornek.yonetici");
    const header = "kullanici_adi;eposta;ad_soyad;rol;birim_kodu;sim_erisimi;giris_tipi\n";
    const csv = header + "a.b;;Ab Cd;;;pulse;\n".repeat(Math.ceil((1.5 * 1024 * 1024) / 20));
    const response = await h.app.request("/admin/imports?fileName=buyuk.csv&mode=add", {
      method: "POST",
      headers: { ...admin.headers, "content-type": "text/csv" },
      body: csv,
    });
    expect(response.status).not.toBe(413);
  });
});

describe("T149 — admin kilitlenme koruması", () => {
  it("admin kendini askıya alamaz, silemez, toplu askıya almaya dahil edemez; başkasını askıya alabilir", async () => {
    const h = harness();
    const admin = await login(h, "ornek.yonetici");
    const json = { ...admin.headers, "content-type": "application/json" };
    const selfSuspend = await h.app.request(`/admin/users/${ADMIN_ID}/suspend`, { method: "POST", headers: json, body: "{}" });
    expect(selfSuspend.status).toBe(403);
    expect(await selfSuspend.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    const selfDelete = await h.app.request(`/admin/users/${ADMIN_ID}`, { method: "DELETE", headers: json, body: "{}" });
    expect(selfDelete.status).toBe(403);
    const bulk = await h.app.request("/admin/users/bulk", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ userIds: [MERT_ID, ADMIN_ID], operation: "set_status", value: "suspended" }),
    });
    expect(bulk.status).toBe(403);
    const other = await h.app.request(`/admin/users/${MERT_ID}/suspend`, { method: "POST", headers: json, body: "{}" });
    expect(other.status).toBe(200);
    // Oturum hâlâ geçerli: admin kilitlenmedi.
    expect((await h.app.request("/auth/me", { headers: admin.headers })).status).toBe(200);
  });
});

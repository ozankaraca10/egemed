import { describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "../../apps/api/src/app";
import { ATTEMPT_RATE_MAX } from "../../apps/api/src/me/gamification";
import { encodeOpacaSummary, opacaDayIndex } from "../../packages/gami-catalogs/src/index";
import { ADMIN_ID, ALI_ID, DEFAULT_USERS, FIXED_NOW, MERT_ID, createAdminHarness, login, type AdminHarness } from "./admin-harness";

/**
 * T149 — derin güvenlik denetiminin (25 Eylül 2026) bulgularına regresyon testleri:
 * gelecek/eski tarihli denemeyle seri şişirme ve dondurma, sime ait olmayan özet kodu,
 * sahte gün kodu, özet şişirmesi, deneme hız sınırı, gövde boyutu ve admin'in kendini
 * askıya alıp/silip sistemi kilitlemesi.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let sequence = 0;

function harness(): AdminHarness {
  return createAdminHarness({
    users: DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...entry, simAccess: ["pulse", "opaca"] } : entry)),
  });
}

function attempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function post(h: AdminHarness, headers: Record<string, string>, simId: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    h.app.request(`/me/gamification/${simId}/attempts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function issueCode(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as { error?: { details?: { issues?: { code?: string }[] } } };
  return payload.error?.details?.issues?.[0]?.code;
}

describe("T149 — deneme zaman penceresi (seri şişirme/dondurma)", () => {
  it("gelecek tarihli deneme reddedilir; 5 dk içindeki saat kayması kabul edilir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const future = await post(h, ali.headers, "pulse", attempt({ finishedAt: new Date(FIXED_NOW + 10 * MINUTE).toISOString() }));
    expect(future.status).toBe(422);
    expect(await issueCode(future)).toBe("finished_in_future");
    const skew = await post(h, ali.headers, "pulse", attempt({ finishedAt: new Date(FIXED_NOW + 2 * MINUTE).toISOString() }));
    expect(skew.status).toBe(201);
  });

  it("48 saatten eski deneme reddedilir (geçmişe yayılan sahte seri)", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const old = await post(
      h,
      ali.headers,
      "pulse",
      attempt({ startedAt: new Date(FIXED_NOW - 49 * HOUR - MINUTE).toISOString(), finishedAt: new Date(FIXED_NOW - 49 * HOUR).toISOString() }),
    );
    expect(old.status).toBe(422);
    expect(await issueCode(old)).toBe("finished_too_old");
    const recent = await post(
      h,
      ali.headers,
      "pulse",
      attempt({ startedAt: new Date(FIXED_NOW - 47 * HOUR - MINUTE).toISOString(), finishedAt: new Date(FIXED_NOW - 47 * HOUR).toISOString() }),
    );
    expect(recent.status).toBe(201);
  });
});

describe("T149 — seri sunucu alım gününden", () => {
  it("dünkü tarihle gönderilen deneme seriyi uzatmaz; seri yalnız sunucu gününe göre artar", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const yesterday = new Date(FIXED_NOW - 25 * HOUR).toISOString();
    expect((await post(h, ali.headers, "pulse", attempt({ startedAt: new Date(FIXED_NOW - 25 * HOUR - MINUTE).toISOString(), finishedAt: yesterday }))).status).toBe(201);
    expect((await post(h, ali.headers, "pulse", attempt())).status).toBe(201);
    const streakOf = async (headers: Record<string, string>) =>
      ((await (await h.app.request("/me/gamification/pulse", { headers })).json()) as { data: { streak: { current: number } } }).data.streak.current;
    expect(await streakOf(ali.headers)).toBe(1);
    h.advance(24 * HOUR);
    const next = await login(h, "ali.veli");
    expect((await post(h, next.headers, "pulse", attempt({ startedAt: new Date(FIXED_NOW + 24 * HOUR - 6 * MINUTE).toISOString(), finishedAt: new Date(FIXED_NOW + 24 * HOUR - MINUTE).toISOString() }))).status).toBe(201);
    expect(await streakOf(next.headers)).toBe(2);
  });
});

describe("T149 — kodlu özet sınırları", () => {
  it("sime ait olmayan veya öneksiz kod reddedilir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (const summary of [{ "opaca.learn": 50 }, { ritim: 80 }]) {
      const response = await post(h, ali.headers, "pulse", attempt({ summary }));
      expect(response.status).toBe(422);
      expect(await issueCode(response)).toBe("summary_key_not_allowed");
    }
  });

  it("64'ten fazla kod taşıyan özet reddedilir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const summary = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`pulse.k${index}`, index]));
    expect((await post(h, ali.headers, "pulse", attempt({ summary }))).status).toBe(400);
  });

  it("Opaca gün kodu istemci beyanı değildir: finishedAt'ten yeniden hesaplanır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const finishedAt = new Date(FIXED_NOW - HOUR).toISOString();
    const forged = encodeOpacaSummary({
      mode: "practice",
      finishedAt: "2020-01-01T09:00:00.000Z",
      score: 80,
      caseCount: 5,
      hintsUsed: 0,
      extra: { localizationHits: 0, abcdeComplete: 0, qualityCorrect: 0, interpretationCorrect: 0, fastPerfect: false },
    });
    const response = await post(h, ali.headers, "opaca", attempt({ finishedAt, summary: forged }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { summary: Record<string, number> } };
    expect(body.data.summary["opaca.day"]).toBe(opacaDayIndex(new Date(FIXED_NOW - HOUR)));
    expect(body.data.summary["opaca.day"]).not.toBe(forged["opaca.day"]);
  });
});

describe("T149 — deneme hız sınırı", () => {
  it(`kullanıcı saatte en fazla ${ATTEMPT_RATE_MAX} deneme yazar; pencere geçince yeniden açılır`, async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (let index = 0; index < ATTEMPT_RATE_MAX; index += 1) {
      expect((await post(h, ali.headers, "pulse", attempt())).status).toBe(201);
    }
    const limited = await post(h, ali.headers, "pulse", attempt());
    expect(limited.status).toBe(429);
    h.advance(HOUR + MINUTE);
    const fresh = await login(h, "ali.veli");
    expect((await post(h, fresh.headers, "pulse", attempt({ finishedAt: new Date(FIXED_NOW + MINUTE).toISOString() }))).status).toBe(201);
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

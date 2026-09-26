import { describe, expect, it } from "vitest";
import {
  API_VERSION,
  LOGIN_WINDOW_MS,
  adminGamiSummaryResponseSchema,
  adminHealthSchema,
  adminOverviewResponseSchema,
} from "../../apps/api/src/admin/extras";
import { DEFAULT_SESSION_IDLE_MS } from "../../apps/api/src/auth/session";
import {
  ADMIN_ID,
  ALI_ID,
  BORA_ID,
  CEREN_ID,
  DERYA_ID,
  EGE_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  OTHER_INSTITUTION_ID,
  createAdminHarness,
  login,
  user,
  type AdminHarness,
  type HarnessUser,
  type Login,
} from "./admin-harness";

// T58 — `/admin/users/:id/gamification`, `/admin/overview`, `/admin/health`
// (E3 §d, §e.3; E2 admin haritası "Özet"). Bellek deposu; DB gerekmez.
// Başarısızlık yolları `.egemed-run/plan.md` sonundadır: yetki (401/403),
// kapsam (404), sızıntı (bireysel kimlik/puan/ham deneme yok) ve sağlık
// (503 degraded, hata ayrıntısı yok) burada doğrulanır.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CSV_HEADER = "kullanici_adi;eposta;ad_soyad;rol;birim_kodu;sim_erisimi;giris_tipi";

const GAMIFICATION_SEED = {
  profiles: [
    {
      userId: ALI_ID,
      institutionId: INSTITUTION_ID,
      simId: "pulse" as const,
      xp: 1450,
      level: 4,
      streak: { current: 3, best: 7, lastDate: "2026-09-22" },
      updatedAt: FIXED_NOW - HOUR,
    },
    {
      userId: ALI_ID,
      institutionId: INSTITUTION_ID,
      simId: "ausculta" as const,
      xp: 210,
      level: 1,
      updatedAt: FIXED_NOW - HOUR,
    },
  ],
  badges: [
    { userId: ALI_ID, simId: "pulse" as const, key: "ritim-ustasi", awardedAt: FIXED_NOW - DAY },
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
  ],
};

function gamificationHarness(): AdminHarness {
  return createAdminHarness({ gamification: GAMIFICATION_SEED });
}

interface JsonResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

async function getJson(
  harness: AdminHarness,
  path: string,
  headers: Record<string, string>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await harness.app.request(path, { headers });
  return { status: response.status, body: await response.json() };
}

async function upload(
  harness: AdminHarness,
  admin: Login,
  csv: string,
  fileName = "ogrenciler.csv",
): Promise<JsonResponse> {
  return harness.app.request(`/admin/imports?fileName=${fileName}&mode=ekle`, {
    method: "POST",
    headers: { ...admin.headers, "content-type": "text/csv; charset=utf-8" },
    body: csv,
  });
}

async function uploadOk(harness: AdminHarness, admin: Login, csv: string): Promise<string> {
  const response = await upload(harness, admin, csv);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

const VALID_CSV = `${CSV_HEADER}\nyeni.bir;yeni.bir@example.invalid;Yeni Bir;kullanici;;;sso\n`;

describe("yetki (E3 §b, §d)", () => {
  it("oturumsuz istekler 401 unauthorized döner", async () => {
    const harness = gamificationHarness();
    for (const path of ["/admin/overview", "/admin/health", `/admin/users/${ALI_ID}/gamification`]) {
      const { status, body } = await getJson(harness, path, {});
      expect(status, path).toBe(401);
      expect(body, path).toMatchObject({ error: { code: "unauthorized" } });
    }
  });

  it("kullanici rolü üç uçta da 403 forbidden alır", async () => {
    const harness = gamificationHarness();
    const ali = await login(harness, "ali.veli");
    for (const path of ["/admin/overview", "/admin/health", `/admin/users/${MERT_ID}/gamification`]) {
      const { status, body } = await getJson(harness, path, ali.headers);
      expect(status, path).toBe(403);
      expect(body, path).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("süresi dolan oturum 401 session_expired döner", async () => {
    const harness = gamificationHarness();
    const admin = await login(harness, "ornek.yonetici");
    harness.advance(DEFAULT_SESSION_IDLE_MS);
    const { status, body } = await getJson(harness, "/admin/overview", admin.headers);
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: { code: "session_expired" } });
  });
});

describe("GET /admin/users/:id/gamification (E3 §e.3)", () => {
  it("üç simin ayrı özetini döner; deneme ve ham veri yok", async () => {
    const harness = gamificationHarness();
    const admin = await login(harness, "ornek.yonetici");
    const { status, body } = await getJson(harness, `/admin/users/${ALI_ID}/gamification`, admin.headers);
    expect(status).toBe(200);
    const parsed = adminGamiSummaryResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));

    const sims = (body as { data: { sims: readonly Record<string, unknown>[] } }).data.sims;
    expect(sims.map((sim) => sim.simId)).toEqual(["pulse", "ausculta", "opaca"]);
    expect(sims.map((sim) => sim.xp)).toEqual([1450, 210, 0]);
    expect(sims.map((sim) => sim.level)).toEqual([4, 1, 1]);
    expect(sims[0]?.streak).toEqual({ current: 3, best: 7, lastDate: "2026-09-22" });
    // Profil satırı olmayan sim sıfırlanır; uydurma puan üretilmez.
    expect(sims[2]?.streak).toEqual({ current: 0, best: 0, lastDate: null });
    // Şema `strictObject`: deneme, rozet ve liderlik alanları yanıtta yoktur.
    expect(Object.keys(sims[0] ?? {}).sort()).toEqual(["level", "simId", "streak", "xp"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("attempt");
    expect(text).not.toContain("ritim");
  });

  it("başka kurumdaki, silinmiş ve bilinmeyen kullanıcı 404 döner", async () => {
    const harness = gamificationHarness();
    const admin = await login(harness, "ornek.yonetici");

    const other = await getJson(harness, `/admin/users/${DERYA_ID}/gamification`, admin.headers);
    expect(other.status).toBe(404);
    expect(other.body).toMatchObject({ error: { code: "not_found" } });

    const unknown = await getJson(
      harness,
      "/admin/users/00000000-0000-4000-8000-0000000000ff/gamification",
      admin.headers,
    );
    expect(unknown.status).toBe(404);
    const malformed = await getJson(harness, "/admin/users/kalp/gamification", admin.headers);
    expect(malformed.status).toBe(404);

    // Silinen kullanıcının ayrıntısı da 404'tür (E3 §d kapsam kuralı).
    const deleted = await harness.app.request(`/admin/users/${EGE_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await getJson(harness, `/admin/users/${EGE_ID}/gamification`, admin.headers);
    expect(afterDelete.status).toBe(404);
  });

  it("salt okunur uç CSRF belirteci istemez", async () => {
    const harness = gamificationHarness();
    const admin = await login(harness, "ornek.yonetici");
    const cookieOnly = { cookie: admin.headers["cookie"] ?? "" };
    const { status } = await getJson(harness, `/admin/users/${ALI_ID}/gamification`, cookieOnly);
    expect(status).toBe(200);
  });
});

describe("GET /admin/overview (E2 admin Özet)", () => {
  /** Sınır anları: tam `now - 7 gün` dahil, bir ms öncesi hariç. */
  const OVERVIEW_USERS: readonly HarnessUser[] = [
    user({
      id: ADMIN_ID,
      username: "ornek.yonetici",
      authMethod: "dev",
      roles: ["admin"],
      lastLoginAt: FIXED_NOW - DAY,
    }),
    user({
      id: MERT_ID,
      username: "mert.ikinci",
      authMethod: "dev",
      roles: ["admin", "kullanici"],
      lastLoginAt: FIXED_NOW - 8 * DAY,
    }),
    user({ id: ALI_ID, username: "ali.veli", lastLoginAt: FIXED_NOW - LOGIN_WINDOW_MS }),
    user({ id: BORA_ID, username: "bora.kaya", status: "suspended", lastLoginAt: FIXED_NOW - LOGIN_WINDOW_MS - 1 }),
    user({ id: CEREN_ID, username: "ceren.demir", status: "invited", lastLoginAt: null }),
    user({ id: EGE_ID, username: "ege.olgun", roles: [], lastLoginAt: FIXED_NOW - DAY }),
    user({
      id: DERYA_ID,
      username: "derya.uzak",
      institutionId: OTHER_INSTITUTION_ID,
      lastLoginAt: FIXED_NOW - DAY,
    }),
  ];

  function overviewHarness(): AdminHarness {
    return createAdminHarness({ users: OVERVIEW_USERS });
  }

  async function overviewBody(harness: AdminHarness, admin: Login) {
    const { status, body } = await getJson(harness, "/admin/overview", admin.headers);
    expect(status).toBe(200);
    const parsed = adminOverviewResponseSchema.safeParse(body);
    if (!parsed.success) expect.unreachable(JSON.stringify(parsed.error.issues));
    return (body as { data: Record<string, unknown> }).data;
  }

  it("durum/rol sayımlarını ve son 7 gün penceresini kurum kapsamında verir", async () => {
    const harness = overviewHarness();
    const admin = await login(harness, "ornek.yonetici");
    const data = await overviewBody(harness, admin);

    // Başka kurumdaki DERYA hiçbir sayıma girmez.
    expect(data).toEqual({
      users: {
        total: 6,
        byStatus: { invited: 1, active: 4, suspended: 1 },
        byRole: { admin: 2, kullanici: 4, ogretim_uyesi: 0 },
      },
      // ADMIN ve EGE pencere içinde, ALI tam sınırda; MERT/BORA dışında, CEREN hiç girmemiş.
      loginsLast7Days: 3,
      pendingImports: 0,
    });
    // Bireysel kimlik ve puan taşımaz: yalnız sayılar döner.
    const text = JSON.stringify(data);
    for (const needle of [ALI_ID, "ali.veli", "example.invalid", "xp"]) {
      expect(text).not.toContain(needle);
    }
  });

  it("silinen kullanıcı sayılmaz; bekleyen import sayısı yaşam döngüsünü izler", async () => {
    const harness = overviewHarness();
    const admin = await login(harness, "ornek.yonetici");

    const deleted = await harness.app.request(`/admin/users/${EGE_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await overviewBody(harness, admin);
    expect(afterDelete).toMatchObject({
      users: { total: 5, byStatus: { invited: 1, active: 3, suspended: 1 } },
      loginsLast7Days: 2,
    });

    // Yüklenmiş batch bekler; doğrulanmış batch de bekler; uygulanan beklemez.
    const uploadedId = await uploadOk(harness, admin, VALID_CSV);
    const validatedId = await uploadOk(harness, admin, VALID_CSV);
    const validated = await harness.app.request(`/admin/imports/${validatedId}/validate`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(validated.status).toBe(200);
    expect((await overviewBody(harness, admin)).pendingImports).toBe(2);

    const applied = await harness.app.request(`/admin/imports/${validatedId}/apply`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(applied.status).toBe(200);
    expect((await overviewBody(harness, admin)).pendingImports).toBe(1);

    // Başarısız yükleme (`failed`) bekleyen sayılmaz; uploaded batch beklemede kalır.
    const failed = await upload(harness, admin, "x;y\n1;2\n");
    expect(failed.status).toBe(422);
    const final = await overviewBody(harness, admin);
    expect(final.pendingImports).toBe(1);
    expect(harness.importStore.batches.get(uploadedId)?.status).toBe("uploaded");
  });
});

describe("GET /admin/health", () => {
  it("db sağlıklıysa sürümle birlikte ok döner", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const { status, body } = await getJson(harness, "/admin/health", admin.headers);
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", db: "ok", version: API_VERSION });
    expect(adminHealthSchema.safeParse(body).success).toBe(true);
  });

  it("db hatasında 503 degraded döner; hata ayrıntısı sızmaz", async () => {
    const harness = createAdminHarness({
      db: {
        query() {
          return Promise.reject(new Error("dsn=postgres://gizli-parola@localhost"));
        },
      },
    });
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/health", { headers: admin.headers });
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "degraded", db: "down", version: API_VERSION });
    expect(text).not.toContain("gizli-parola");
    expect(text).not.toContain("postgres");
  });
});

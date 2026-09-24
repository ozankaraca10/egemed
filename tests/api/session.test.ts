import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authMeResponseSchema } from "../../packages/contracts/src/index";
import { createApp } from "../../apps/api/src/app";
import { createMemoryAuthStore, type MemoryUserSeed } from "../../apps/api/src/auth/repo";
import {
  csrfCookieOptions,
  sessionCookieOptions,
  type AuthDeps,
} from "../../apps/api/src/auth/routes";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  DEFAULT_SESSION_ABSOLUTE_MS,
  DEFAULT_SESSION_IDLE_MS,
  SESSION_COOKIE,
  csrfTokenForSession,
  sessionIdForToken,
} from "../../apps/api/src/auth/session";

// T63 — E3 §a, §d oturum çekirdeği sözleşmesi. DB gerekmez; bellek deposu ve
// enjekte edilen saat kullanılır. Ham belirteç yanıta/audit'e sızmamalıdır.

const FIXED_NOW = 1_700_000_000_000;
const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";
const STUDENT_ID = "00000000-0000-4000-8000-000000000001";

function student(overrides: Partial<MemoryUserSeed> = {}): MemoryUserSeed {
  return {
    id: STUDENT_ID,
    username: "ornek.ogrenci",
    displayName: "Örnek Öğrenci",
    authMethod: "dev",
    institutionId: INSTITUTION_ID,
    institutionName: "Örnek Kurum",
    roles: ["kullanici"],
    simAccess: ["pulse", "opaca"],
    ...overrides,
  };
}

function fakeDb() {
  return {
    query() {
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

interface HarnessOptions {
  readonly users?: readonly MemoryUserSeed[];
  readonly nodeEnv?: "development" | "test" | "production";
  readonly devEnabled?: boolean;
  readonly idleMs?: number;
  readonly absoluteMs?: number;
}

function createHarness(options: HarnessOptions = {}) {
  const store = createMemoryAuthStore({ users: options.users ?? [student()] });
  let clock = FIXED_NOW;
  const auth: AuthDeps = {
    sessions: store.repos.sessions,
    users: store.repos.users,
    audit: store.repos.audit,
    nodeEnv: options.nodeEnv ?? "development",
    devEnabled: options.devEnabled ?? true,
    sessionIdleMs: options.idleMs ?? DEFAULT_SESSION_IDLE_MS,
    sessionAbsoluteMs: options.absoluteMs ?? DEFAULT_SESSION_ABSOLUTE_MS,
  };
  const app = createApp({ db: fakeDb(), now: () => clock, auth });
  return {
    app,
    store,
    advance(ms: number) {
      clock += ms;
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

/** Yanıt başlıklarını dar bir yüzeyle okur (Response tipi programda yok). */
interface CookieResponse {
  readonly headers: { getSetCookie(): string[] };
}

function setCookieHeader(response: CookieResponse, name: string): string | undefined {
  return response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`));
}

function cookieValue(response: CookieResponse, name: string): string | undefined {
  const header = setCookieHeader(response, name);
  return header === undefined ? undefined : header.slice(name.length + 1).split(";")[0];
}

function sessionCookie(token: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

async function devLogin(harness: Harness, username = "ornek.ogrenci", headers: Record<string, string> = {}) {
  return harness.app.request("/auth/dev/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ username }),
  });
}

async function logout(harness: Harness, headers: Record<string, string> = {}) {
  return harness.app.request("/auth/logout", { method: "POST", headers });
}

async function loginToken(harness: Harness): Promise<string> {
  const response = await devLogin(harness);
  expect(response.status).toBe(200);
  return cookieValue(response, SESSION_COOKIE) ?? "";
}

describe("oturum belirteci ve özet saklama", () => {
  it("en az 256 bit rastgele belirteç üretir; depoda yalnız SHA-256 özeti bulunur", async () => {
    const harness = createHarness();
    const response = await devLogin(harness);
    expect(response.status).toBe(200);
    const token = cookieValue(response, SESSION_COOKIE) ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bayt base64url = 256 bit

    const digestHex = createHash("sha256").update(token).digest("hex");
    const storedIds = [...harness.store.sessionRecords.keys()];
    expect(storedIds).toEqual([sessionIdForToken(token)]);
    const storedHex = (storedIds[0] ?? "").replaceAll("-", "");
    // Özetin ilk 128 biti saklanır; yalnız sürüm/varyant bitleri biçim içindir.
    expect(storedHex.slice(0, 12)).toBe(digestHex.slice(0, 12));
    expect(storedHex.slice(18)).toBe(digestHex.slice(18, 32));
    expect(storedIds.join(",")).not.toContain(token);
    expect(await response.text()).not.toContain(token);

    const record = harness.store.sessionRecords.get(sessionIdForToken(token));
    expect(record).toMatchObject({
      userId: STUDENT_ID,
      authMethod: "dev",
      createdAt: FIXED_NOW,
      lastSeenAt: FIXED_NOW,
      expiresAt: FIXED_NOW + DEFAULT_SESSION_ABSOLUTE_MS,
      revokedAt: null,
    });
  });

  it("girişte yeni belirteç üretir; istemcinin getirdiği eski belirteç iptal edilir", async () => {
    const harness = createHarness();
    const firstToken = await loginToken(harness);
    const second = await devLogin(harness, "ornek.ogrenci", sessionCookie(firstToken));
    const secondToken = cookieValue(second, SESSION_COOKIE) ?? "";

    expect(secondToken).not.toBe(firstToken);
    expect(harness.store.sessionRecords.get(sessionIdForToken(firstToken))?.revokedAt).not.toBeNull();
    const me = await harness.app.request("/auth/me", { headers: sessionCookie(firstToken) });
    expect(me.status).toBe(401);
    expect(
      (await harness.app.request("/auth/me", { headers: sessionCookie(secondToken) })).status,
    ).toBe(200);
  });
});

describe("oturum süreleri", () => {
  it("boşta kalma süresi aşılırsa 401 session_expired döner ve oturum iptal edilir", async () => {
    const harness = createHarness();
    const token = await loginToken(harness);
    harness.advance(DEFAULT_SESSION_IDLE_MS);

    const me = await harness.app.request("/auth/me", { headers: sessionCookie(token) });
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: "session_expired" } });
    expect(harness.store.sessionRecords.get(sessionIdForToken(token))?.revokedAt).not.toBeNull();
  });

  it("etkinlik boşta süresini tazeler ama mutlak 12 saat sınırını aşamaz", async () => {
    const harness = createHarness();
    const token = await loginToken(harness);

    harness.advance(DEFAULT_SESSION_IDLE_MS - 1);
    expect((await harness.app.request("/auth/me", { headers: sessionCookie(token) })).status).toBe(200);
    harness.advance(DEFAULT_SESSION_IDLE_MS - 1);
    expect((await harness.app.request("/auth/me", { headers: sessionCookie(token) })).status).toBe(200);

    harness.advance(DEFAULT_SESSION_ABSOLUTE_MS - 2 * (DEFAULT_SESSION_IDLE_MS - 1));
    const me = await harness.app.request("/auth/me", { headers: sessionCookie(token) });
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: "session_expired" } });
  });

  it("bilinmeyen belirteç 401 unauthorized döner", async () => {
    const harness = createHarness();
    const me = await harness.app.request("/auth/me", { headers: sessionCookie("bilinmeyen-belirtec") });
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("CSRF koruması", () => {
  it("oturumsuz çıkış 204 döner ve çerezleri siler", async () => {
    const harness = createHarness();
    const response = await logout(harness);
    expect(response.status).toBe(204);
    const sessionHeader = setCookieHeader(response, SESSION_COOKIE) ?? "";
    expect(sessionHeader).toContain(`${SESSION_COOKIE}=;`);
    expect(sessionHeader).toContain("Max-Age=0");
    expect(setCookieHeader(response, CSRF_COOKIE)).toContain("Max-Age=0");
  });

  it("oturum çerezli mutasyon token'sız ya da yanlış token'la reddedilir", async () => {
    const harness = createHarness();
    const loginResponse = await devLogin(harness);
    const token = cookieValue(loginResponse, SESSION_COOKIE) ?? "";
    const csrf = cookieValue(loginResponse, CSRF_COOKIE) ?? "";
    const cookie = `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`;

    const missing = await logout(harness, { cookie });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: { code: "forbidden" } });

    const wrong = await logout(harness, { cookie, [CSRF_HEADER]: "yanlis-token" });
    expect(wrong.status).toBe(403);

    // Reddedilen denemeler oturumu düşürmez.
    expect((await harness.app.request("/auth/me", { headers: sessionCookie(token) })).status).toBe(200);
  });

  it("doğru double-submit kabul edilir ve oturum iptal edilir", async () => {
    const harness = createHarness();
    const loginResponse = await devLogin(harness);
    const token = cookieValue(loginResponse, SESSION_COOKIE) ?? "";
    const csrf = cookieValue(loginResponse, CSRF_COOKIE) ?? "";
    expect(csrf).toBe(csrfTokenForSession(token));

    const response = await logout(harness, {
      cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`,
      [CSRF_HEADER]: csrf,
    });
    expect(response.status).toBe(204);
    expect(harness.store.sessionRecords.get(sessionIdForToken(token))?.revokedAt).not.toBeNull();
    expect((await harness.app.request("/auth/me", { headers: sessionCookie(token) })).status).toBe(401);
  });

  it("Origin uyuşmazlığı reddedilir, aynı kaynak kabul edilir", async () => {
    const harness = createHarness();
    const loginResponse = await devLogin(harness);
    const token = cookieValue(loginResponse, SESSION_COOKIE) ?? "";
    const csrf = cookieValue(loginResponse, CSRF_COOKIE) ?? "";
    const headers = {
      cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`,
      [CSRF_HEADER]: csrf,
    };

    const crossOrigin = await logout(harness, { ...headers, origin: "https://kotu.example" });
    expect(crossOrigin.status).toBe(403);

    const sameOrigin = await logout(harness, { ...headers, origin: "http://localhost" });
    expect(sameOrigin.status).toBe(204);
  });
});

describe("dev sağlayıcı (E3 §a)", () => {
  it("kapalıyken ve üretimde 404 döner", async () => {
    const disabled = await devLogin(createHarness({ devEnabled: false }));
    expect(disabled.status).toBe(404);
    expect(await disabled.json()).toMatchObject({ error: { code: "not_found" } });

    const production = await devLogin(createHarness({ nodeEnv: "production", devEnabled: true }));
    expect(production.status).toBe(404);
  });

  it("sso kullanıcısı dev girişiyle oturum açamaz; deneme audit'lenir", async () => {
    const harness = createHarness({ users: [student({ authMethod: "sso" })] });
    const response = await devLogin(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_denied_unknown_user" } });
    expect(harness.store.sessionRecords.size).toBe(0);
    expect(harness.store.auditEntries).toHaveLength(1);
    expect(harness.store.auditEntries[0]).toMatchObject({
      action: "auth.login_denied",
      actorUserId: STUDENT_ID,
      institutionId: INSTITUTION_ID,
      summaryAfter: { reason: "auth_method_mismatch", provider: "dev" },
    });
  });

  it("askıda ve silinmiş kullanıcı reddedilir", async () => {
    const suspended = await devLogin(createHarness({ users: [student({ status: "suspended" })] }));
    expect(suspended.status).toBe(401);
    expect(await suspended.json()).toMatchObject({ error: { code: "auth_denied_suspended" } });

    const deleted = await devLogin(createHarness({ users: [student({ status: "deleted" })] }));
    expect(deleted.status).toBe(401);
    expect(await deleted.json()).toMatchObject({ error: { code: "auth_denied_unknown_user" } });
  });

  it("bilinmeyen kullanıcıyı reddeder ve request_id ile audit'ler", async () => {
    const harness = createHarness();
    const response = await devLogin(harness, "yok.boyle", { "x-request-id": "test-istek-kimligi-1" });
    expect(response.status).toBe(401);
    expect(harness.store.auditEntries[0]).toMatchObject({
      action: "auth.login_denied",
      actorUserId: null,
      targetId: null,
      summaryAfter: { reason: "unknown_user", provider: "dev" },
      requestId: "test-istek-kimligi-1",
    });
  });

  it("geçersiz gövdeyi 400 invalid_request ile reddeder", async () => {
    const harness = createHarness();
    const response = await devLogin(harness, "BÜYÜK.HARF");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(harness.store.sessionRecords.size).toBe(0);
  });

  it("rolsüz kullanıcıya oturum açmaz (me sözleşmesi en az bir rol ister)", async () => {
    const harness = createHarness({ users: [student({ roles: [] })] });
    const response = await devLogin(harness);
    expect(response.status).toBe(401);
    expect(harness.store.sessionRecords.size).toBe(0);
    expect(harness.store.auditEntries[0]).toMatchObject({ summaryAfter: { reason: "no_role" } });
  });

  it("ilk başarılı girişte invited → active ve last_login_at yazılır", async () => {
    const harness = createHarness({ users: [student({ status: "invited" })] });
    expect((await devLogin(harness)).status).toBe(200);
    expect(harness.store.userRecords.get(STUDENT_ID)).toMatchObject({
      status: "active",
      lastLoginAt: FIXED_NOW,
    });
  });
});

describe("çerez öznitelikleri (E3 §a)", () => {
  it("oturum çerezi HttpOnly, SameSite=Lax, Path=/ ve Domain'siz; geliştirmede Secure yok", async () => {
    const response = await devLogin(createHarness());
    const sessionHeader = setCookieHeader(response, SESSION_COOKIE) ?? "";
    expect(sessionHeader).toContain("HttpOnly");
    expect(sessionHeader).toContain("SameSite=Lax");
    expect(sessionHeader).toContain("Path=/");
    expect(sessionHeader).not.toContain("Domain=");
    expect(sessionHeader).not.toContain("Secure");
  });

  it("CSRF çerezi HttpOnly değildir (double-submit istemcide okunur)", async () => {
    const response = await devLogin(createHarness());
    const csrfHeader = setCookieHeader(response, CSRF_COOKIE) ?? "";
    expect(csrfHeader).not.toContain("HttpOnly");
    expect(csrfHeader).toContain("SameSite=Lax");
  });

  it("üretimde çerezler Secure taşır", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
    });
    expect(csrfCookieOptions(true)).toMatchObject({ httpOnly: false, secure: true });
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});

describe("GET /auth/me", () => {
  it("sözleşme şemasına uyar; belirteç ve kişisel alan sızdırmaz", async () => {
    const harness = createHarness();
    const token = await loginToken(harness);
    const me = await harness.app.request("/auth/me", { headers: sessionCookie(token) });
    expect(me.status).toBe(200);

    const body = await me.json();
    expect(authMeResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      data: {
        id: STUDENT_ID,
        displayName: "Örnek Öğrenci",
        roles: [{ role: "kullanici" }],
        institution: { id: INSTITUTION_ID, name: "Örnek Kurum" },
        simAccess: ["pulse", "opaca"],
      },
    });
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it("oturum yokken 401 unauthorized döner", async () => {
    const harness = createHarness();
    const me = await harness.app.request("/auth/me");
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("askıya alınan kullanıcının oturumu reddedilir ve iptal edilir", async () => {
    const harness = createHarness();
    const token = await loginToken(harness);
    harness.store.setStatus(STUDENT_ID, "suspended");

    const me = await harness.app.request("/auth/me", { headers: sessionCookie(token) });
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(harness.store.sessionRecords.get(sessionIdForToken(token))?.revokedAt).not.toBeNull();
  });
});

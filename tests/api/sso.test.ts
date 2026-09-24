import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { createMemoryAdminBulkRepo } from "../../apps/api/src/admin/bulk";
import { createMemoryAdminImportRepo } from "../../apps/api/src/admin/imports";
import { createMemoryAdminRoleRepo } from "../../apps/api/src/admin/roles";
import { createMemoryAdminStore, type AdminDeps } from "../../apps/api/src/admin/users";
import { createMemoryAuthStore, type MemoryUserSeed } from "../../apps/api/src/auth/repo";
import type { AuthDeps } from "../../apps/api/src/auth/routes";
import {
  DEFAULT_SSO_STATE_TTL_MS,
  SSO_STATE_COOKIE,
  verifySsoState,
} from "../../apps/api/src/auth/sso/flow";
import type { SsoDeps, SsoIdentity, SsoProvider } from "../../apps/api/src/auth/sso/types";
import {
  CSRF_COOKIE,
  DEFAULT_SESSION_ABSOLUTE_MS,
  DEFAULT_SESSION_IDLE_MS,
  SESSION_COOKIE,
  sessionIdForToken,
} from "../../apps/api/src/auth/session";
import { createMemoryGamificationRepo } from "../../apps/api/src/me/gamification";

// T64 — E3 §a SSO giriş akışı sözleşmesi: state/nonce çerezi, returnTo süzgeci,
// eşleme kuralları, subject bağlama ve oturum açılışı. Protokol adaptörü
// FakeSsoProvider'dır; DB gerekmez, saat enjekte edilir, ham belirteç ve
// subject audit'e sızmaz.

const FIXED_NOW = 1_700_000_000_000;
const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";
const STUDENT_ID = "00000000-0000-4000-8000-000000000001";
const STATE_SECRET = "test-sso-state-secret-0123456789abcdef";
const SUBJECT = "idp-subject-0001";

function student(overrides: Partial<MemoryUserSeed> = {}): MemoryUserSeed {
  return {
    id: STUDENT_ID,
    username: "ornek.ogrenci",
    email: "ogrenci@example.invalid",
    displayName: "Örnek Öğrenci",
    authMethod: "sso",
    institutionId: INSTITUTION_ID,
    institutionName: "Örnek Kurum",
    roles: ["kullanici"],
    simAccess: ["pulse"],
    ...overrides,
  };
}

interface AuthorizeCall {
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
}

interface FakeSsoProvider {
  readonly provider: SsoProvider;
  readonly authorizeCalls: AuthorizeCall[];
  readonly exchangeCalls: Readonly<Record<string, string>>[];
  identity: SsoIdentity | null;
}

/** Test adaptörü: authorize adresi üretir, kimliği sabit döndürür. */
function createFakeSsoProvider(identity: SsoIdentity | null): FakeSsoProvider {
  const authorizeCalls: AuthorizeCall[] = [];
  const exchangeCalls: Record<string, string>[] = [];
  const fake: FakeSsoProvider = {
    authorizeCalls,
    exchangeCalls,
    identity,
    provider: {
      buildAuthorizeUrl(state, nonce, returnTo) {
        authorizeCalls.push({ state, nonce, returnTo });
        return `https://idp.example.invalid/authorize?state=${encodeURIComponent(state)}`;
      },
      exchange(params) {
        exchangeCalls.push({ ...params });
        return Promise.resolve(fake.identity);
      },
    },
  };
  return fake;
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
  /** `null` verilirse adaptör yoktur; uçlar 404 döner. */
  readonly sso?: SsoDeps | null;
}

function createHarness(options: HarnessOptions = {}) {
  const store = createMemoryAuthStore({ users: options.users ?? [student()] });
  const fake = createFakeSsoProvider({ subject: SUBJECT, username: "ornek.ogrenci" });
  const sso: SsoDeps | null =
    options.sso === undefined
      ? { provider: fake.provider, stateSecret: STATE_SECRET, stateTtlMs: DEFAULT_SSO_STATE_TTL_MS }
      : options.sso;
  let clock = FIXED_NOW;
  const auth: AuthDeps = {
    sessions: store.repos.sessions,
    users: store.repos.users,
    audit: store.repos.audit,
    nodeEnv: "development",
    devEnabled: true,
    sessionIdleMs: DEFAULT_SESSION_IDLE_MS,
    sessionAbsoluteMs: DEFAULT_SESSION_ABSOLUTE_MS,
    sso,
  };
  const adminStore = createMemoryAdminStore();
  const newId = () => "00000000-0000-4000-8000-0000000000ff";
  const admin: AdminDeps = {
    auth,
    users: adminStore.users,
    bulk: createMemoryAdminBulkRepo(adminStore),
    roles: createMemoryAdminRoleRepo(adminStore),
    imports: createMemoryAdminImportRepo(adminStore, newId).repo,
    newId,
  };
  const gamification = createMemoryGamificationRepo().repo;
  const app = createApp({ db: fakeDb(), now: () => clock, auth, gamification, admin });
  return {
    app,
    store,
    fake,
    advance(ms: number) {
      clock += ms;
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

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

async function start(harness: Harness, returnTo?: string) {
  const query = returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  return harness.app.request(`/auth/sso/start${query}`);
}

/** Başlatılan akışın imzalı çerezini ve state/nonce değerlerini çözer. */
async function startWithState(harness: Harness, returnTo?: string) {
  const response = await start(harness, returnTo);
  const cookie = cookieValue(response, SSO_STATE_COOKIE) ?? "";
  const payload = verifySsoState(cookie, STATE_SECRET, FIXED_NOW);
  if (payload === null) throw new Error("state çerezi doğrulanamadı");
  return { response, cookie, ...payload };
}

/** Sorgu dizesi; `URLSearchParams` kök tsconfig lib'inde yoktur (ES2022). */
function queryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

async function callback(
  harness: Harness,
  cookie: string | undefined,
  params: Record<string, string>,
) {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SSO_STATE_COOKIE}=${cookie}`;
  return harness.app.request(`/auth/sso/callback?${queryString(params)}`, { headers });
}

async function login(harness: Harness, returnTo?: string) {
  const started = await startWithState(harness, returnTo);
  const response = await callback(harness, started.cookie, {
    code: "tek-kullanimlik-kod",
    state: started.state,
  });
  return { response, started };
}

describe("SSO uçları yapılandırma (E3 §a)", () => {
  it("adaptör yoksa start ve callback 404 döner", async () => {
    const harness = createHarness({ sso: null });
    const startResponse = await harness.app.request("/auth/sso/start");
    expect(startResponse.status).toBe(404);
    expect(await startResponse.json()).toMatchObject({ error: { code: "not_found" } });

    const callbackResponse = await harness.app.request("/auth/sso/callback?code=kod&state=durum");
    expect(callbackResponse.status).toBe(404);
  });
});

describe("returnTo süzgeci (E3 §a kural 1)", () => {
  it("mutlak adresi reddeder ve dönüşte '/' kullanır", async () => {
    const harness = createHarness();
    const started = await startWithState(harness, "https://kotu.example/panel");
    expect(harness.fake.authorizeCalls[0]?.returnTo).toBe("/");

    const response = await callback(harness, started.cookie, {
      code: "kod",
      state: started.state,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("protokol-göreli, ters bölülü ve denetim karakterli değerleri reddeder", async () => {
    const harness = createHarness();
    await start(harness, "//kotu.example");
    await start(harness, "/\\kotu.example");
    await start(harness, "/panel\r\nKonum: https://kotu.example");
    expect(harness.fake.authorizeCalls.map((call) => call.returnTo)).toEqual(["/", "/", "/"]);
  });

  it("göreli yolu korur ve dönüşte kullanır", async () => {
    const harness = createHarness();
    const started = await startWithState(harness, "/panel?sekme=1");
    expect(harness.fake.authorizeCalls[0]?.returnTo).toBe("/panel?sekme=1");

    const response = await callback(harness, started.cookie, {
      code: "kod",
      state: started.state,
    });
    expect(response.headers.get("location")).toBe("/panel?sekme=1");
  });
});

describe("state ve nonce (E3 §a)", () => {
  it("kısa ömürlü, imzalı ve HttpOnly çerez kurar; nonce adaptöre geçer", async () => {
    const harness = createHarness();
    const started = await startWithState(harness);
    const header = setCookieHeader(started.response, SSO_STATE_COOKIE) ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${DEFAULT_SSO_STATE_TTL_MS / 1000}`);
    expect(header).not.toContain("Domain=");
    expect(header).not.toContain("Secure");

    // 256 bit base64url: state ve nonce tahmin edilemez olmalıdır.
    expect(started.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(harness.fake.authorizeCalls[0]?.state).toBe(started.state);
    expect(harness.fake.authorizeCalls[0]?.nonce).toBe(started.nonce);
  });

  it("state uyuşmazlığı 401 auth_state_invalid; adaptör çağrılmaz", async () => {
    const harness = createHarness();
    const started = await startWithState(harness);
    const response = await callback(harness, started.cookie, {
      code: "kod",
      state: "yanlis-durum",
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_state_invalid" } });
    expect(harness.fake.exchangeCalls).toEqual([]);
    expect(harness.store.sessionRecords.size).toBe(0);
  });

  it("çerez yoksa ya da kurcalanmışsa 401 döner", async () => {
    const harness = createHarness();
    const started = await startWithState(harness);

    const missing = await callback(harness, undefined, { code: "kod", state: started.state });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: { code: "auth_state_invalid" } });

    const tampered = await callback(harness, `${started.cookie}x`, {
      code: "kod",
      state: started.state,
    });
    expect(tampered.status).toBe(401);
  });

  it("süresi geçen state çerezi reddedilir", async () => {
    const harness = createHarness();
    const started = await startWithState(harness);
    harness.advance(DEFAULT_SSO_STATE_TTL_MS);

    const response = await callback(harness, started.cookie, {
      code: "kod",
      state: started.state,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_state_invalid" } });
  });

  it("başarılı dönüşte state çerezi silinir", async () => {
    const harness = createHarness();
    const { response } = await login(harness);
    expect(response.status).toBe(302);
    expect(setCookieHeader(response, SSO_STATE_COOKIE)).toContain("Max-Age=0");
  });
});

describe("kullanıcı eşleme (E3 §a kural 2)", () => {
  it("bilinmeyen kullanıcıyı reddeder ve audit'ler", async () => {
    const harness = createHarness();
    harness.fake.identity = { subject: SUBJECT, username: "yok.boyle" };
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_denied_unknown_user" } });
    expect(harness.store.sessionRecords.size).toBe(0);
    expect(harness.store.auditEntries).toEqual([
      expect.objectContaining({
        action: "auth.login_denied",
        actorUserId: null,
        summaryAfter: { reason: "unknown_user", provider: "sso" },
      }),
    ]);
  });

  it("e-posta ile büyük/küçük harf duyarsız eşler", async () => {
    const harness = createHarness();
    harness.fake.identity = { subject: SUBJECT, email: "OGRENCI@EXAMPLE.INVALID" };
    const { response } = await login(harness);
    expect(response.status).toBe(302);
    expect(harness.store.userRecords.get(STUDENT_ID)?.ssoSubject).toBe(SUBJECT);
  });

  it("eşleme anahtarı yoksa reddeder", async () => {
    const harness = createHarness();
    harness.fake.identity = { subject: SUBJECT };
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(harness.store.auditEntries[0]).toMatchObject({
      summaryAfter: { reason: "missing_mapping_key", provider: "sso" },
    });
  });

  it("silinmiş kullanıcı eşlemeye girmez", async () => {
    const harness = createHarness({ users: [student({ status: "deleted" })] });
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_denied_unknown_user" } });
    expect(harness.store.sessionRecords.size).toBe(0);
  });

  it("askıdaki kullanıcıyı ayrı kodla reddeder ve audit'ler", async () => {
    const harness = createHarness({ users: [student({ status: "suspended" })] });
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_denied_suspended" } });
    expect(harness.store.auditEntries[0]).toMatchObject({
      action: "auth.login_denied",
      actorUserId: STUDENT_ID,
      institutionId: INSTITUTION_ID,
      summaryAfter: { reason: "suspended", provider: "sso" },
    });
    expect(harness.store.sessionRecords.size).toBe(0);
  });

  it("dev kullanıcısı SSO ile oturum açamaz (kural 4)", async () => {
    const harness = createHarness({ users: [student({ authMethod: "dev" })] });
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_denied_unknown_user" } });
    expect(harness.store.auditEntries[0]).toMatchObject({
      summaryAfter: { reason: "auth_method_mismatch", provider: "sso" },
    });
    expect(harness.store.sessionRecords.size).toBe(0);
  });

  it("rolsüz kullanıcıya oturum açmaz", async () => {
    const harness = createHarness({ users: [student({ roles: [] })] });
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(harness.store.auditEntries[0]).toMatchObject({
      summaryAfter: { reason: "no_role", provider: "sso" },
    });
  });

  it("assertion doğrulanamazsa 401 auth_state_invalid ve audit", async () => {
    const harness = createHarness();
    harness.fake.identity = null;
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_state_invalid" } });
    expect(harness.store.auditEntries[0]).toMatchObject({
      action: "auth.login_denied",
      actorUserId: null,
      summaryAfter: { reason: "invalid_assertion", provider: "sso" },
    });
  });
});

describe("subject bağlama (E3 §a kural 2)", () => {
  it("ilk girişte subject bağlar, invited → active ve last_login_at yazar", async () => {
    const harness = createHarness({ users: [student({ status: "invited" })] });
    const { response } = await login(harness);
    expect(response.status).toBe(302);
    expect(harness.store.userRecords.get(STUDENT_ID)).toMatchObject({
      ssoSubject: SUBJECT,
      status: "active",
      lastLoginAt: FIXED_NOW,
    });
    expect(harness.store.auditEntries).toEqual([]);
  });

  it("bağlı subject aynıysa giriş sürer", async () => {
    const harness = createHarness({ users: [student({ ssoSubject: SUBJECT })] });
    expect((await login(harness)).response.status).toBe(302);
  });

  it("farklı subject 401 auth_subject_mismatch; bağ korunur ve audit yazılır", async () => {
    const harness = createHarness({ users: [student({ ssoSubject: SUBJECT })] });
    expect((await login(harness)).response.status).toBe(302);

    harness.fake.identity = { subject: "baska-subject", username: "ornek.ogrenci" };
    const { response } = await login(harness);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "auth_subject_mismatch" } });
    expect(harness.store.userRecords.get(STUDENT_ID)?.ssoSubject).toBe(SUBJECT);
    expect(harness.store.auditEntries).toEqual([
      expect.objectContaining({
        action: "auth.login_denied",
        actorUserId: STUDENT_ID,
        institutionId: INSTITUTION_ID,
        summaryAfter: { reason: "subject_mismatch", provider: "sso" },
      }),
    ]);
  });
});

describe("oturum açılışı", () => {
  it("302 returnTo döner; oturum ve CSRF çerezi kurar; /auth/me oturumu görür", async () => {
    const harness = createHarness();
    const { response } = await login(harness, "/panel");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/panel");

    const token = cookieValue(response, SESSION_COOKIE) ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieValue(response, CSRF_COOKIE)).not.toBe("");
    expect(harness.store.sessionRecords.get(sessionIdForToken(token))).toMatchObject({
      userId: STUDENT_ID,
      authMethod: "sso",
      createdAt: FIXED_NOW,
      revokedAt: null,
    });

    const me = await harness.app.request("/auth/me", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      data: { id: STUDENT_ID, displayName: "Örnek Öğrenci" },
    });
  });

  it("çerez öznitelikleri: HttpOnly, SameSite=Lax, Path=/, Domain yok", async () => {
    const harness = createHarness();
    const { response } = await login(harness);
    const sessionHeader = setCookieHeader(response, SESSION_COOKIE) ?? "";
    expect(sessionHeader).toContain("HttpOnly");
    expect(sessionHeader).toContain("SameSite=Lax");
    expect(sessionHeader).toContain("Path=/");
    expect(sessionHeader).not.toContain("Domain=");
    expect(setCookieHeader(response, CSRF_COOKIE)).not.toContain("HttpOnly");
  });

  it("mevcut oturum belirteci iptal edilir (sabitleme koruması)", async () => {
    const harness = createHarness();
    const first = await login(harness);
    const firstToken = cookieValue(first.response, SESSION_COOKIE) ?? "";

    const started = await startWithState(harness);
    const response = await harness.app.request(
      `/auth/sso/callback?${queryString({ code: "kod", state: started.state })}`,
      {
        headers: {
          cookie: `${SSO_STATE_COOKIE}=${started.cookie}; ${SESSION_COOKIE}=${firstToken}`,
        },
      },
    );
    expect(response.status).toBe(302);
    const secondToken = cookieValue(response, SESSION_COOKIE) ?? "";
    expect(secondToken).not.toBe(firstToken);
    expect(harness.store.sessionRecords.get(sessionIdForToken(firstToken))?.revokedAt).not.toBeNull();

    const me = await harness.app.request("/auth/me", {
      headers: { cookie: `${SESSION_COOKIE}=${firstToken}` },
    });
    expect(me.status).toBe(401);
  });
});

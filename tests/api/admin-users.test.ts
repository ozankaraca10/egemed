import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { createMemoryAdminBulkRepo } from "../../apps/api/src/admin/bulk";
import { createMemoryAdminImportRepo } from "../../apps/api/src/admin/imports";
import { createMemoryAdminRoleRepo } from "../../apps/api/src/admin/roles";
import {
  DuplicateMappingKeyError,
  createMemoryAdminStore,
  createPgAdminUsersRepo,
  toIstanbulIso,
  type MemoryAdminUserSeed,
  type NewAdminUser,
} from "../../apps/api/src/admin/users";
import { createMemoryAuthStore, type MemoryUserSeed } from "../../apps/api/src/auth/repo";
import type { AuthDeps } from "../../apps/api/src/auth/routes";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  DEFAULT_SESSION_ABSOLUTE_MS,
  DEFAULT_SESSION_IDLE_MS,
  SESSION_COOKIE,
  sessionIdForToken,
} from "../../apps/api/src/auth/session";
import type { AuthMethod, Role, SimId, UserStatus } from "../../packages/contracts/src/index";

// T65 — E3 §b/§d `/admin/users` sözleşmesi. DB gerekmez: bellek depoları,
// enjekte edilen sabit saat ve sayaçlı kimlik üretimi kullanılır. Yalnız
// `/admin/users` yüzeyi sınanır; oturum çekirdeği `session.test.ts`tedir.

const FIXED_NOW = 1_700_000_000_000;
const SEED_CREATED_AT = FIXED_NOW - 1000;
const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";
const OTHER_INSTITUTION_ID = "00000000-0000-4000-8000-000000000099";
const UNIT_ID = "00000000-0000-4000-8000-000000000020";
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const ALI_ID = "00000000-0000-4000-8000-000000000011";
const BORA_ID = "00000000-0000-4000-8000-000000000012";
const CEREN_ID = "00000000-0000-4000-8000-000000000013";
const DERYA_ID = "00000000-0000-4000-8000-000000000014";
const FIRST_GENERATED_ID = "10000000-0000-4000-8000-000000000001";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface HarnessUser {
  readonly id: string;
  readonly institutionId: string;
  readonly unitId: string | null;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status: UserStatus;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
}

function user(overrides: Partial<HarnessUser> & { readonly id: string }): HarnessUser {
  return {
    institutionId: INSTITUTION_ID,
    unitId: null,
    username: null,
    email: null,
    displayName: "Örnek Kullanıcı",
    authMethod: "sso",
    status: "active",
    roles: ["kullanici"],
    simAccess: [],
    ...overrides,
  };
}

const ADMIN_USER = user({
  id: ADMIN_ID,
  username: "ornek.yonetici",
  email: "yonetici@example.invalid",
  displayName: "Deniz Yönetici",
  authMethod: "dev",
  roles: ["admin"],
  simAccess: ["pulse", "ausculta", "opaca"],
});
const ALI = user({
  id: ALI_ID,
  username: "ali.veli",
  email: "ali.veli@example.invalid",
  displayName: "Ali Veli",
  authMethod: "dev",
  unitId: UNIT_ID,
  simAccess: ["pulse"],
});
const BORA = user({
  id: BORA_ID,
  username: "bora.kaya",
  displayName: "Bora Kaya",
  status: "suspended",
  simAccess: ["opaca"],
});
const CEREN = user({
  id: CEREN_ID,
  username: "ceren.demir",
  displayName: "Ceren Demir",
  status: "invited",
});
const DERYA = user({
  id: DERYA_ID,
  username: "derya.uzak",
  displayName: "Derya Uzak",
  institutionId: OTHER_INSTITUTION_ID,
});

const DEFAULT_USERS: readonly HarnessUser[] = [ADMIN_USER, ALI, BORA, CEREN, DERYA];
const UNITS = [{ id: UNIT_ID, institutionId: INSTITUTION_ID, name: "3. Sınıf" }];

const CREATE_BODY = {
  username: "yeni.ogrenci",
  email: "yeni.ogrenci@example.invalid",
  displayName: "Yeni Öğrenci",
  authMethod: "sso",
  role: "kullanici",
  unitId: UNIT_ID,
  simAccess: ["pulse", "opaca"],
} as const;

function toAuthSeed(seed: HarnessUser): MemoryUserSeed {
  return {
    id: seed.id,
    username: seed.username,
    displayName: seed.displayName,
    authMethod: seed.authMethod,
    status: seed.status,
    institutionId: seed.institutionId,
    institutionName: "Örnek Kurum",
    roles: seed.roles,
    simAccess: seed.simAccess,
  };
}

function toAdminSeed(seed: HarnessUser): MemoryAdminUserSeed {
  return {
    id: seed.id,
    institutionId: seed.institutionId,
    unitId: seed.unitId,
    username: seed.username,
    email: seed.email,
    displayName: seed.displayName,
    authMethod: seed.authMethod,
    status: seed.status,
    roles: seed.roles,
    simAccess: seed.simAccess,
    createdAt: SEED_CREATED_AT,
    lastLoginAt: null,
  };
}

function fakeDb() {
  return {
    query() {
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

function createHarness(options: { readonly users?: readonly HarnessUser[] } = {}) {
  const users = options.users ?? DEFAULT_USERS;
  const authStore = createMemoryAuthStore({ users: users.map(toAuthSeed) });
  const adminStore = createMemoryAdminStore({
    users: users.map(toAdminSeed),
    units: UNITS,
  });
  let clock = FIXED_NOW;
  let generated = 0;
  const newId = () => {
    generated += 1;
    return `10000000-0000-4000-8000-${String(generated).padStart(12, "0")}`;
  };
  const auth: AuthDeps = {
    sessions: authStore.repos.sessions,
    users: authStore.repos.users,
    audit: authStore.repos.audit,
    nodeEnv: "development",
    devEnabled: true,
    sessionIdleMs: DEFAULT_SESSION_IDLE_MS,
    sessionAbsoluteMs: DEFAULT_SESSION_ABSOLUTE_MS,
  };
  const app = createApp({
    db: fakeDb(),
    now: () => clock,
    auth,
    admin: {
      auth,
      users: adminStore.users,
      bulk: createMemoryAdminBulkRepo(adminStore),
      roles: createMemoryAdminRoleRepo(adminStore),
      imports: createMemoryAdminImportRepo(adminStore, newId).repo,
      newId,
    },
  });
  return {
    app,
    authStore,
    adminStore,
    advance(ms: number) {
      clock += ms;
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

interface CookieResponse {
  readonly headers: { getSetCookie(): string[] };
}

function cookieValue(response: CookieResponse, name: string): string | undefined {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return header === undefined ? undefined : header.slice(name.length + 1).split(";")[0];
}

interface Login {
  readonly headers: Record<string, string>;
  readonly token: string;
}

async function login(harness: Harness, username: string): Promise<Login> {
  const response = await harness.app.request("/auth/dev/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  expect(response.status).toBe(200);
  const token = cookieValue(response, SESSION_COOKIE) ?? "";
  const csrf = cookieValue(response, CSRF_COOKIE) ?? "";
  return {
    headers: { cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`, [CSRF_HEADER]: csrf },
    token,
  };
}

function auditActions(harness: Harness): string[] {
  return harness.authStore.auditEntries.map((entry) => entry.action);
}

describe("yetki (E3 §b kural 3-4)", () => {
  it("oturumsuz istek 401 unauthorized döner", async () => {
    const harness = createHarness();
    const response = await harness.app.request("/admin/users");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("kullanici rolü admin alanına giremez: 403 forbidden", async () => {
    const harness = createHarness();
    const ali = await login(harness, "ali.veli");
    for (const request of [
      harness.app.request("/admin/users", { headers: ali.headers }),
      harness.app.request(`/admin/users/${ALI_ID}`, { headers: ali.headers }),
      harness.app.request("/admin/users", {
        method: "POST",
        headers: { ...ali.headers, "content-type": "application/json" },
        body: JSON.stringify(CREATE_BODY),
      }),
    ]) {
      const response = await request;
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    }
    expect(harness.adminStore.records.size).toBe(DEFAULT_USERS.length);
    expect(auditActions(harness)).toEqual([]);
  });

  it("mutasyon CSRF belirteci olmadan reddedilir", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: { cookie: admin.headers.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify(CREATE_BODY),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  });
});

describe("GET /admin/users liste (E3 §d)", () => {
  it("varsayılan sayfalama ve sözleşme alanlarıyla döner", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", { headers: admin.headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 4 });
    expect(body.data.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Ali Veli",
      "Bora Kaya",
      "Ceren Demir",
      "Deniz Yönetici",
    ]);
    expect(body.data[0]).toEqual({
      id: ALI_ID,
      displayName: "Ali Veli",
      username: "ali.veli",
      email: "ali.veli@example.invalid",
      roles: ["kullanici"],
      unitId: UNIT_ID,
      unitName: "3. Sınıf",
      status: "active",
      authMethod: "dev",
      createdAt: "2023-11-15T01:13:19.000+03:00",
      lastLoginAt: null,
    });
    expect(JSON.stringify(body)).not.toContain("sso_subject");
  });

  it("filtreleri sunucuda uygular (rol, durum, giriş tipi, birim, arama)", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const names = async (query: string): Promise<string[]> => {
      const response = await harness.app.request(`/admin/users?${query}`, { headers: admin.headers });
      expect(response.status).toBe(200);
      const body = await response.json();
      return body.data.map((row: { displayName: string }) => row.displayName);
    };

    expect(await names("role=kullanici")).toEqual(["Ali Veli", "Bora Kaya", "Ceren Demir"]);
    expect(await names("status=suspended")).toEqual(["Bora Kaya"]);
    expect(await names("authMethod=sso")).toEqual(["Bora Kaya", "Ceren Demir"]);
    expect(await names(`unitId=${UNIT_ID}`)).toEqual(["Ali Veli"]);
    expect(await names("q=veli")).toEqual(["Ali Veli"]);
    expect(await names("q=yok.boyle")).toEqual([]);
  });

  it("sayfalar ve sıralamayı uygular", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users?page=2&pageSize=2&order=desc", {
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 4 });
    expect(body.data.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Bora Kaya",
      "Ali Veli",
    ]);
  });

  it("geçersiz sorgu parametresini 400 invalid_request ile reddeder", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users?pageSize=101", {
      headers: admin.headers,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });
});

describe("POST /admin/users oluşturma (E3 §d)", () => {
  it("201 döner; kullanıcı invited durumda, rol ve sim erişimiyle yazılır", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: {
        ...admin.headers,
        "content-type": "application/json",
        "x-request-id": "test-admin-users-0001",
      },
      body: JSON.stringify(CREATE_BODY),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: FIRST_GENERATED_ID,
      displayName: "Yeni Öğrenci",
      username: "yeni.ogrenci",
      email: "yeni.ogrenci@example.invalid",
      roles: ["kullanici"],
      unitId: UNIT_ID,
      unitName: "3. Sınıf",
      status: "invited",
      authMethod: "sso",
      simAccess: ["pulse", "opaca"],
      lastLoginAt: null,
      deletedAt: null,
    });
    expect(body.data.createdAt).toBe(toIstanbulIso(FIXED_NOW));

    const record = harness.adminStore.records.get(FIRST_GENERATED_ID);
    expect(record).toMatchObject({
      status: "invited",
      roles: ["kullanici"],
      simAccess: ["pulse", "opaca"],
      unitId: UNIT_ID,
      createdAt: FIXED_NOW,
      deletedAt: null,
    });
    expect(harness.authStore.auditEntries).toHaveLength(1);
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.create",
      actorUserId: ADMIN_ID,
      actorRole: "admin",
      institutionId: INSTITUTION_ID,
      targetType: "user",
      targetId: FIRST_GENERATED_ID,
      summaryAfter: { status: "invited", authMethod: "sso", roles: "kullanici" },
      requestId: "test-admin-users-0001",
    });
  });

  it("eşleme anahtarı çakışmasını 409 duplicate_mapping_key ile reddeder", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const create = (body: Record<string, unknown>) =>
      harness.app.request("/admin/users", {
        method: "POST",
        headers: { ...admin.headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const username = await create({ ...CREATE_BODY, username: "ali.veli", email: "baska@example.invalid" });
    expect(username.status).toBe(409);
    expect(await username.json()).toMatchObject({
      error: { code: "duplicate_mapping_key", details: { field: "username" } },
    });

    const email = await create({ ...CREATE_BODY, username: "baska.kullanici", email: "ALI.VELI@EXAMPLE.INVALID" });
    expect(email.status).toBe(409);
    expect(await email.json()).toMatchObject({
      error: { code: "duplicate_mapping_key", details: { field: "email" } },
    });
    expect(harness.adminStore.records.size).toBe(DEFAULT_USERS.length);
  });

  it("eşleme anahtarı yoksa 422 validation_failed döner", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: { ...admin.headers, "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Kimliksiz Kullanıcı",
        authMethod: "sso",
        role: "kullanici",
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "mapping_key_required" }] } },
    });
  });

  it("admin rolü bu uçla atanamaz: 403 role_not_permitted", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: { ...admin.headers, "content-type": "application/json" },
      body: JSON.stringify({ ...CREATE_BODY, role: "admin" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    expect(harness.adminStore.records.size).toBe(DEFAULT_USERS.length);
    expect(auditActions(harness)).toEqual([]);
  });

  it("bilinmeyen birimi 422 validation_failed ile reddeder", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: { ...admin.headers, "content-type": "application/json" },
      body: JSON.stringify({ ...CREATE_BODY, unitId: "00000000-0000-4000-8000-0000000000ff" }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "unknown_unit" }] } },
    });
  });

  it("biçim hatasını 400 invalid_request ile reddeder", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users", {
      method: "POST",
      headers: { ...admin.headers, "content-type": "application/json" },
      body: JSON.stringify({ ...CREATE_BODY, username: "BÜYÜK.HARF" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });
});

describe("PATCH /admin/users/:id (E3 §d)", () => {
  async function patch(harness: Harness, admin: Login, body: Record<string, unknown>, id = ALI_ID) {
    return harness.app.request(`/admin/users/${id}`, {
      method: "PATCH",
      headers: { ...admin.headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("görünen ad, birim ve eşleme anahtarını günceller; audit yazar", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await patch(harness, admin, {
      displayName: "Ali Veli Güncel",
      unitId: null,
      email: "ali.guncel@example.invalid",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      displayName: "Ali Veli Güncel",
      unitId: null,
      unitName: null,
      email: "ali.guncel@example.invalid",
      username: "ali.veli",
    });
    expect(harness.adminStore.records.get(ALI_ID)).toMatchObject({
      displayName: "Ali Veli Güncel",
      email: "ali.guncel@example.invalid",
      updatedAt: FIXED_NOW,
    });
    expect(harness.authStore.auditEntries).toHaveLength(1);
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.update",
      targetId: ALI_ID,
      summaryBefore: { displayName: "Ali Veli", email: "ali.veli@example.invalid" },
      summaryAfter: { displayName: "Ali Veli Güncel", email: "ali.guncel@example.invalid" },
    });
  });

  it("çakışan eşleme anahtarını 409 ile reddeder", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await patch(harness, admin, { username: "bora.kaya" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "duplicate_mapping_key", details: { field: "username" } },
    });
    expect(harness.adminStore.records.get(ALI_ID)?.username).toBe("ali.veli");
  });

  it("eşleme anahtarı boş bırakılamaz: 422", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");

    const bothNull = await patch(harness, admin, { username: null, email: null });
    expect(bothNull.status).toBe(422);

    const ceren = await patch(harness, admin, { username: null }, CEREN_ID);
    expect(ceren.status).toBe(422);
    expect(await ceren.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("sso_subject ve rol PATCH ile düzenlenemez: 400", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    for (const body of [{ ssoSubject: "idp-kimligi" }, { role: "admin" }, {}]) {
      const response = await patch(harness, admin, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    }
  });

  it("kapsam dışı ve silinmiş kullanıcı 404 döner", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const other = await patch(harness, admin, { displayName: "Derya Güncel" }, DERYA_ID);
    expect(other.status).toBe(404);

    await patch(harness, admin, { displayName: "Ali Silinecek" });
    await harness.app.request(`/admin/users/${ALI_ID}`, { method: "DELETE", headers: admin.headers });
    const afterDelete = await patch(harness, admin, { displayName: "Ali Tekrar" });
    expect(afterDelete.status).toBe(404);
    const detail = await harness.app.request(`/admin/users/${ALI_ID}`, { headers: admin.headers });
    expect(detail.status).toBe(404);
  });
});

describe("askıya al / etkinleştir / sil (E3 §a, §d)", () => {
  it("askıya alma durumu değiştirir, oturumları iptal eder ve audit yazar", async () => {
    const harness = createHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");

    const response = await harness.app.request(`/admin/users/${ALI_ID}/suspend`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("suspended");
    expect(harness.adminStore.records.get(ALI_ID)?.status).toBe("suspended");
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBe(
      FIXED_NOW,
    );
    const me = await harness.app.request("/auth/me", { headers: ali.headers });
    expect(me.status).toBe(401);
    expect(harness.authStore.auditEntries).toHaveLength(1);
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.suspend",
      targetId: ALI_ID,
      summaryBefore: { status: "active" },
      summaryAfter: { status: "suspended" },
    });

    // Yineleme durum değiştirmez; ek audit yazılmaz.
    const again = await harness.app.request(`/admin/users/${ALI_ID}/suspend`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(again.status).toBe(200);
    expect(auditActions(harness)).toEqual(["user.suspend"]);
  });

  it("etkinleştirme invited/suspended durumunu active yapar", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request(`/admin/users/${BORA_ID}/activate`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("active");
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.activate",
      targetId: BORA_ID,
      summaryBefore: { status: "suspended" },
      summaryAfter: { status: "active" },
    });
  });

  it("yumuşak silme deleted_at yazar, oturumları iptal eder; ikinci silme 409", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");

    const first = await harness.app.request(`/admin/users/${CEREN_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.data).toMatchObject({
      status: "deleted",
      deletedAt: toIstanbulIso(FIXED_NOW),
    });
    expect(harness.adminStore.records.get(CEREN_ID)?.deletedAt).toBe(FIXED_NOW);

    const second = await harness.app.request(`/admin/users/${CEREN_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: "already_deleted" } });

    const list = await harness.app.request("/admin/users", { headers: admin.headers });
    const listed = (await list.json()).data as { id: string }[];
    expect(listed.map((row) => row.id)).not.toContain(CEREN_ID);
    expect(harness.authStore.auditEntries.at(-1)).toMatchObject({
      action: "user.delete",
      targetId: CEREN_ID,
      summaryAfter: { status: "deleted" },
    });
  });

  it("silinen kullanıcının açık oturumu iptal edilir", async () => {
    const harness = createHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request(`/admin/users/${ALI_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(response.status).toBe(200);
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBe(
      FIXED_NOW,
    );
    expect((await harness.app.request("/auth/me", { headers: ali.headers })).status).toBe(401);
  });

  it("kapsam dışı kullanıcı 404; geçersiz kimlik 404 döner", async () => {
    const harness = createHarness();
    const admin = await login(harness, "ornek.yonetici");
    const other = await harness.app.request(`/admin/users/${DERYA_ID}/suspend`, {
      method: "POST",
      headers: admin.headers,
    });
    expect(other.status).toBe(404);
    const malformed = await harness.app.request("/admin/users/gecersiz-kimlik", {
      headers: admin.headers,
    });
    expect(malformed.status).toBe(404);
  });
});

describe("zaman biçimi (AGENTS.md: Europe/Istanbul)", () => {
  it("epoch milisaniyeyi İstanbul ofsetli ISO 8601 dizgesine çevirir", () => {
    // 1970'te Türkiye kışın +02:00 kullanıyordu; ofset tarihten hesaplanır.
    expect(toIstanbulIso(0)).toBe("1970-01-01T02:00:00.000+02:00");
    expect(toIstanbulIso(FIXED_NOW)).toBe("2023-11-15T01:13:20.000+03:00");
    expect(toIstanbulIso(FIXED_NOW + 123)).toBe("2023-11-15T01:13:20.123+03:00");
  });
});

describe("PostgreSQL deposu (parametreli sorgu)", () => {
  it("arama girdisini SQL metnine gömmez, parametre olarak taşır", async () => {
    const calls: { readonly text: string; readonly params: readonly unknown[] }[] = [];
    const repo = createPgAdminUsersRepo({
      query(text, params) {
        calls.push({ text, params });
        return Promise.resolve({ rows: [] });
      },
    });
    const injected = "%'; drop table users; --";
    const result = await repo.list({
      institutionId: INSTITUTION_ID,
      q: injected,
      sort: "displayName",
      order: "asc",
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual({ rows: [], total: 0 });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.text).not.toContain("drop table");
      expect(call.text).not.toContain("';");
    }
    const listCall = calls[1];
    expect(listCall?.params.slice(-2)).toEqual([20, 0]);
    expect(
      listCall?.params.some((value) => typeof value === "string" && value.includes("drop table users")),
    ).toBe(true);
  });

  it("23505 tekil ihlalini 409 duplicate_mapping_key alanına eşler", async () => {
    const input: NewAdminUser = {
      id: FIRST_GENERATED_ID,
      institutionId: INSTITUTION_ID,
      unitId: null,
      username: "yeni.ogrenci",
      email: "yeni.ogrenci@example.invalid",
      displayName: "Yeni Öğrenci",
      authMethod: "sso",
      xapiActorId: "act-00000000-0000-4000-8000-0000000000ff",
      role: "kullanici",
      simAccess: ["pulse"],
      createdAt: FIXED_NOW,
      grantedBy: ADMIN_ID,
    };
    const constraint = (name: string) =>
      createPgAdminUsersRepo({
        query: () =>
          Promise.reject(Object.assign(new Error("tekil ihlal"), { code: "23505", constraint: name })),
      });
    const usernameError = await constraint("users_institution_username_key")
      .create(input)
      .catch((error: unknown) => error);
    expect(usernameError).toBeInstanceOf(DuplicateMappingKeyError);
    expect((usernameError as DuplicateMappingKeyError).field).toBe("username");
    const emailError = await constraint("users_institution_email_key")
      .create(input)
      .catch((error: unknown) => error);
    expect((emailError as DuplicateMappingKeyError).field).toBe("email");
    expect(FIRST_GENERATED_ID).toMatch(UUID_PATTERN);
    expect(input.xapiActorId).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });
});

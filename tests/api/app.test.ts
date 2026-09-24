import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "../../packages/contracts/src/index";
import { createApp } from "../../apps/api/src/app";
import { createMemoryAdminBulkRepo } from "../../apps/api/src/admin/bulk";
import { createMemoryAdminImportRepo } from "../../apps/api/src/admin/imports";
import { createMemoryAdminRoleRepo } from "../../apps/api/src/admin/roles";
import { createMemoryAdminStore, type AdminDeps } from "../../apps/api/src/admin/users";
import { createMemoryAuthStore } from "../../apps/api/src/auth/repo";
import type { AuthDeps } from "../../apps/api/src/auth/routes";
import { createMemoryGamificationRepo } from "../../apps/api/src/me/gamification";
import {
  DEFAULT_SESSION_ABSOLUTE_MS,
  DEFAULT_SESSION_IDLE_MS,
} from "../../apps/api/src/auth/session";
import { EnvValidationError, loadEnv } from "../../apps/api/src/env";

// T62 — E3 §d iskelet sözleşmesi: request_id, hata zarfı, güvenlik başlıkları,
// sağlık uçları ve ortam doğrulaması. T63 ile uygulama `/auth/*` bağımlılıkları
// da alır; bu dosya yalnız iskelet sözleşmesini sınar (DB ve oturum gerekmez).

const FIXED_NOW = 1_700_000_000_000;
const GENERATED_ID_PATTERN =
  /^req-[0-9a-z]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATED_ID_PREFIX = `req-${FIXED_NOW.toString(36)}-`;

const SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["content-security-policy", "default-src 'none'; frame-ancestors 'none'"],
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
];

interface FakeCall {
  readonly text: string;
  readonly params: readonly unknown[];
}

/** Sahte havuz: çağrıları kaydeder, istenirse reddeder. */
function createFakeDb(options: { readonly fail?: Error } = {}) {
  const calls: FakeCall[] = [];
  const db = {
    calls,
    query(text: string, params: readonly unknown[]): Promise<unknown> {
      calls.push({ text, params });
      return options.fail === undefined
        ? Promise.resolve({ rows: [], rowCount: 0 })
        : Promise.reject(options.fail);
    },
  };
  return db;
}

function createTestAuth(): AuthDeps {
  const store = createMemoryAuthStore();
  return {
    sessions: store.repos.sessions,
    users: store.repos.users,
    audit: store.repos.audit,
    nodeEnv: "test",
    devEnabled: false,
    sessionIdleMs: DEFAULT_SESSION_IDLE_MS,
    sessionAbsoluteMs: DEFAULT_SESSION_ABSOLUTE_MS,
  };
}

function createTestApp(db = createFakeDb()) {
  const auth = createTestAuth();
  const store = createMemoryAdminStore();
  const newId = () => "00000000-0000-4000-8000-0000000000ff";
  const admin: AdminDeps = {
    auth,
    users: store.users,
    bulk: createMemoryAdminBulkRepo(store),
    roles: createMemoryAdminRoleRepo(store),
    imports: createMemoryAdminImportRepo(store, newId).repo,
    newId,
  };
  const gamification = createMemoryGamificationRepo().repo;
  return { app: createApp({ db, now: () => FIXED_NOW, auth, gamification, admin }), db };
}

describe("request_id ara katmanı", () => {
  it("geçerli gelen kimliği yanıta yansıtır", async () => {
    const { app } = createTestApp();
    const response = await app.request("/health", {
      headers: { "x-request-id": "izleme-kimligi-0001" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("izleme-kimligi-0001");
  });

  it("kimlik yoksa enjekte edilen saatle üretir", async () => {
    const { app } = createTestApp();
    const response = await app.request("/health");
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(GENERATED_ID_PATTERN);
    expect(requestId?.startsWith(GENERATED_ID_PREFIX)).toBe(true);
  });

  it("geçersiz gelen kimliği 400 invalid_request ile reddeder", async () => {
    const { app } = createTestApp();
    const response = await app.request("/health", { headers: { "x-request-id": "kisa-id" } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ error: { code: "invalid_request" } });
    // Geçersiz kimlik yansıtılmaz; yanıt izlenebilirlik için yeni kimlik taşır.
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(GENERATED_ID_PATTERN);
    expect(requestId).not.toBe("kisa-id");
  });
});

describe("hata zarfı", () => {
  it("bilinmeyen yolda 404 not_found döner ve kimlik üretir", async () => {
    const { app } = createTestApp();
    const response = await app.request("/bilinmeyen");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toMatch(GENERATED_ID_PATTERN);
    const body = await response.json();
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ error: { code: "not_found" } });
  });

  it("beklenmeyen hatada 500 internal_error döner, ayrıntı sızdırmaz", async () => {
    const secret = "gizli-ayrinti-42";
    const { app } = createTestApp(createFakeDb({ fail: new Error(`havuz koptu: ${secret}`) }));
    const response = await app.request("/health/db");
    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toMatch(GENERATED_ID_PATTERN);
    const text = await response.text();
    expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toEqual({ error: { code: "internal_error" } });
  });
});

describe("güvenlik başlıkları", () => {
  it("200, 400, 404 ve 500 yanıtlarının tamamına eklenir", async () => {
    const failing = createTestApp(createFakeDb({ fail: new Error("kapalı") }));
    const responses = [
      await createTestApp().app.request("/health"),
      await createTestApp().app.request("/health", { headers: { "x-request-id": "kisa-id" } }),
      await createTestApp().app.request("/bilinmeyen"),
      await failing.app.request("/health/db"),
    ];
    for (const response of responses) {
      for (const [name, value] of SECURITY_HEADERS) {
        expect(response.headers.get(name), name).toBe(value);
      }
    }
  });
});

describe("sağlık uçları", () => {
  it("/health veritabanına dokunmaz", async () => {
    const { app, db } = createTestApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(db.calls).toEqual([]);
  });

  it("/health/db havuzu parametreli tek sorguyla yoklar", async () => {
    const { app, db } = createTestApp();
    const response = await app.request("/health/db");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(db.calls).toEqual([{ text: "select 1", params: [] }]);
  });
});

describe("ortam doğrulaması", () => {
  const base = { DATABASE_URL: "postgres://localhost:5432/egemed" } as const;

  it("geçerli ortamı varsayılanlarla döndürür", () => {
    expect(loadEnv(base)).toEqual({
      DATABASE_URL: "postgres://localhost:5432/egemed",
      PORT: 3000,
      NODE_ENV: "development",
      AUTH_DEV_ENABLED: false,
      SESSION_IDLE_MINUTES: 30,
      SESSION_ABSOLUTE_HOURS: 12,
      SSO_PROVIDER: "none",
    });
  });

  it("boş değerleri varsayılan sayar", () => {
    const env = loadEnv({
      ...base,
      PORT: "",
      NODE_ENV: "",
      AUTH_DEV_ENABLED: "",
      SESSION_IDLE_MINUTES: "",
      SESSION_ABSOLUTE_HOURS: "",
    });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.AUTH_DEV_ENABLED).toBe(false);
  });

  it("eksik DATABASE_URL'i reddeder", () => {
    try {
      loadEnv({});
      expect.unreachable("eksik DATABASE_URL kabul edildi");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).keys).toContain("DATABASE_URL");
    }
  });

  it("geçersiz PORT'u reddeder", () => {
    expect(() => loadEnv({ ...base, PORT: "70000" })).toThrow(EnvValidationError);
  });

  it("üretimde AUTH_DEV_ENABLED=true'yu reddeder", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", AUTH_DEV_ENABLED: "true" }),
    ).toThrow(EnvValidationError);
  });

  it("üretim dışında AUTH_DEV_ENABLED=true'ya izin verir", () => {
    const env = loadEnv({ ...base, NODE_ENV: "test", AUTH_DEV_ENABLED: "true" });
    expect(env.AUTH_DEV_ENABLED).toBe(true);
  });

  it("oturum sürelerini env ile ayarlar", () => {
    const env = loadEnv({ ...base, SESSION_IDLE_MINUTES: "45", SESSION_ABSOLUTE_HOURS: "8" });
    expect(env.SESSION_IDLE_MINUTES).toBe(45);
    expect(env.SESSION_ABSOLUTE_HOURS).toBe(8);
  });

  it("SSO sağlayıcısı seçilirse imza anahtarını zorunlu kılar", () => {
    expect(() => loadEnv({ ...base, SSO_PROVIDER: "oidc" })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...base, SSO_STATE_SECRET: "kisa" })).toThrow(EnvValidationError);

    const secret = "sso-state-secret-0123456789abcdef";
    const env = loadEnv({ ...base, SSO_PROVIDER: "oidc", SSO_STATE_SECRET: secret });
    expect(env.SSO_PROVIDER).toBe("oidc");
    expect(env.SSO_STATE_SECRET).toBe(secret);
  });

  it("hata metni değer sızdırmaz", () => {
    try {
      loadEnv({ DATABASE_URL: "gizli-dsn-degeri" });
      expect.unreachable("geçersiz DSN kabul edildi");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(String(error)).not.toContain("gizli-dsn-degeri");
    }
  });
});

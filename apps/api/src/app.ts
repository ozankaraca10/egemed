import { Hono } from "hono";
import type { Context } from "hono";
import { statusForErrorCode, type ErrorCode } from "@egemed/contracts";
import { z } from "zod";
import { registerAdminAuditRoutes } from "./admin/audit";
import { registerAdminBulkRoutes } from "./admin/bulk";
import { registerAdminImportRoutes } from "./admin/imports";
import { registerAdminRoleRoutes } from "./admin/roles";
import { registerAdminUserRoutes, type AdminDeps } from "./admin/users";
import { registerAuthRoutes, type AuthDeps } from "./auth/routes";
import { registerSsoRoutes } from "./auth/sso/routes";
import { errorBody, validationDetails, type AppEnv } from "./http";
import {
  registerMeGamificationRoutes,
  type GamificationRepo,
} from "./me/gamification";

/**
 * T62 — Hono iskeleti (E3 §d). Uygulama; veritabanı havuzuna ve saate yalnız
 * enjekte edilen dar arayüzlerle bağlanır, `Date.now()` kullanmaz. Tüm hatalar
 * `{ error: { code, details? } }` zarfını taşır; kodlar `@egemed/contracts`
 * kataloğundandır ve 500 yanıtı ayrıntı sızdırmaz. T63 ile `/auth/*`, T65 ile
 * `/admin/users` uçları aynı bağlama (ve aynı `now` enjeksiyonuna) bağlanır.
 */

/** Havuzun uygulamaya görünen dar yüzeyi; `db.ts` çıktısı bunu yapısal olarak karşılar. */
export interface DbHealth {
  query(text: string, params: readonly unknown[]): Promise<unknown>;
}

/** `createApp` bağımlılıkları; testler sahte havuz ve sabit saat enjekte eder. */
export interface AppDeps {
  readonly db: DbHealth;
  readonly now: () => number;
  readonly auth: AuthDeps;
  /** T65 — `/admin/users` uçları; oturum bağımlılıklarını `auth` ile paylaşır. */
  readonly admin: AdminDeps;
  /** T67 — `/me/gamification` uçları; kimlik `auth` oturumundan çözülür. */
  readonly gamification: GamificationRepo;
}

/** Gelen `x-request-id` biçimi: başlık güvenli ASCII, 8–128 karakter. */
const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);

interface CryptoLike {
  randomUUID(): string;
}

/** Üretilen kimlik zaman önekli ve rastgeledir; zaman enjekte edilen saatten gelir. */
function newRequestId(now: () => number): string {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (crypto === undefined) {
    throw new Error("Web Crypto bulunamadı; request_id üretilemez.");
  }
  return `req-${now().toString(36)}-${crypto.randomUUID()}`;
}

/** Katalogdaki kodu taşıyan API hatası; yanıt gövdesi daima `errorBody` ile kurulur. */
class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, details?: unknown) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/** API yanıtlarının tamamına eklenen güvenlik başlıkları (E3 §d). */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function applySecurityHeaders(c: Context): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(name, value);
  }
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    applySecurityHeaders(c);
    try {
      await next();
    } finally {
      applySecurityHeaders(c);
    }
  });

  app.use("*", async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const parsed = incoming === undefined ? null : requestIdSchema.safeParse(incoming);
    // Geçersiz gelen kimlik yanıta yazılmaz; onun yerine yeni bir kimlik üretilir.
    const requestId = parsed !== null && parsed.success ? parsed.data : newRequestId(deps.now);
    c.header("x-request-id", requestId);
    c.set("requestId", requestId);
    try {
      if (parsed !== null && !parsed.success) {
        throw new ApiError("invalid_request", validationDetails(parsed.error));
      }
      await next();
    } finally {
      c.header("x-request-id", requestId);
    }
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/health/db", async (c) => {
    await deps.db.query("select 1", []);
    return c.json({ status: "ok" });
  });

  registerAuthRoutes(app, deps.auth, deps.now);
  // T64 — `/auth/sso/*`; adaptör `auth.sso` ile enjekte edilmezse rotalar
  // bağlanmaz ve istekler 404 alır.
  registerSsoRoutes(app, deps.auth, deps.now);
  registerAdminUserRoutes(app, deps.admin, deps.now);
  // T66 — toplu işlem, elle rol atama ve içe aktarma; `/admin/*` ara katmanı
  // (csrfGuard + requireAdmin) `registerAdminUserRoutes` içinde kaydedilir, bu
  // yüzden bu rotalar ondan SONRA bağlanır.
  registerAdminBulkRoutes(app, deps.admin, deps.now);
  registerAdminRoleRoutes(app, deps.admin, deps.now);
  registerAdminImportRoutes(app, deps.admin, deps.now);
  // T67 — denetim günlüğü salt okunur liste; `/admin/*` ara katmanı
  // `registerAdminUserRoutes` içinde kaydedildiği için bu rotalar ondan sonra
  // bağlanır. Okuma deposu `auth.audit` üzerindedir (aynı audit_log).
  registerAdminAuditRoutes(app, deps.auth);
  registerMeGamificationRoutes(app, { auth: deps.auth, gamification: deps.gamification }, deps.now);

  app.notFound((c) => c.json(errorBody("not_found"), statusForErrorCode("not_found")));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.details), statusForErrorCode(error.code));
    }
    return c.json(errorBody("internal_error"), statusForErrorCode("internal_error"));
  });

  return app;
}

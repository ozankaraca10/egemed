import type { Context, Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  ROLES,
  SIM_IDS,
  usernameSchema,
  type AuthMeResponse,
  type ErrorCode,
} from "@egemed/contracts";
import type { Env } from "../env";
import { jsonError, validationDetails, type AppEnv } from "../http";
import type { AuditRepo, MeContext, SessionRepo, UserRepo } from "./repo";
import { createLoginRateLimiter, loginRateKey } from "./rate-limit";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  createSessionService,
  csrfTokenForSession,
  safeTokenEquals,
} from "./session";
import type { SsoDeps } from "./sso/types";

/**
 * T63 — `/auth/*` uçları (E3 §a, §d): dev sağlayıcısı, `/auth/me`, `/auth/logout`.
 * Mutasyonlar double-submit CSRF (`X-CSRF-Token` + `egemed_csrf` çerezi) ve
 * Origin kontrolü ister; çerez oturumu güvenlik öznitelikleriyle kurulur.
 * T64 ile SSO uçları aynı bağımlılıklara ve aynı oturum çekirdeğine bağlanır.
 */

/** Uçların bağlandığı bağımlılıklar; üretimde `server.ts` doldurur. */
export interface AuthDeps {
  readonly sessions: SessionRepo;
  readonly users: UserRepo;
  readonly audit: AuditRepo;
  readonly nodeEnv: Env["NODE_ENV"];
  readonly devEnabled: boolean;
  readonly sessionIdleMs: number;
  readonly sessionAbsoluteMs: number;
  /** T64 — SSO adaptörü; enjekte edilmezse `/auth/sso/*` uçları 404'tür. */
  readonly sso?: SsoDeps | null | undefined;
}

/** E3 §a çerez kuralı: HttpOnly, SameSite=Lax, Path=/, Domain yok. */
export function sessionCookieOptions(secure: boolean) {
  return { path: "/", httpOnly: true, sameSite: "Lax", secure } as const;
}

/** CSRF çerezi istemci okuyabilsin diye HttpOnly değildir (double-submit). */
export function csrfCookieOptions(secure: boolean) {
  return { path: "/", httpOnly: false, sameSite: "Lax", secure } as const;
}

const MUTATION_METHODS: readonly string[] = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Origin başlığı `şema://yetkili` biçimindedir (yol taşımaz). Host başlığı
 * yoksa istek URL'inin yetkilisine düşülür; bu yalnız Node adaptörü dışı
 * testlerde görülür.
 */
function requestHost(c: Context<AppEnv>): string | null {
  const host = c.req.header("host");
  if (host !== undefined) return host;
  const match = /^https?:\/\/([^/?#]+)/.exec(c.req.url);
  return match?.[1] ?? null;
}

function originAllowed(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  if (origin === undefined) return true; // tarayıcı dışı istemci
  const host = requestHost(c);
  if (host === null) return false;
  const match = /^(https?):\/\/([^/?#]+)$/.exec(origin);
  return match !== null && (match[2] ?? "").toLowerCase() === host.toLowerCase();
}

/** Yalnız Origin kontrolü: oturum öncesi uçlar (dev giriş) için. */
const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!originAllowed(c)) return jsonError(c, "forbidden");
  return next();
};

/**
 * Mutasyon koruması: Origin kontrolü + double-submit. Oturum çerezi yoksa
 * korunacak bir durum da yoktur (çıkış yalnız kendi çerezini siler).
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!MUTATION_METHODS.includes(c.req.method)) return next();
  if (!originAllowed(c)) return jsonError(c, "forbidden");
  const sessionToken = getCookie(c, SESSION_COOKIE);
  if (sessionToken === undefined) return next();
  const header = c.req.header(CSRF_HEADER);
  const cookie = getCookie(c, CSRF_COOKIE);
  if (header === undefined || cookie === undefined) return jsonError(c, "forbidden");
  const expected = csrfTokenForSession(sessionToken);
  if (!safeTokenEquals(header, cookie) || !safeTokenEquals(header, expected)) {
    return jsonError(c, "forbidden");
  }
  return next();
};

const devLoginRequestSchema = z.strictObject({ username: usernameSchema });

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function meBody(context: MeContext): AuthMeResponse {
  return {
    data: {
      id: context.id,
      displayName: context.displayName,
      // Rol ve sim erişimi katalog sırasında, tekrarsız döner (E3 §d).
      roles: ROLES.filter((role) => context.roles.includes(role)).map((role) => ({ role })),
      institution: { id: context.institution.id, name: context.institution.name },
      simAccess: SIM_IDS.filter((simId) => context.simAccess.includes(simId)),
    },
  };
}

interface LoginDeniedInput {
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly institutionId: string | null;
}

/** Başarısız girişler audit'lenir (E3 §a kural 5); yalnız kodlu özet yazılır. */
async function recordLoginDenied(
  deps: AuthDeps,
  now: () => number,
  c: Context<AppEnv>,
  input: LoginDeniedInput,
): Promise<void> {
  await deps.audit.insert({
    occurredAt: now(),
    actorUserId: input.actorUserId,
    institutionId: input.institutionId,
    action: "auth.login_denied",
    targetType: "user",
    targetId: input.actorUserId,
    summaryAfter: { reason: input.reason, provider: "dev" },
    requestId: c.get("requestId"),
  });
}

function loginFailureCode(status: string): ErrorCode {
  return status === "suspended" ? "auth_denied_suspended" : "auth_denied_unknown_user";
}

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AuthDeps, now: () => number): void {
  const sessions = createSessionService({
    sessions: deps.sessions,
    now,
    idleMs: deps.sessionIdleMs,
    absoluteMs: deps.sessionAbsoluteMs,
  });
  const secureCookies = deps.nodeEnv === "production";
  const loginRate = createLoginRateLimiter();

  // Tüm `/auth/*` mutasyonları CSRF korumalıdır; dev girişi oturum öncesidir
  // (CSRF çerezi henüz yoktur) ve yalnız Origin kontrolü taşır.
  app.use("/auth/*", async (c, next) => {
    if (c.req.path === "/auth/dev/login") return next();
    return csrfGuard(c, next);
  });

  // Yalnız AUTH_DEV_ENABLED=true ve üretim dışı ortamda etkindir; aksi 404 (E3 §a).
  app.post("/auth/dev/login", originGuard, async (c) => {
    if (!deps.devEnabled || deps.nodeEnv === "production") return jsonError(c, "not_found");
    const parsed = devLoginRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const rateKey = loginRateKey("dev", parsed.data.username);
    if (!loginRate.consume(rateKey, now())) return jsonError(c, "rate_limited");

    const user = await deps.users.findByUsername(parsed.data.username);
    if (user === null) {
      await recordLoginDenied(deps, now, c, {
        reason: "unknown_user",
        actorUserId: null,
        institutionId: null,
      });
      return jsonError(c, "auth_denied_unknown_user");
    }
    if (user.authMethod !== "dev") {
      await recordLoginDenied(deps, now, c, {
        reason: "auth_method_mismatch",
        actorUserId: user.id,
        institutionId: user.institutionId,
      });
      return jsonError(c, "auth_denied_unknown_user");
    }
    if (user.status !== "active" && user.status !== "invited") {
      await recordLoginDenied(deps, now, c, {
        reason: user.status,
        actorUserId: user.id,
        institutionId: user.institutionId,
      });
      return jsonError(c, loginFailureCode(user.status));
    }

    // Sabitleme koruması: istemcinin getirdiği eski belirteç iptal edilir,
    // oturum her girişte yeni belirteçle kurulur (E3 §a).
    const context = await deps.users.getMeContext(user.id);
    if (context === null || context.roles.length === 0) {
      // `/auth/me` sözleşmesi en az bir rol ister; rolsüz kullanıcı yetkisizdir.
      await recordLoginDenied(deps, now, c, {
        reason: context === null ? "unknown_user" : "no_role",
        actorUserId: user.id,
        institutionId: user.institutionId,
      });
      return jsonError(c, "auth_denied_unknown_user");
    }

    await sessions.revoke(getCookie(c, SESSION_COOKIE));
    await deps.users.markLogin(user.id, now());
    const created = await sessions.create({ userId: user.id, authMethod: "dev" });
    setCookie(c, SESSION_COOKIE, created.token, sessionCookieOptions(secureCookies));
    setCookie(c, CSRF_COOKIE, csrfTokenForSession(created.token), csrfCookieOptions(secureCookies));

    return c.json(meBody(context));
  });

  app.get("/auth/me", async (c) => {
    const outcome = await sessions.verify(getCookie(c, SESSION_COOKIE));
    if (!outcome.ok) {
      return jsonError(c, outcome.reason === "expired" ? "session_expired" : "unauthorized");
    }
    const context = await deps.users.getMeContext(outcome.session.userId);
    if (context === null || context.status !== "active" || context.roles.length === 0) {
      // Askıya alınmış/silinmiş kullanıcının oturumu erişim vermez ve iptal edilir.
      await sessions.revoke(getCookie(c, SESSION_COOKIE));
      return jsonError(c, "unauthorized");
    }
    return c.json(meBody(context));
  });

  app.post("/auth/logout", async (c) => {
    await sessions.revoke(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secureCookies });
    deleteCookie(c, CSRF_COOKIE, { path: "/", secure: secureCookies });
    return c.body(null, 204);
  });
}

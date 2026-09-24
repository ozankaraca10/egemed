import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jsonError, type AppEnv } from "../../http";
import type { AuthDeps } from "../routes";
import { csrfCookieOptions, sessionCookieOptions } from "../routes";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  createSessionService,
  csrfTokenForSession,
  safeTokenEquals,
} from "../session";
import {
  SSO_STATE_COOKIE,
  completeSsoLogin,
  createSsoToken,
  recordSsoDenied,
  safeReturnTo,
  signSsoState,
  ssoStateCookieOptions,
  ssoStateMaxAgeSeconds,
  verifySsoState,
  type SsoLoginDeps,
} from "./flow";

/**
 * T64 — `/auth/sso/*` uçları (E3 §a): protokolden bağımsız akış. Adaptör
 * enjekte edilmemişse (SSO_PROVIDER yapılandırılmamışsa) rotalar hiç
 * bağlanmaz ve istekler 404 alır. state/nonce kısa ömürlü, imzalı ve
 * HttpOnly çerezdedir; oturum yalnız doğrulama ve eşleme başarılıysa kurulur.
 */

/** Callback parametreleri protokolden bağımsız olarak ham hâlde adaptöre geçer. */
function callbackParams(c: Context<AppEnv>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, values] of Object.entries(c.req.queries())) {
    const value = values[0];
    if (value !== undefined) params[key] = value;
  }
  return params;
}

export function registerSsoRoutes(app: Hono<AppEnv>, deps: AuthDeps, now: () => number): void {
  const sso = deps.sso ?? null;
  // Sağlayıcı yoksa uçlar 404'tür (E3 §a); notFound işleyicisi kodu üretir.
  if (sso === null) return;

  const sessions = createSessionService({
    sessions: deps.sessions,
    now,
    idleMs: deps.sessionIdleMs,
    absoluteMs: deps.sessionAbsoluteMs,
  });
  const secureCookies = deps.nodeEnv === "production";

  app.get("/auth/sso/start", (c) => {
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    const payload = {
      state: createSsoToken(),
      nonce: createSsoToken(),
      returnTo,
      expiresAt: now() + sso.stateTtlMs,
    };
    setCookie(
      c,
      SSO_STATE_COOKIE,
      signSsoState(payload, sso.stateSecret),
      ssoStateCookieOptions(secureCookies, ssoStateMaxAgeSeconds(sso.stateTtlMs)),
    );
    return c.redirect(sso.provider.buildAuthorizeUrl(payload.state, payload.nonce, returnTo), 302);
  });

  app.get("/auth/sso/callback", async (c) => {
    const payload = verifySsoState(getCookie(c, SSO_STATE_COOKIE), sso.stateSecret, now());
    const state = c.req.query("state");
    if (payload === null || state === undefined || !safeTokenEquals(state, payload.state)) {
      // state uyuşmazlığında IdP yanıtı işlenmez, oturum kurulmaz (E3 §a).
      return jsonError(c, "auth_state_invalid");
    }
    // Çerez tarayıcıda tek kullanım içindir: doğrulanan değer yanıtta silinir.
    // Asıl yeniden oynatma koruması IdP kod/assertion doğrulamasıdır (adaptör).
    deleteCookie(c, SSO_STATE_COOKIE, { path: "/", secure: secureCookies });

    const flowDeps: SsoLoginDeps = {
      users: deps.users,
      sessions,
      audit: deps.audit,
      now,
      requestId: c.get("requestId"),
    };

    const identity = await sso.provider.exchange(callbackParams(c));
    if (identity === null || identity.subject.trim() === "") {
      await recordSsoDenied(flowDeps, {
        reason: "invalid_assertion",
        actorUserId: null,
        institutionId: null,
      });
      return jsonError(c, "auth_state_invalid");
    }

    const previousToken = getCookie(c, SESSION_COOKIE);
    const outcome = await completeSsoLogin(flowDeps, identity);
    if (!outcome.ok) return jsonError(c, outcome.code);

    // Sabitleme koruması: istemcinin eski belirteci iptal edilir (E3 §a).
    await sessions.revoke(previousToken);
    setCookie(c, SESSION_COOKIE, outcome.token, sessionCookieOptions(secureCookies));
    setCookie(c, CSRF_COOKIE, csrfTokenForSession(outcome.token), csrfCookieOptions(secureCookies));
    return c.redirect(payload.returnTo, 302);
  });
}

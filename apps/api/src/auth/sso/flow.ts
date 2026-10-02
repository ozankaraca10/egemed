import { Buffer } from "node:buffer";
import { createHmac, randomBytes } from "node:crypto";
import type { ErrorCode } from "@egemed/contracts";
import type { AuditRepo, UserRepo } from "../repo";
import { safeTokenEquals, type SessionService } from "../session";
import type { SsoIdentity } from "./types";

/**
 * T64 — protokolden bağımsız SSO akışı (E3 §a): state/nonce çerezi, göreli
 * `returnTo` doğrulaması ve kullanıcı eşleme/kimlik bağlama kuralları. Protokol
 * ayrıntısı `SsoProvider` arkasındadır; bu dosya kütüphanesiz çalışır ve saati
 * yalnız enjekte edilen `now` ile okur (`Date.now()` yasak).
 */

export const SSO_STATE_COOKIE = "egemed_sso_state";
/** state/nonce çerezi kısa ömürlüdür; IdP dönüşü bu pencereye sığmalıdır. */
export const DEFAULT_SSO_STATE_TTL_MS = 5 * 60 * 1000;
const SSO_STATE_TOKEN_BYTES = 32; // 256 bit

const STATE_VERSION = "v1";
const STATE_DOMAIN_SEPARATOR = "egemed.sso.state.v1:";

interface SsoStatePayload {
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly expiresAt: number;
}

/** state ve nonce için en az 256 bit rastgele belirteç (base64url). */
export function createSsoToken(): string {
  return randomBytes(SSO_STATE_TOKEN_BYTES).toString("base64url");
}

/**
 * `returnTo` yalnız göreli yol olabilir (E3 §a kural 1): mutlak adres, şema,
 * protokol-göreli `//`, ters bölü ve denetim karakterleri reddedilir; geçersiz
 * değer açık yönlendirmeye dönüşmemesi için `/`a düşer.
 */
export function safeReturnTo(value: string | undefined): string {
  if (value === undefined || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.includes("\\")) return "/";
  // Boşluk ve denetim karakterleri başlık bölünmesine yol açabilir.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return "/";
  }
  return value;
}

function stateSignature(secret: string, signedBody: string): string {
  return createHmac("sha256", secret)
    .update(`${STATE_DOMAIN_SEPARATOR}${signedBody}`, "utf8")
    .digest("base64url");
}

/** `v1.<base64url(JSON)>.<HMAC-SHA256>`; gövde imzayla bütünleşiktir. */
export function signSsoState(payload: SsoStatePayload, secret: string): string {
  // Gövde base64url taşınır: çerez ayrıştırıcısı yüzde kodlamasını çözer,
  // base64url alfabesinde `%` ve `.` bulunmaz.
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedBody = `${STATE_VERSION}.${body}`;
  return `${signedBody}.${stateSignature(secret, signedBody)}`;
}

function isSsoStatePayload(value: unknown): value is SsoStatePayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.state === "string" &&
    typeof record.nonce === "string" &&
    typeof record.returnTo === "string" &&
    typeof record.expiresAt === "number"
  );
}

/**
 * İmzayı ve ömrü doğrular; geçersiz ya da eskimiş çerez `null` döner.
 */
export function verifySsoState(
  value: string | undefined,
  secret: string,
  now: number,
): SsoStatePayload | null {
  if (value === undefined || value === "") return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const version = parts[0];
  const body = parts[1];
  const signature = parts[2];
  if (version !== STATE_VERSION || body === undefined || signature === undefined) return null;
  if (!safeTokenEquals(signature, stateSignature(secret, `${version}.${body}`))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSsoStatePayload(parsed)) return null;
  if (now >= parsed.expiresAt) return null;
  // Savunma olarak imzalı değer de göreli yol süzgecinden geçirilir.
  return { ...parsed, returnTo: safeReturnTo(parsed.returnTo) };
}

/** state/nonce çerezi: HttpOnly, SameSite=Lax, Path=/, Domain yok; kısa ömürlü. */
export function ssoStateCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: maxAgeSeconds } as const;
}

export function ssoStateMaxAgeSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

export interface SsoLoginDeps {
  readonly users: UserRepo;
  readonly sessions: SessionService;
  readonly audit: AuditRepo;
  readonly now: () => number;
  readonly requestId: string | null;
}

type SsoLoginOutcome =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly code: ErrorCode };

interface SsoDenial {
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly institutionId: string | null;
}

/** Başarısız giriş denemeleri kodlu özetle audit'lenir (E3 §a kural 5). */
export async function recordSsoDenied(deps: SsoLoginDeps, denial: SsoDenial): Promise<void> {
  await deps.audit.insert({
    occurredAt: deps.now(),
    actorUserId: denial.actorUserId,
    institutionId: denial.institutionId,
    action: "auth.login_denied",
    targetType: "user",
    targetId: denial.actorUserId,
    summaryAfter: { reason: denial.reason, provider: "sso" },
    requestId: deps.requestId,
  });
}

function normalizeMappingKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * E3 §a kuralları 2-4: bilinmeyen/silinmiş kullanıcı ve giriş tipi uyuşmazlığı
 * reddedilir; askıdaki kullanıcı ayrı kodla reddedilir; ilk başarılı girişte
 * `sso_subject` bağlanır, sonraki farklı subject hesap devralma sayılıp
 * reddedilir. Oturum yalnız tüm kontroller geçince kurulur; her ret
 * audit'lenir.
 */
export async function completeSsoLogin(
  deps: SsoLoginDeps,
  identity: SsoIdentity,
): Promise<SsoLoginOutcome> {
  const deny = async (denial: SsoDenial, code: ErrorCode): Promise<SsoLoginOutcome> => {
    await recordSsoDenied(deps, denial);
    return { ok: false, code };
  };

  const username = normalizeMappingKey(identity.username);
  const email = normalizeMappingKey(identity.email);
  if (username === undefined && email === undefined) {
    return deny(
      { reason: "missing_mapping_key", actorUserId: null, institutionId: null },
      "auth_denied_unknown_user",
    );
  }

  const user = await deps.users.findByMappingKey({ username, email });
  if (user === null) {
    return deny(
      { reason: "unknown_user", actorUserId: null, institutionId: null },
      "auth_denied_unknown_user",
    );
  }
  if (user.authMethod !== "sso") {
    // dev kullanıcısı SSO ile oturum açamaz (E3 §a kural 4).
    return deny(
      { reason: "auth_method_mismatch", actorUserId: user.id, institutionId: user.institutionId },
      "auth_denied_unknown_user",
    );
  }
  if (user.status === "suspended") {
    return deny(
      { reason: "suspended", actorUserId: user.id, institutionId: user.institutionId },
      "auth_denied_suspended",
    );
  }
  if (user.status !== "active" && user.status !== "invited") {
    // Silinmiş kullanıcı eşlemeye hiç girmez; savunma olarak bilinmeyen sayılır.
    return deny(
      { reason: user.status, actorUserId: user.id, institutionId: user.institutionId },
      "auth_denied_unknown_user",
    );
  }

  const context = await deps.users.getMeContext(user.id);
  if (context === null || context.roles.length === 0) {
    // `/auth/me` sözleşmesi en az bir rol ister; rolsüz kullanıcı yetkisizdir.
    return deny(
      {
        reason: context === null ? "unknown_user" : "no_role",
        actorUserId: user.id,
        institutionId: user.institutionId,
      },
      "auth_denied_unknown_user",
    );
  }

  // Bağlama yarış güvenlidir: mevcut subject korunur, farklısı reddedilir.
  const bound = await deps.users.bindSsoSubject(user.id, identity.subject, deps.now());
  if (bound !== identity.subject) {
    return deny(
      { reason: "subject_mismatch", actorUserId: user.id, institutionId: user.institutionId },
      "auth_subject_mismatch",
    );
  }

  await deps.users.markLogin(user.id, deps.now());
  const created = await deps.sessions.create({ userId: user.id, authMethod: "sso" });
  return { ok: true, token: created.token };
}

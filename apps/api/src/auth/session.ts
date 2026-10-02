import { createHash, randomBytes } from "node:crypto";
import type { AuthMethod } from "@egemed/contracts";
import type { SessionRecord, SessionRepo } from "./repo";

/**
 * T63 — oturum çekirdeği (E3 §a). Ham belirteç yalnız çerezde taşınır; depoda
 * belirtecin SHA-256 özetinden türetilen kimlik bulunur. Belirteç en az 256
 * bit rastgeledir ve her girişte yeniden üretilir (sabitlenme koruması). Saat
 * `now` ile enjekte edilir; `Date.now()` kullanılmaz. Süreler env'den gelir:
 * boşta kalma 30 dk, mutlak üst sınır 12 sa (varsayılan).
 */

export const SESSION_COOKIE = "egemed_session";
export const CSRF_COOKIE = "egemed_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SESSION_TOKEN_BYTES = 32; // 256 bit
export const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000;
export const DEFAULT_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

const CSRF_DOMAIN_SEPARATOR = "egemed.csrf.v1:";

/** En az 256 bit rastgele belirteç (base64url). */
function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Oturum kimliği = SHA-256 özetinin ilk 128 biti, RFC 9562 sürüm 8 UUID
 * biçiminde (`sessions.id uuid` kolonu). Özet ters çevrilemez; ham belirteç
 * hiçbir satırda saklanmaz.
 */
export function sessionIdForToken(token: string): string {
  const digest = sha256Hex(token).slice(0, 32);
  const variant = "89ab"[Number.parseInt(digest.charAt(16), 16) & 0x3] ?? "8";
  const shaped = `${digest.slice(0, 12)}8${digest.slice(13, 16)}${variant}${digest.slice(17)}`;
  return `${shaped.slice(0, 8)}-${shaped.slice(8, 12)}-${shaped.slice(12, 16)}-${shaped.slice(16, 20)}-${shaped.slice(20, 32)}`;
}

/** CSRF belirteci oturum belirtecinden türetilir; ayrı saklama gerekmez. */
export function csrfTokenForSession(token: string): string {
  return createHash("sha256").update(`${CSRF_DOMAIN_SEPARATOR}${token}`, "utf8").digest("base64url");
}

/** Sabit zamanlı dizge karşılaştırması (CSRF double-submit). */
export function safeTokenEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

type SessionFailure = "missing" | "unknown" | "revoked" | "expired";

export type SessionVerifyResult =
  | { readonly ok: true; readonly session: SessionRecord }
  | { readonly ok: false; readonly reason: SessionFailure };

interface SessionServiceOptions {
  readonly sessions: SessionRepo;
  readonly now: () => number;
  readonly idleMs: number;
  readonly absoluteMs: number;
}

export interface CreatedSession {
  readonly token: string;
  readonly record: SessionRecord;
}

export interface SessionService {
  create(input: { readonly userId: string; readonly authMethod: AuthMethod }): Promise<CreatedSession>;
  verify(token: string | undefined): Promise<SessionVerifyResult>;
  revoke(token: string | undefined): Promise<void>;
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { sessions, now, idleMs, absoluteMs } = options;

  return {
    async create({ userId, authMethod }) {
      const token = createSessionToken();
      const createdAt = now();
      const record: SessionRecord = {
        id: sessionIdForToken(token),
        userId,
        authMethod,
        createdAt,
        lastSeenAt: createdAt,
        expiresAt: createdAt + absoluteMs,
        revokedAt: null,
      };
      await sessions.insert(record);
      return { token, record };
    },

    async verify(token) {
      if (token === undefined || token === "") return { ok: false, reason: "missing" };
      const id = sessionIdForToken(token);
      const record = await sessions.findById(id);
      if (record === null) return { ok: false, reason: "unknown" };
      if (record.revokedAt !== null) return { ok: false, reason: "revoked" };
      const at = now();
      // Mutlak sınır ve boşta kalma süresi birlikte uygulanır; süresi dolan
      // oturum savunma olarak iptal edilir (E3 §a).
      if (at >= record.expiresAt || at - record.lastSeenAt >= idleMs) {
        await sessions.revoke(id, at);
        return { ok: false, reason: "expired" };
      }
      await sessions.touch(id, at);
      return { ok: true, session: { ...record, lastSeenAt: at } };
    },

    async revoke(token) {
      if (token === undefined || token === "") return;
      await sessions.revoke(sessionIdForToken(token), now());
    },
  };
}

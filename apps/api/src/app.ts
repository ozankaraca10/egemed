import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import type { Context } from "hono";
import { statusForErrorCode, type ErrorCode } from "@egemed/contracts";
import { z } from "zod";
import { registerAdminAuditRoutes } from "./admin/audit";
import { registerAdminBulkRoutes } from "./admin/bulk";
import { registerAdminExtrasRoutes, type AdminOverviewRepo } from "./admin/extras";
import { registerAdminImportRoutes } from "./admin/imports";
import { registerAdminRoleRoutes } from "./admin/roles";
import { registerAdminUserRoutes, type AdminDeps } from "./admin/users";
import { createMemorySimSessionRepo, registerSimSessionRoutes, type SimSessionDeps } from "./me/simSessions";
import { challengeFinishedHook, createMemoryChallengeRepo, registerChallengeRoutes, type ChallengeRepo } from "./me/challenges";
import { createMemoryLearnRepo, registerLearnRoutes, type LearnRepo } from "./me/learn";
import { createMemoryRewardsRepo, registerAdminRewardRoutes, registerMeRewardRoutes, type RewardsRepo } from "./rewards";
import { registerAuthRoutes, type AuthDeps } from "./auth/routes";
import { registerSsoRoutes } from "./auth/sso/routes";
import { errorBody, jsonError, validationDetails, type AppEnv } from "./http";
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
  /** T58 — `/admin/overview` sayımları; kurum kapsamlı, bireysel veri yok. */
  readonly overview: AdminOverviewRepo;
  /** Aylık ödüller (26 Eyl 2026); verilmezse bellek deposu (yalnız test/DB'siz geliştirme). */
  readonly rewards?: RewardsRepo;
  /** A1 sunucu vaka oturumu (ADR-009); verilmezse bellek deposu ve ses yok (yalnız test/DB'siz geliştirme). */
  readonly simSessions?: Omit<SimSessionDeps, "gamification" | "onFinished">;
  /** ADR-010 Meydan Okuma deposu; verilmezse bellek deposu. */
  readonly challenges?: ChallengeRepo;
  /** Öğrenme tamamlama kaydı (27 Eyl 2026); verilmezse bellek deposu. */
  readonly learn?: LearnRepo;
}

/** WebCrypto (Node 20+ genel `crypto`); kök tsconfig DOM'suz olduğu için yapısal tip. */
interface WebCryptoLike {
  getRandomValues<T extends Uint32Array | Uint8Array>(array: T): T;
  randomUUID(): string;
}
function webCrypto(): WebCryptoLike {
  const value = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (value === undefined) throw new Error("webcrypto_unavailable");
  return value;
}
/** Kriptografik [0,1). */
export function cryptoRandom(): number {
  return (webCrypto().getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
}
/** 16 bayt kriptografik rastgele, base64url opak jeton. */
export function cryptoToken(): string {
  const bytes = webCrypto().getRandomValues(new Uint8Array(16));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  // 16 bayt → 22 karakter base64url (her bayttan 6 bit alınır; 128 bit entropi korunur ~).
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    text += (alphabet[(chunk >> 18) & 63] ?? "") + (alphabet[(chunk >> 12) & 63] ?? "") + (alphabet[(chunk >> 6) & 63] ?? "") + (alphabet[chunk & 63] ?? "");
  }
  return text.slice(0, 22);
}
export function cryptoUuid(): string {
  return webCrypto().randomUUID();
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

/** T149: JSON uçları için gövde sınırı; içe aktarma ucu 2 MB CSV + pay. */
export const BODY_LIMIT_BYTES = 1024 * 1024;
export const IMPORT_BODY_LIMIT_BYTES = 3 * 1024 * 1024;

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

  // T149: istek gövdesi sınırı (bellek tüketimine karşı). CSV içe aktarma 2 MB dosya kabul
  // eder (E3 §f); yalnız o uç için pay bırakılır. Aşımda 413 `payload_too_large`.
  const jsonBodyLimit = bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: (c) => jsonError(c, "payload_too_large") });
  const importBodyLimit = bodyLimit({ maxSize: IMPORT_BODY_LIMIT_BYTES, onError: (c) => jsonError(c, "payload_too_large") });
  app.use("*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    return c.req.method === "POST" && c.req.path === "/admin/imports" ? importBodyLimit(c, next) : jsonBodyLimit(c, next);
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
  // T58 — kullanıcı oyunlaştırma özeti, kurum sayımları ve sağlık uçları;
  // `/admin/*` ara katmanı yukarıda bağlandığı için ondan sonra kaydedilir.
  registerAdminExtrasRoutes(
    app,
    {
      admin: deps.admin,
      gamification: deps.gamification,
      overview: deps.overview,
      db: deps.db,
    },
    deps.now,
  );
  const rewards = deps.rewards ?? createMemoryRewardsRepo();
  registerAdminRewardRoutes(app, { admin: deps.admin, gamification: deps.gamification, rewards }, deps.now);
  registerMeGamificationRoutes(app, { auth: deps.auth, gamification: deps.gamification }, deps.now);
  // `/me/*` ara katmanı `registerMeGamificationRoutes` içinde bağlanır; ödül okumaları ondan sonra.
  registerMeRewardRoutes(app, { rewards }, deps.now);
  // Öğrenme tamamlama kaydı (27 Eyl 2026): `/me/*` ara katmanına bağlı iki uç;
  // meydan okuma kilidi (ADR-010) aynı depoyu okur.
  const learn = deps.learn ?? createMemoryLearnRepo();
  registerLearnRoutes(app, { learn }, deps.now);
  const simSessionDeps = deps.simSessions ?? {
    sessions: createMemorySimSessionRepo(),
    readAudio: () => Promise.resolve(null),
    readImage: () => Promise.resolve(null),
    newToken: cryptoToken,
    random: cryptoRandom,
    newId: () => cryptoUuid(),
  };
  const challenges = deps.challenges ?? createMemoryChallengeRepo();
  registerSimSessionRoutes(
    app,
    {
      gamification: deps.gamification,
      ...simSessionDeps,
      onFinished: challengeFinishedHook({ challenges, sessions: simSessionDeps.sessions, gamification: deps.gamification }),
    },
    deps.now,
  );
  registerChallengeRoutes(
    app,
    { auth: deps.auth, challenges, learn, sessions: simSessionDeps.sessions, random: simSessionDeps.random, newId: simSessionDeps.newId },
    deps.now,
  );

  app.notFound((c) => c.json(errorBody("not_found"), statusForErrorCode("not_found")));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.details), statusForErrorCode(error.code));
    }
    return c.json(errorBody("internal_error"), statusForErrorCode("internal_error"));
  });

  return app;
}

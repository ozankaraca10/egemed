import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createApp } from "./app.ts";
import { createPgRewardsRepo } from "./rewards.ts";
import { cryptoRandom, cryptoToken, cryptoUuid } from "./app.ts";
import { createPgSimSessionRepo } from "./me/simSessions.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPgAdminBulkRepo } from "./admin/bulk.ts";
import { createPgAdminOverviewRepo } from "./admin/extras.ts";
import { createPgAdminImportRepo } from "./admin/imports.ts";
import { createPgAdminRoleRepo } from "./admin/roles.ts";
import { createPgAdminUsersRepo } from "./admin/users.ts";
import { createPgAuthRepos } from "./auth/repo.ts";
import { createDb } from "./db.ts";
import { loadEnv } from "./env.ts";
import { createPgGamificationRepo } from "./me/gamification.ts";

/**
 * T62 — giriş noktası (`pnpm --filter @egemed/api dev|start`). Node 22'nin
 * yerleşik TypeScript desteği göreli içe aktarmalarda açık `.ts` uzantısı
 * ister; uzantılar bu yüzden burada yazılır ve `allowImportingTsExtensions`
 * yalnız apps/api tsconfig'inde açılır (testler bu dosyayı içe aktarmaz).
 */

/** Kabuktaki `now.ts` gibi: duvar saati performans saatinden türetilir (Date.now yasak). */
interface PerformanceClock {
  readonly timeOrigin: number;
  now(): number;
}

function serverNow(): number {
  const perf = (globalThis as { performance?: PerformanceClock }).performance;
  // Tam milisaniye: kesirli değer ISO/zaman damgası biçimlerini bozar (T124 bulgusu).
  return perf === undefined ? 0 : Math.floor(perf.timeOrigin + perf.now());
}

const env = loadEnv(process.env);
const db = createDb(env.DATABASE_URL);
const auth = {
  ...createPgAuthRepos(db),
  nodeEnv: env.NODE_ENV,
  devEnabled: env.AUTH_DEV_ENABLED,
  loginRateMax: env.AUTH_LOGIN_RATE_MAX,
  attemptRateMax: env.ATTEMPT_RATE_MAX,
  sessionIdleMs: env.SESSION_IDLE_MINUTES * 60_000,
  sessionAbsoluteMs: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
  // T64 — SSO adaptörü protokol kararına bağlıdır (§i). Protokol seçilene dek
  // adaptör enjekte edilmez ve `/auth/sso/*` uçları 404 döner; SSO_PROVIDER ve
  // SSO_STATE_SECRET yalnız `loadEnv` ile doğrulanır.
  sso: null,
};
const app = createApp({
  db,
  now: serverNow,
  auth,
  gamification: createPgGamificationRepo(db),
  overview: createPgAdminOverviewRepo(db),
  rewards: createPgRewardsRepo(db),
  simSessions: {
    sessions: createPgSimSessionRepo(db),
    // Yol bankadaki güvenilir veriden gelir; yine de kök dışına çıkış reddedilir.
    readAudio: async (runtimeUrl: string) => {
      const root = path.resolve(env.AUSCULTA_AUDIO_DIR);
      const target = path.resolve(root, runtimeUrl);
      if (!target.startsWith(`${root}/`)) return null;
      try {
        return await readFile(target);
      } catch {
        return null;
      }
    },
    newToken: cryptoToken,
    random: cryptoRandom,
    newId: cryptoUuid,
  },
  admin: {
    auth,
    users: createPgAdminUsersRepo(db),
    bulk: createPgAdminBulkRepo(db),
    roles: createPgAdminRoleRepo(db),
    imports: createPgAdminImportRepo(db),
    newId: () => randomUUID(),
  },
});

serve({ fetch: app.fetch, port: env.PORT });
process.stdout.write(`egemed-api listening port=${env.PORT} env=${env.NODE_ENV}\n`);

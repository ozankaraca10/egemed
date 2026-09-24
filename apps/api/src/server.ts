import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createApp } from "./app.ts";
import { createPgAdminBulkRepo } from "./admin/bulk.ts";
import { createPgAdminImportRepo } from "./admin/imports.ts";
import { createPgAdminRoleRepo } from "./admin/roles.ts";
import { createPgAdminUsersRepo } from "./admin/users.ts";
import { createPgAuthRepos } from "./auth/repo.ts";
import { createDb } from "./db.ts";
import { loadEnv } from "./env.ts";

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
  return perf === undefined ? 0 : perf.timeOrigin + perf.now();
}

const env = loadEnv(process.env);
const db = createDb(env.DATABASE_URL);
const auth = {
  ...createPgAuthRepos(db),
  nodeEnv: env.NODE_ENV,
  devEnabled: env.AUTH_DEV_ENABLED,
  sessionIdleMs: env.SESSION_IDLE_MINUTES * 60_000,
  sessionAbsoluteMs: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
};
const app = createApp({
  db,
  now: serverNow,
  auth,
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

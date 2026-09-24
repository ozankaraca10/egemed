import { serve } from "@hono/node-server";
import process from "node:process";
import { createApp } from "./app.ts";
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
const app = createApp({ db: createDb(env.DATABASE_URL), now: serverNow });

serve({ fetch: app.fetch, port: env.PORT });
process.stdout.write(`egemed-api listening port=${env.PORT} env=${env.NODE_ENV}\n`);

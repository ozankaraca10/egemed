import { randomUUID } from "node:crypto";
import process from "node:process";
import { createPgAuthRepos } from "../auth/repo.ts";
import { createDb } from "../db.ts";
import { loadEnv } from "../env.ts";
import { createPgSeedRepo } from "./repo.ts";
import {
  DEFAULT_DEV_INSTITUTION,
  SeedError,
  loadSeedEnv,
  parseSeedArgs,
  seedBootstrapAdmin,
  seedDevUsers,
  type SeedDeps,
} from "./seed.ts";

/**
 * T68 — `pnpm --filter @egemed/api seed:admin|seed:dev` girişi. Argümanlar
 * `--username`, `--display-name` ve `--allow-production`; diğer ayarlar ortamdan
 * (`SEED_INSTITUTION_CODE/NAME`, `SEED_ADMIN_*`, `SEED_ALLOW_PRODUCTION`) gelir.
 * Bağlantı yalnız burada kurulur; çekirdek `seed.ts` DB'siz sınanır. Çıktı sır
 * taşımaz; hata durumunda `process.exitCode` 1 olur.
 */

interface PerformanceClock {
  readonly timeOrigin: number;
  now(): number;
}

/** `server.ts` ile aynı: duvar saati performans saatinden türetilir (Date.now yasak). */
function cliNow(): number {
  const perf = (globalThis as { performance?: PerformanceClock }).performance;
  return perf === undefined ? 0 : perf.timeOrigin + perf.now();
}

async function run(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  const env = loadEnv(process.env);
  const seedEnv = loadSeedEnv(process.env);
  const db = createDb(env.DATABASE_URL);
  const deps: SeedDeps = {
    repo: createPgSeedRepo(db),
    audit: createPgAuthRepos(db).audit,
    newId: () => randomUUID(),
    now: cliNow,
  };

  try {
    if (args.mode === "admin") {
      const username = args.username ?? seedEnv.adminUsername;
      const displayName = args.displayName ?? seedEnv.adminDisplayName;
      if (username === undefined || displayName === undefined || seedEnv.institution === null) {
        throw new SeedError(
          "invalid_arguments",
          "seed:admin için --username, --display-name ve SEED_INSTITUTION_CODE/SEED_INSTITUTION_NAME zorunludur.",
        );
      }
      const result = await seedBootstrapAdmin(deps, {
        nodeEnv: env.NODE_ENV,
        allowProduction: args.allowProduction || seedEnv.allowProduction,
        institution: seedEnv.institution,
        username,
        displayName,
      });
      process.stdout.write(
        `seed:admin ${result.outcome} user=${result.userId} institution=${result.institutionId}\n`,
      );
      return;
    }

    const result = await seedDevUsers(deps, {
      nodeEnv: env.NODE_ENV,
      devEnabled: env.AUTH_DEV_ENABLED,
      institution: seedEnv.institution ?? DEFAULT_DEV_INSTITUTION,
    });
    const summary = result.users.map((user) => `${user.username}:${user.outcome}`).join(" ");
    process.stdout.write(`seed:dev institution=${result.institutionId} ${summary}\n`);
  } finally {
    await db.close();
  }
}

run().catch((error: unknown) => {
  const message =
    error instanceof SeedError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`seed başarısız: ${message}\n`);
  process.exitCode = 1;
});

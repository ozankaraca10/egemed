import process from "node:process";
import { REWARD_SEED } from "@egemed/gami-catalogs";
import { createDb } from "../db.ts";
import { loadEnv } from "../env.ts";
import { DEFAULT_DEV_INSTITUTION, loadSeedEnv } from "./seed.ts";

/**
 * `pnpm --filter @egemed/api seed:rewards` — kurumun aylık ödüllerini sıfırlar ve
 * `REWARD_SEED` örneklerini girer (30 Eylül 2026, depo sahibi kararı). Kazananlar
 * zincirleme silinir. Üretimde çalışmaz; ödüller sonra ödül yönetiminden düzenlenir.
 */
async function run(): Promise<void> {
  const env = loadEnv(process.env);
  if (env.NODE_ENV === "production") throw new Error("seed:rewards üretimde çalıştırılamaz.");
  const institution = loadSeedEnv(process.env).institution ?? DEFAULT_DEV_INSTITUTION;
  const db = createDb(env.DATABASE_URL);
  try {
    const found = await db.query("select id from institutions where code = $1 and deleted_at is null limit 1", [institution.code]);
    const institutionId = (found.rows[0] as { id?: string } | undefined)?.id;
    if (institutionId === undefined) throw new Error(`kurum bulunamadı: ${institution.code} (önce seed:dev çalıştırın)`);
    const inserted = await db.transaction(async (query) => {
      await query("delete from monthly_rewards where institution_id = $1", [institutionId]);
      for (const { simId, reward } of REWARD_SEED) {
        await query(
          "insert into monthly_rewards (institution_id, sim_id, month, title, description, sponsor, winners_count, cohorts, min_assessments, require_public_name, terms) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
          [institutionId, simId, reward.month, reward.title, reward.description, reward.sponsor, reward.winnersCount, reward.eligibility.cohorts, reward.eligibility.minAssessments, reward.eligibility.requirePublicName, reward.terms],
        );
      }
      return REWARD_SEED.length;
    });
    process.stdout.write(`seed:rewards institution=${institution.code} ödül=${inserted}\n`);
  } finally {
    await db.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`seed:rewards başarısız: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

import process from "node:process";
import { createDb } from "../db.ts";
import { loadEnv } from "../env.ts";
import { DEMO_NOW, seedDemoDatabase, type DemoSeedSummary } from "./demo.ts";
import { DEFAULT_DEV_INSTITUTION, loadSeedEnv } from "./seed.ts";

/**
 * T258 — `pnpm --filter @egemed/api seed:demo` girişi. Çekirdek `demo.ts`
 * DB'siz sınanır; bağlantı ve çıktı yalnız burada. Üretim kapısı
 * `seedDemoDatabase` içindedir; çıktı sır taşımaz.
 */

function summaryLine(summary: DemoSeedSummary): string {
  return [
    `seed:demo kurum=${summary.institutionCode}`,
    `öğrenci=${summary.students}`,
    `araştırma-görevlisi=${summary.residents}`,
    `öğretim-üyesi=${summary.faculty}`,
    `birim=${summary.units}`,
    `profil=${summary.profiles}`,
    `deneme=${summary.attempts}`,
    `rozet=${summary.badges}`,
    `öğrenme=${summary.learn}`,
    `tamamlama=${summary.completions}`,
    `düello=${summary.challenges}`,
    `oturum=${summary.sessions}`,
    `içe-aktarma=${summary.imports}`,
    `içe-aktarma-satırı=${summary.importRows}`,
    `denetim=${summary.audits}`,
  ].join(" ");
}

async function run(): Promise<void> {
  const env = loadEnv(process.env);
  const institution = loadSeedEnv(process.env).institution ?? DEFAULT_DEV_INSTITUTION;
  const db = createDb(env.DATABASE_URL);
  try {
    const summary = await seedDemoDatabase(db, {
      nodeEnv: env.NODE_ENV,
      institutionCode: institution.code,
      now: DEMO_NOW,
    });
    process.stdout.write(`${summaryLine(summary)}\n`);
  } finally {
    await db.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`seed:demo başarısız: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

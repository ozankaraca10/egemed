import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ARTIFACT_ENV_KEY = "EGEMED_E2E_ARTIFACT_RUN_ID";

function resolveRunId(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown-sha";
  }
}

/**
 * Geliştirme sunucusu simleri tembel ve paketlenmemiş yükler (Opaca ≈ 87 modül,
 * ~12 MB). Taze sunucuda ilk açılış paralel işçiler altında 5 sn bekleme sınırını
 * aşıp "sim kökü bulunamadı" hatası veriyordu (audit D1, 30 Eyl). Testlerden önce
 * her sim bir kez açılıp kökü beklenir; dönüşüm önbelleği ısınır.
 */
const SIM_IDS = ["pulse", "ausculta", "opaca"] as const;
/** Kabuk taşıyıcısına modül mount edilince ilk alt öğe oluşur (üç sim için ortak işaret). */
const MOUNTED = ".eg-shell-sim-page__host > *";

async function warmSims(baseUrl: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const simId of SIM_IDS) {
      await page.goto(`${baseUrl}/#/sims/${simId}`);
      await page.locator(MOUNTED).first().waitFor({ timeout: 90_000 });
    }
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(): Promise<void> {
  process.env[ARTIFACT_ENV_KEY] = resolveRunId();
  const devPort = Number(process.env["E2E_PORT_BASE"] ?? "5197") + 2;
  await warmSims(`http://127.0.0.1:${devPort}`);
}

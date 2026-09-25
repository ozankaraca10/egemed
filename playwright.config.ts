import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

/**
 * Geliştirme sunucusu (T09): sahte giriş akışları için dev modu.
 * API'li geliştirme (T57) ayrı bir kabuk sunucusudur ve yalnız API ayaktayken
 * eklenir; mevcut projeler bu yüzden değişmez.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/**
 * Portlar ortamla değiştirilebilir (E2E_PORT_BASE): paralel worktree/ajan koşuları
 * aynı sunucuyu yeniden kullanıp yanlış kodu test etmesin. Varsayılan 5197–5199.
 */
const PORT_BASE = Number(env["E2E_PORT_BASE"] ?? "5197");
const API_SHELL_PORT = PORT_BASE;
const PROD_PORT = PORT_BASE + 1;
const DEV_PORT = PORT_BASE + 2;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
/** Üretim önizlemesi: `vite preview`; yalnız üretim güvenlik kontrolleri için. */
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;
/** T57 — API oturumlu kabuk; Vite proxy'siyle API ile aynı kökenden konuşur. */
const API_SHELL_URL = `http://127.0.0.1:${API_SHELL_PORT}`;

const isCI = env["CI"] === "true";

/** T57 — yoklanan API kökü; `EGEMED_E2E_API_URL` ile değiştirilebilir. */
const API_URL = (env["EGEMED_E2E_API_URL"] ?? "http://127.0.0.1:3100").replace(/\/+$/, "");

/**
 * T57 — API çalışıyor mu: `/health` ucu 2 sn zaman aşımlı `curl` ile yoklanır.
 * Yapılandırma senkron çözüldüğü için (Playwright asenkron yapılandırma
 * desteklemez) `fetch` kullanılamaz. API ayakta değilse API projesi hiç
 * tanımlanmaz; spec `test.skip` ile değil, proje kapsamıyla dışarıda kalır.
 */
function isApiRunning(): boolean {
  try {
    const status = execSync(
      `curl -sS -o /dev/null -w '%{http_code}' --max-time 2 ${API_URL}/health`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return status === "200";
  } catch {
    return false;
  }
}

const apiRunning = isApiRunning();
const requireApi = env["E2E_REQUIRE_API"] === "1";
if (requireApi && !apiRunning) {
  throw new Error(
    `E2E_REQUIRE_API=1 verildi ama API ayakta değil (${API_URL}/health yanıt vermedi). ` +
      "API'yi başlatın (örn. pnpm --filter @egemed/api dev) ve E2E_REQUIRE_API=1 olmadan " +
      "koşmanın api-dev testlerini sessizce atladığını unutmayın.",
  );
}
if (!apiRunning) {
  console.warn(
    "api-dev projesi atlandı: API ayakta değil. Zorunlu koşum için E2E_REQUIRE_API=1 kullanın (pnpm e2e:api).",
  );
}
const API_SPEC = /auth-api\.spec\.ts/;
const PROD_SPEC = /auth-prod\.spec\.ts/;

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["./e2e/artifact-reporter.ts"],
  ],
  use: {
    baseURL: DEV_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      testIgnore: [PROD_SPEC, API_SPEC],
      use: { viewport: { width: 360, height: 780 } },
    },
    {
      name: "tablet-768",
      testIgnore: [PROD_SPEC, API_SPEC],
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop-1440",
      testIgnore: [PROD_SPEC, API_SPEC],
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "prod",
      testMatch: PROD_SPEC,
      use: { baseURL: PROD_URL, viewport: { width: 1440, height: 900 } },
    },
    // Yalnız API ayaktayken: API oturumlu kabuk sunucusu API'ye Vite proxy'siyle
    // bağlanır; `VITE_API_BASE_URL` kabuğu T57 API oturumuna geçirir.
    ...(apiRunning
      ? [
          {
            name: "api-dev",
            testMatch: API_SPEC,
            use: { baseURL: API_SHELL_URL, viewport: { width: 1440, height: 900 } },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `pnpm --filter @egemed/shell dev --port ${DEV_PORT} --strictPort --host 127.0.0.1`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      url: DEV_URL,
    },
    {
      command:
        `pnpm --filter @egemed/shell build && pnpm --filter @egemed/shell exec vite preview --port ${PROD_PORT} --strictPort --host 127.0.0.1`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      url: PROD_URL,
    },
    ...(apiRunning
      ? [
          {
            command: `pnpm --filter @egemed/shell dev --port ${API_SHELL_PORT} --strictPort --host 127.0.0.1`,
            env: { VITE_API_BASE_URL: "/api", VITE_API_PROXY_TARGET: API_URL },
            reuseExistingServer: !isCI,
            timeout: 120_000,
            url: API_SHELL_URL,
          },
        ]
      : []),
  ],
});

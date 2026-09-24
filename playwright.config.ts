import { defineConfig } from "@playwright/test";

/** Geliştirme sunucusu (T09): sahte giriş akışları için dev modu. */
const DEV_URL = "http://127.0.0.1:5199";
/** Üretim önizlemesi: `vite preview`; yalnız üretim güvenlik kontrolleri için. */
const PROD_URL = "http://127.0.0.1:5198";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const isCI = env["CI"] === "true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: DEV_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      testIgnore: /auth-prod\.spec\.ts/,
      use: { viewport: { width: 360, height: 780 } },
    },
    {
      name: "tablet-768",
      testIgnore: /auth-prod\.spec\.ts/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop-1440",
      testIgnore: /auth-prod\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "prod",
      testMatch: /auth-prod\.spec\.ts/,
      use: { baseURL: PROD_URL, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @egemed/shell dev --port 5199 --strictPort --host 127.0.0.1",
      reuseExistingServer: !isCI,
      timeout: 120_000,
      url: DEV_URL,
    },
    {
      command:
        "pnpm --filter @egemed/shell build && pnpm --filter @egemed/shell exec vite preview --port 5198 --strictPort --host 127.0.0.1",
      reuseExistingServer: !isCI,
      timeout: 180_000,
      url: PROD_URL,
    },
  ],
});

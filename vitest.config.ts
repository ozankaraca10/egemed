import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    include: ["tests/**/*.test.ts"],
    // Birim kapısı paralel worktree/e2e koşularıyla aynı makinede çalışır; ağır
    // tohumlu/diferansiyel testler yük altında 5 sn varsayılanını aşabiliyor.
    testTimeout: 30_000,
    // Kapsam yalnız `pnpm test:coverage` ile ölçülür (test azaltma kararlarında kapsam kaybını izlemek için).
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx,js}", "apps/*/src/**/*.{ts,tsx,js}"],
      exclude: ["**/*.d.ts", "**/dist/**"],
      reporter: ["text-summary", "json-summary", "json"],
      reportsDirectory: "coverage",
    },
  },
});

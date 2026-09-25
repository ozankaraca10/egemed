import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    include: ["tests/**/*.test.ts"],
    // Birim kapısı paralel worktree/e2e koşularıyla aynı makinede çalışır; ağır
    // tohumlu/diferansiyel testler yük altında 5 sn varsayılanını aşabiliyor.
    testTimeout: 30_000,
  },
});

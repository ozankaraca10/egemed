import { defineConfig } from "vitest/config";

// Yalnız `pnpm --filter @egemed/api test:db` içindir. Kök `pnpm test` bu
// yapılandırmayı görmez; DB turu CI kapısına eklenmez (E3 §h).
export default defineConfig({
  test: {
    include: ["test/db/**/*.test.ts"],
  },
});

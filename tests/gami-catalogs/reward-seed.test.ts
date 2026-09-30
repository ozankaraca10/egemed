import { describe, expect, it } from "vitest";
import { rewardMonthSchema, rewardUpsertRequestSchema } from "../../packages/contracts/src/index";
import { REWARD_SEED } from "../../packages/gami-catalogs/src/index";

describe("ödül tohumu (30 Eylül 2026)", () => {
  it("her sime Eylül–Ekim–Kasım 2026 için birer ödül verir; sim×ay tekildir", () => {
    const keys = REWARD_SEED.map((item) => `${item.simId}:${item.reward.month}`);
    expect(new Set(keys).size).toBe(9);
    for (const simId of ["pulse", "ausculta", "opaca"]) {
      expect(REWARD_SEED.filter((item) => item.simId === simId).map((item) => item.reward.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    }
  });

  it("her kayıt ödül yönetiminin yazma sözleşmesine uyar", () => {
    for (const { reward } of REWARD_SEED) {
      const { month, ...body } = reward;
      expect(rewardMonthSchema.safeParse(month).success, month).toBe(true);
      expect(rewardUpsertRequestSchema.safeParse(body).success, reward.title).toBe(true);
    }
  });
});

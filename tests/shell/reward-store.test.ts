import { REWARD_SEED } from "../../packages/gami-catalogs/src/rewardSeed";
import { createMockRewardsSource, type AdminReward } from "../../apps/shell/src/admin/rewardsDataSource";
import { createRewardStore } from "../../apps/shell/src/rewards/rewardStore";
import { describe, expect, it, vi } from "vitest";

const NOW = Date.UTC(2026, 8, 30, 12);

function seededRows(): AdminReward[] {
  return REWARD_SEED.map(({ simId, reward }) => ({ ...reward, simId, finalizedAt: null, updatedAt: "2026-09-30T09:00:00.000+03:00", winners: [] }));
}

describe("ödül deposu", () => {
  it("aynı ayı seçer, yoksa en yakın geçmiş aya döner ve gelecek ayı kullanmaz", async () => {
    const seeded = seededRows().filter((row) => row.simId === "pulse");
    let rows = seeded;
    const rewards = { ...createMockRewardsSource(), list: async () => rows };
    const store = createRewardStore({ now: () => NOW, rewards });
    await store.invalidate();
    expect(store.forSim("pulse").snapshot()?.current?.title).toBe(seeded.find((row) => row.month === "2026-09")?.title);
    rows = [
      { ...seeded[0]!, month: "2026-08" },
      ...seeded.filter((row) => row.month === "2026-10"),
    ];
    await store.invalidate();
    expect(store.forSim("pulse").snapshot()?.current?.month).toBe("2026-09");
    expect(store.forSim("pulse").snapshot()?.current?.title).toBe(seeded[0]?.title);
    store.dispose();
  });

  it("ortak sentetik kaynağa yazılan ödül invalidate sonrası sim kanalına geçer", async () => {
    const rewards = createMockRewardsSource();
    const store = createRewardStore({ now: () => NOW, rewards });
    await store.invalidate();
    const channel = store.forSim("ausculta");
    let seen = 0;
    channel.subscribe(() => { seen += 1; });
    const current = (await rewards.list("ausculta")).find((row) => row.month === "2026-09");
    if (current === undefined) throw new Error("seed_missing");
    await rewards.upsert("ausculta", current.month, { ...current, title: "Yeni ödül" });
    await store.invalidate();
    expect(channel.snapshot()?.current?.title).toBe("Yeni ödül");
    expect(seen).toBe(1);
    await store.invalidate();
    expect(seen).toBe(1);
    store.dispose();
  });

  it("API okuyucusu öğrenci sim ödül ucunu kullanır ve boş ödülü yüklenmiş snapshot olarak tutar", async () => {
    const getMySimReward = vi.fn(async () => ({ data: { current: null, winners: [] } }));
    const store = createRewardStore({
      client: { rewards: { getMySimReward } } as never,
      now: () => NOW,
      rewards: createMockRewardsSource(),
    });
    await store.invalidate();
    expect(getMySimReward).toHaveBeenCalledWith("ausculta");
    expect(store.forSim("ausculta").snapshot()).toEqual({ current: null, winners: [] });
    store.dispose();
  });

  it("REWARD_SEED her sim için üç taslak verir ve sahte kazanan üretmez", async () => {
    const rewards = createMockRewardsSource();
    for (const simId of ["pulse", "ausculta", "opaca"] as const) {
      const rows = await rewards.list(simId);
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.finalizedAt === null && row.winners.length === 0)).toBe(true);
    }
  });

  it("dispose API zamanlayıcısını ve broadcast kanalını kapatır", () => {
    const close = vi.fn();
    class ChannelStub {
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(): void {}
      close = close;
    }
    const setInterval = vi.fn(() => 42 as unknown as ReturnType<typeof globalThis.setInterval>);
    const clearInterval = vi.fn();
    vi.stubGlobal("BroadcastChannel", ChannelStub);
    vi.stubGlobal("setInterval", setInterval);
    vi.stubGlobal("clearInterval", clearInterval);
    const store = createRewardStore({
      client: { rewards: { getMySimReward: async () => ({ data: { current: null, winners: [] } }) } } as never,
      now: () => NOW,
      rewards: createMockRewardsSource(),
    });
    store.dispose();
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(clearInterval).toHaveBeenCalledWith(42);
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

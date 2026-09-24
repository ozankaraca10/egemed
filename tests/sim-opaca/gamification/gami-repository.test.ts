import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GamiRepository } from "../../../packages/gamification-core/src/repository";
import type { OpacaAttemptRecord } from "../../../packages/sim-opaca/src/gamification/attempt";
import {
  configureGamiRepository,
  formatGamiSyncError,
  getGamiRepo,
  isLocalRepo,
  LocalRepo,
  resetGamiRepo,
} from "../../../packages/sim-opaca/src/gamification/repo";

function mockApiRepo(overrides: Partial<GamiRepository<OpacaAttemptRecord>> = {}): GamiRepository<OpacaAttemptRecord> {
  return {
    getMe: vi.fn(async () => ({ id: "me", displayName: null, public: true, cohort: null })),
    updateMe: vi.fn(async () => undefined),
    recordAttempt: vi.fn(async () => undefined),
    recordLearn: vi.fn(async () => undefined),
    listAttempts: vi.fn(async () => []),
    getLeaderboard: vi.fn(async (_period, _cohort, now) => ({
      period: "week" as const,
      cohort: "all" as const,
      generatedAt: now.toISOString(),
      isDemo: false,
      rows: [],
    })),
    getMonthlyReward: vi.fn(async () => null),
    getRewardWinners: vi.fn(async () => []),
    ...overrides,
  };
}

beforeEach(() => {
  resetGamiRepo();
  configureGamiRepository(null);
});

describe("configureGamiRepository — enjeksiyon", () => {
  it("enjekte edilince getGamiRepo API deposunu döndürür", () => {
    const api = mockApiRepo();
    configureGamiRepository(api);
    expect(getGamiRepo()).toBe(api);
    expect(isLocalRepo(getGamiRepo())).toBe(false);
  });

  it("null ile sıfırlanınca yerel LocalRepo'ya döner", () => {
    configureGamiRepository(mockApiRepo());
    configureGamiRepository(null);
    expect(isLocalRepo(getGamiRepo())).toBe(true);
    expect(getGamiRepo()).toBeInstanceOf(LocalRepo);
  });

  it("demoState ile yerel depo hâlâ kullanılabilir", () => {
    configureGamiRepository(null);
    const repo = getGamiRepo({
      demoState: {
        v: 1,
        attempts: [],
        learn: { topics: [], items: {} },
        earned: [],
        profile: { displayName: null, public: true, cohort: null },
      },
    });
    expect(isLocalRepo(repo)).toBe(true);
    if (isLocalRepo(repo)) expect(repo.snapshot().attempts).toHaveLength(0);
  });
});

describe("formatGamiSyncError — kullanıcı mesajları", () => {
  it("ağ hatasında oturum kaybı vurgulanır", () => {
    expect(formatGamiSyncError(new TypeError("fetch failed"))).toContain("etkilenmedi");
  });

  it("desteklenmeyen yöntemde anlaşılır metin döner", async () => {
    const { GamiRepositoryUnsupportedError } = await import("../../../packages/gamification-core/src/repository");
    expect(formatGamiSyncError(new GamiRepositoryUnsupportedError("updateMe"))).toContain("desteklenmiyor");
  });
});

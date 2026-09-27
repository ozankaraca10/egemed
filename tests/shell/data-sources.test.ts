import { ApiError, type ApiClient } from "../../packages/api-client/src/index";
import { describe, expect, it, vi } from "vitest";
import { createApiShellDataSources } from "../../apps/shell/src/apiShellSources";
import { createMockShellDataSources } from "../../apps/shell/src/dataSources";
import type { ShellSession } from "../../apps/shell/src/session";

const SESSION: ShellSession = {
  actorId: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada",
  role: "student",
  simAccess: ["pulse", "ausculta", "opaca"],
};

const ZERO_SIM = {
  attempts: [],
  badges: [],
  leaderboard: { rank: 1, total: 1 },
  level: 1,
  simId: "pulse" as const,
  streak: { best: 0, current: 0, lastDate: null },
  weeklyGoal: { currentXp: 0, targetXp: 100 },
  xp: 0,
};

function clientStub(overrides: {
  readonly createUser?: ReturnType<typeof vi.fn>;
  readonly getAll?: ReturnType<typeof vi.fn>;
  readonly learnStatus?: ReturnType<typeof vi.fn>;
}): ApiClient {
  return {
    admin: {
      createUser: overrides.createUser ?? vi.fn(),
    },
    gamification: {
      getAll: overrides.getAll ?? vi.fn(),
    },
    learn: {
      status: overrides.learnStatus ?? vi.fn(),
      complete: vi.fn(),
    },
  } as unknown as ApiClient;
}

describe("createMockShellDataSources", () => {
  it("sahte oturumda sentetik ilerlemeyi paylaşır ve sayfalar aynı kullanıcı kaynağını kullanır", async () => {
    const sources = createMockShellDataSources();
    expect(sources.users).toBe(sources.users);
    const summaries = await sources.gamification(SESSION).getSummaries();
    expect(summaries.some((summary) => summary.xp === 1450)).toBe(true);
    await expect(sources.gamification(null).getSummaries()).resolves.toEqual([]);
    // Öğrenme kaydı sunucu ister; sahte oturumda kaynak yoktur.
    expect(sources.learn(SESSION)).toBeNull();
  });
});

describe("createApiShellDataSources", () => {
  it("API oturumunda /me/gamification okur ve 1450 XP döndürmez", async () => {
    const getAll = vi.fn().mockResolvedValue({ data: { sims: [ZERO_SIM] } });
    const sources = createApiShellDataSources(clientStub({ getAll }));
    await expect(sources.gamification(null).getSummaries()).resolves.toEqual([]);
    expect(getAll).not.toHaveBeenCalled();
    await expect(sources.gamification(SESSION).getSummaries()).resolves.toEqual([ZERO_SIM]);
    expect(getAll).toHaveBeenCalledOnce();
  });

  it("öğrenme kaynağı yalnız API oturumunda döner ve /me/learn okur (27 Eyl 2026)", async () => {
    const sims = {
      ausculta: { complete: true, completedAt: "2026-09-27T10:00:00.000+03:00" },
      opaca: { complete: false, completedAt: null },
      pulse: { complete: false, completedAt: null },
    };
    const learnStatus = vi.fn().mockResolvedValue({ data: { sims } });
    const sources = createApiShellDataSources(clientStub({ learnStatus }));
    expect(sources.learn(null)).toBeNull();
    await expect(sources.learn(SESSION)?.status()).resolves.toEqual(sims);
    expect(learnStatus).toHaveBeenCalledOnce();
  });

  it("mock birim kimliğini create isteğinden düşer ve yinelenen anahtarı kabuk hatasına çevirir", async () => {
    const createUser = vi.fn().mockResolvedValue({
      authMethod: "sso",
      createdAt: "2026-09-24T10:00:00.000+03:00",
      displayName: "T89 Kalici Kullanici",
      email: null,
      id: "00000000-0000-4000-8000-000000000099",
      lastLoginAt: null,
      roles: ["kullanici"],
      simAccess: ["pulse"],
      status: "invited",
      unitId: null,
      updatedAt: "2026-09-24T10:00:00.000+03:00",
      username: "t89.kalici",
    });
    const sources = createApiShellDataSources(clientStub({ createUser }));
    const created = await sources.users.create({
      authMethod: "sso",
      displayName: "T89 Kalici Kullanici",
      mappingKeyType: "username",
      mappingKeyValue: "t89.kalici",
      role: "kullanici",
      simAccess: ["pulse"],
      unitId: "unit-3",
    });
    expect(createUser).toHaveBeenCalledWith({
      authMethod: "sso",
      displayName: "T89 Kalici Kullanici",
      role: "kullanici",
      simAccess: ["pulse"],
      username: "t89.kalici",
    });
    expect(created.username).toBe("t89.kalici");
    expect(created.history[0]?.action).toBe("user.create");

    createUser.mockRejectedValueOnce(new ApiError("duplicate_mapping_key", 409, { field: "username" }));
    await expect(
      sources.users.create({
        authMethod: "sso",
        displayName: "T89 Kalici Kullanici",
        mappingKeyType: "username",
        mappingKeyValue: "t89.kalici",
        role: "kullanici",
        simAccess: [],
        unitId: "unit-3",
      }),
    ).rejects.toThrow("duplicate_mapping_key");
  });
});

import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "../../packages/gamification-core/src/index";
import {
  ApiError,
  ApiNetworkError,
  ApiSchemaError,
  createApiClient,
  createApiGamiRepository,
  GamiRepositoryUnsupportedError,
  isSessionMissingError,
  type ApiFetch,
  type ApiFetchInit,
  type ApiResponse,
} from "../../packages/api-client/src/index";

interface Call {
  readonly url: string;
  readonly init: ApiFetchInit;
}

interface Planned {
  readonly status: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

const ATTEMPT_UUID = "00000000-0000-4000-8000-000000000030";
const SIM_ID = "pulse" as const;
const FIXED_FINISHED_AT = "2026-09-22T14:05:00.000+03:00";

function createHeaders(values: Readonly<Record<string, string>> = {}): ApiResponse["headers"] {
  const lowered = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    get(name: string): string | null {
      return lowered.get(name.toLowerCase()) ?? null;
    },
  };
}

function createResponse(plan: Planned): ApiResponse {
  return {
    status: plan.status,
    headers: createHeaders(plan.headers),
    async json(): Promise<unknown> {
      if (plan.json !== undefined) return plan.json;
      throw new Error("json yok");
    },
    async text(): Promise<string> {
      if (plan.text !== undefined) return plan.text;
      return plan.json === undefined ? "" : JSON.stringify(plan.json);
    },
  };
}

function createFetchMock(plans: readonly Planned[]): {
  readonly fetch: ApiFetch;
  readonly calls: Call[];
} {
  const queue = [...plans];
  const calls: Call[] = [];
  const fetch: ApiFetch = async (url, init) => {
    calls.push({ url, init });
    const planned = queue.shift();
    if (planned === undefined) {
      throw new Error(`Planlanan yanıttan fazla çağrı alındı: ${url}`);
    }
    return createResponse(planned);
  };
  return { fetch, calls };
}

function summaryPayload(attempts: readonly unknown[] = []) {
  return {
    data: {
      simId: SIM_ID,
      xp: 1450,
      level: 4,
      streak: { current: 3, best: 7, lastDate: "2026-09-22" },
      weeklyGoal: { targetXp: 300, currentXp: 120 },
      badges: [{ key: "ritim-ustasi", awardedAt: "2026-09-20T10:15:00.000+03:00" }],
      leaderboard: { rank: 2, total: 42 },
      attempts,
    },
  };
}

function sampleAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: ATTEMPT_UUID,
    mode: "assessment",
    finishedAt: FIXED_FINISHED_AT,
    score: 80,
    mastery: true,
    caseCount: 10,
    hintsUsed: 0,
    durationMs: 1_500_000,
    domains: { ritim: 80 },
    extra: {},
    ...overrides,
  };
}

function encodeAttempt(input: {
  attempt: AttemptRecord;
  attemptNo: number;
  startedAt: string;
}) {
  return {
    id: ATTEMPT_UUID,
    attemptNo: input.attemptNo,
    startedAt: input.startedAt,
    finishedAt: input.attempt.finishedAt,
    score: input.attempt.score,
    maxScore: 100,
    passed: input.attempt.mastery,
    summary: { xp: 120, ritim: 80 },
  };
}

function createRepo(mock: ReturnType<typeof createFetchMock>) {
  const client = createApiClient({
    baseUrl: "https://api.example.invalid",
    fetch: mock.fetch,
  });
  return createApiGamiRepository({
    client: client.gamification,
    simId: SIM_ID,
    encodeAttempt,
  });
}

describe("createApiGamiRepository — başarısızlık yolları", () => {
  it("ağ hatasında ApiNetworkError fırlatır; ikinci deneme/kuyruk yok", async () => {
    const fetch: ApiFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const client = createApiClient({ baseUrl: "https://api.example.invalid", fetch });
    const repo = createApiGamiRepository({
      client: client.gamification,
      simId: SIM_ID,
      encodeAttempt,
    });

    await expect(repo.getMe()).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("401 unauthorized oturum eksikliğine eşlenir", async () => {
    const mock = createFetchMock([{ status: 401, json: { error: { code: "unauthorized" } } }]);
    const repo = createRepo(mock);

    try {
      await repo.listAttempts();
      expect.unreachable("401 bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(isSessionMissingError(error)).toBe(true);
    }
  });

  it("409 conflict ApiError olarak iletilir; yerel kayıt tutulmaz", async () => {
    const mock = createFetchMock([
      { status: 200, json: summaryPayload([{ attemptNo: 1, finishedAt: FIXED_FINISHED_AT, score: 60, maxScore: 100, passed: false }]) },
      { status: 409, json: { error: { code: "conflict" } } },
    ]);
    const repo = createRepo(mock);

    await expect(repo.recordAttempt(sampleAttempt())).rejects.toMatchObject({
      name: "ApiError",
      code: "conflict",
      status: 409,
    });
    expect(mock.calls).toHaveLength(2);
  });

  it("sözleşmeye uymayan özet yanıtında ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: {
            simId: SIM_ID,
            xp: -1,
            level: 4,
            streak: { current: 3, best: 7, lastDate: "2026-09-22" },
            weeklyGoal: { targetXp: 300, currentXp: 120 },
            badges: [],
            leaderboard: { rank: 2, total: 42 },
            attempts: [],
          },
        },
      },
    ]);
    const repo = createRepo(mock);

    await expect(repo.getLeaderboard("week", "all", new Date("2026-09-24T10:00:00.000Z"))).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it("encodeAttempt geçersiz gövde üretirse istek gönderilmeden ApiSchemaError", async () => {
    const mock = createFetchMock([
      { status: 200, json: summaryPayload() },
    ]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });
    const repo = createApiGamiRepository({
      client: client.gamification,
      simId: SIM_ID,
      encodeAttempt: () => ({
        id: "gecersiz-id",
        attemptNo: 1,
        startedAt: FIXED_FINISHED_AT,
        finishedAt: FIXED_FINISHED_AT,
        summary: { xp: 120 },
      }),
    });

    await expect(repo.recordAttempt(sampleAttempt())).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(1);
  });

  it("API'de karşılığı olmayan PORT yöntemleri GamiRepositoryUnsupportedError fırlatır", async () => {
    const mock = createFetchMock([{ status: 200, json: summaryPayload() }]);
    const repo = createRepo(mock);
    const now = new Date("2026-09-24T10:00:00.000Z");

    await expect(repo.updateMe({ public: false })).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    await expect(repo.recordLearn({ topic: "finding.pneumothorax" }, now)).rejects.toBeInstanceOf(
      GamiRepositoryUnsupportedError,
    );
    await expect(repo.getMonthlyReward("2026-09")).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    await expect(repo.getRewardWinners(3, now)).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
  });
});

describe("createApiGamiRepository — başarı yolları", () => {
  it("getMe özet okuduktan sonra varsayılan profil döner", async () => {
    const mock = createFetchMock([{ status: 200, json: summaryPayload() }]);
    const repo = createRepo(mock);

    await expect(repo.getMe()).resolves.toEqual({
      id: "me",
      displayName: null,
      public: true,
      cohort: null,
    });
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/gamification/${SIM_ID}`);
  });

  it("listAttempts özet denemelerini AttemptRecord biçimine mapler", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: summaryPayload([
          { attemptNo: 2, finishedAt: FIXED_FINISHED_AT, score: 80, maxScore: 100, passed: true },
        ]),
      },
    ]);
    const repo = createRepo(mock);
    const attempts = await repo.listAttempts();

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: "pulse-2",
      mode: "assessment",
      finishedAt: FIXED_FINISHED_AT,
      score: 80,
      mastery: true,
    });
  });

  it("getLeaderboard özet liderlik verisini tek satırlık görünüme taşır", async () => {
    const mock = createFetchMock([{ status: 200, json: summaryPayload() }]);
    const repo = createRepo(mock);
    const now = new Date("2026-09-24T10:00:00.000Z");

    const view = await repo.getLeaderboard("month", "all", now);
    expect(view.isDemo).toBe(false);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      isMe: true,
      totalXp: 1450,
      level: 4,
      rank: 2,
    });
  });

  it("recordAttempt kodlu özeti POST eder; başarı sonrası özet önbelleği yenilenir", async () => {
    const mock = createFetchMock([
      { status: 200, json: summaryPayload() },
      { status: 204, text: "" },
      {
        status: 200,
        json: summaryPayload([
          { attemptNo: 3, finishedAt: FIXED_FINISHED_AT, score: 80, maxScore: 100, passed: true },
        ]),
      },
    ]);
    const repo = createRepo(mock);

    await repo.recordAttempt(sampleAttempt());
    expect(mock.calls[1]?.url).toBe(`https://api.example.invalid/me/gamification/${SIM_ID}/attempts`);
    expect(JSON.parse(mock.calls[1]?.init.body ?? "{}")).toMatchObject({
      id: ATTEMPT_UUID,
      attemptNo: 1,
      summary: { xp: 120, ritim: 80 },
    });

    const attempts = await repo.listAttempts();
    expect(attempts.map((attempt) => attempt.id)).toEqual(["pulse-3"]);
    expect(mock.calls).toHaveLength(3);
  });

  it("recordAttempt başarısız olunca önbellek korunur; kuyruk veya yeniden deneme yok", async () => {
    const mock = createFetchMock([
      { status: 200, json: summaryPayload() },
      { status: 500, json: { error: { code: "internal_error" } } },
    ]);
    const repo = createRepo(mock);

    await expect(repo.recordAttempt(sampleAttempt())).rejects.toBeInstanceOf(ApiError);
    expect(mock.calls).toHaveLength(2);

    await repo.listAttempts();
    expect(mock.calls).toHaveLength(2);
  });
});

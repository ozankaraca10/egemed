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
  learnTopicFor,
  type ApiFetch,
  type ApiFetchInit,
  type ApiResponse,
} from "../../packages/api-client/src/index";

/**
 * A4 (ADR-009): istemci deposu puanlı deneme YAZMAZ (`recordAttempt` desteklenmez;
 * denemeyi sunucu oturumu yazar). Kalan tek yazma yolu puansız öğrenme kaydıdır ve
 * gövdesi yalnız `{ topic }` taşır.
 */

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

const SIM_ID = "pulse" as const;
const FIXED_FINISHED_AT = "2026-09-22T14:05:00.000+03:00";
const LEARN_RESPONSE = {
  data: {
    simId: SIM_ID,
    topic: "pulse:topic:ritim-serisi",
    recordedAt: "2026-09-28T12:00:00.000+03:00",
    xpGained: 2,
  },
};

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

function leaderboardPayload() {
  return {
    data: {
      period: "month",
      cohort: "all",
      generatedAt: "2026-09-24T10:00:00.000+03:00",
      isDemo: false,
      rows: [
        {
          id: "peer-1",
          displayName: "MK",
          isMe: false,
          isPublic: true,
          cohort: 5,
          periodScore: 92.5,
          attemptsCount: 2,
          reachedAt: "2026-09-22T14:05:00.000+03:00",
          totalXp: 9999,
          level: 9,
          rank: 1,
        },
        {
          id: "me",
          displayName: "AV",
          isMe: true,
          isPublic: true,
          cohort: 3,
          periodScore: 70,
          attemptsCount: 2,
          reachedAt: "2026-09-22T14:05:00.000+03:00",
          totalXp: 1450,
          level: 4,
          rank: 2,
        },
      ],
    },
    meta: { page: 1, pageSize: 100, total: 2 },
  };
}

function sampleAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: "00000000-0000-4000-8000-000000000030",
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

function createRepo(mock: ReturnType<typeof createFetchMock>) {
  const client = createApiClient({
    baseUrl: "https://api.example.invalid",
    fetch: mock.fetch,
  });
  return createApiGamiRepository({
    client: client.gamification,
    simId: SIM_ID,
  });
}

describe("learnTopicFor — puansız öğrenme anahtarı (A4)", () => {
  it("konu ve BT yığını anahtarlarını sim ad alanına çevirir", () => {
    expect(learnTopicFor("opaca", { topic: "finding.pleura" })).toBe("opaca:topic:finding.pleura");
    expect(learnTopicFor("opaca", { ctStack: "commons_ct_axial_lung_window" })).toBe(
      "opaca:stack:commons_ct_axial_lung_window",
    );
    expect(learnTopicFor("pulse", { topic: "af" })).toBe("pulse:topic:af");
  });

  it("boş etkinlikte anahtar üretmez", () => {
    expect(learnTopicFor("opaca", {})).toBeNull();
    expect(learnTopicFor("opaca", { topic: "  " })).toBeNull();
  });
});

describe("createApiGamiRepository — puanlı deneme yazımı yok (A4)", () => {
  it("recordAttempt GamiRepositoryUnsupportedError fırlatır; istek gönderilmez", async () => {
    const mock = createFetchMock([]);
    const repo = createRepo(mock);

    await expect(repo.recordAttempt(sampleAttempt())).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("createApiGamiRepository — başarısızlık yolları", () => {
  it("ağ hatasında ApiNetworkError fırlatır; ikinci deneme/kuyruk yok", async () => {
    const fetch: ApiFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const client = createApiClient({ baseUrl: "https://api.example.invalid", fetch });
    const repo = createApiGamiRepository({
      client: client.gamification,
      simId: SIM_ID,
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

  it("puanlı gövde 403 server_scored ApiError olarak iletilir; kuyruk yok", async () => {
    const mock = createFetchMock([{ status: 403, json: { error: { code: "server_scored" } } }]);
    const repo = createRepo(mock);

    await expect(repo.recordLearn({ topic: "ritim-serisi" }, new Date("2026-09-24T10:00:00.000Z"))).rejects.toMatchObject({
      name: "ApiError",
      code: "server_scored",
      status: 403,
    });
    expect(mock.calls).toHaveLength(1);
  });

  it("sözleşmeye uymayan liderlik yanıtında ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: {
            period: "month",
            cohort: "all",
            generatedAt: "2026-09-24T10:00:00.000+03:00",
            isDemo: true,
            rows: [],
          },
          meta: { page: 1, pageSize: 100, total: 0 },
        },
      },
    ]);
    const repo = createRepo(mock);

    await expect(repo.getLeaderboard("week", "all", new Date("2026-09-24T10:00:00.000Z"))).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  it("API'de karşılığı olmayan PORT yöntemleri GamiRepositoryUnsupportedError fırlatır", async () => {
    const mock = createFetchMock([]);
    const repo = createRepo(mock);
    const now = new Date("2026-09-24T10:00:00.000Z");

    await expect(repo.updateMe({ public: false })).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    await expect(repo.recordAttempt(sampleAttempt())).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    await expect(repo.getMonthlyReward("2026-09")).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    await expect(repo.getRewardWinners(3, now)).rejects.toBeInstanceOf(GamiRepositoryUnsupportedError);
    expect(mock.calls).toHaveLength(0);
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

  it("getLeaderboard liderlik uçunu çağırır ve satırları GamiLeaderboardView'e mapler", async () => {
    const mock = createFetchMock([{ status: 200, json: leaderboardPayload() }]);
    const repo = createRepo(mock);
    const now = new Date("2026-09-24T10:00:00.000Z");

    const view = await repo.getLeaderboard("month", "all", now);
    expect(view.isDemo).toBe(false);
    expect(view.rows).toHaveLength(2);
    expect(mock.calls[0]?.url).toContain(`/me/gamification/${SIM_ID}/leaderboard`);
    expect(view.rows[1]).toMatchObject({
      id: "me",
      isMe: true,
      totalXp: 1450,
      level: 4,
      rank: 2,
    });
  });

  it("recordLearn puansız gövdeyi POST eder; skor/özet alanı göndermez", async () => {
    const mock = createFetchMock([{ status: 201, json: LEARN_RESPONSE }]);
    const repo = createRepo(mock);

    await repo.recordLearn({ topic: "ritim-serisi" }, new Date("2026-09-28T10:00:00.000Z"));
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/gamification/${SIM_ID}/attempts`);
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toEqual({
      topic: "pulse:topic:ritim-serisi",
    });
  });

  it("recordLearn kayıt alanı yoksa istek göndermez", async () => {
    const mock = createFetchMock([]);
    const repo = createRepo(mock);

    await repo.recordLearn({}, new Date("2026-09-28T10:00:00.000Z"));
    expect(mock.calls).toHaveLength(0);
  });
});

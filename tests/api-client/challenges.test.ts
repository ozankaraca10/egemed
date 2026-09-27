import { describe, expect, it } from "vitest";
import {
  apiIssueCode,
  ApiError,
  ApiSchemaError,
  createApiClient,
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
}

function createHeaders(): ApiResponse["headers"] {
  return { get: () => null };
}

function createResponse(plan: Planned): ApiResponse {
  return {
    status: plan.status,
    headers: createHeaders(),
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

function createClient(mock: ReturnType<typeof createFetchMock>) {
  return createApiClient({ baseUrl: "https://api.example.invalid", fetch: mock.fetch, readCsrfToken: () => "csrf-tok" });
}

const SIM_ID = "pulse" as const;
const CHALLENGE_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const CODE = "482913";

function participantWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    role: "inviter",
    displayName: "A. Veli",
    isMe: true,
    finished: false,
    score: null,
    durationMs: null,
    ...overrides,
  };
}

function challengeWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    challengeId: CHALLENGE_ID,
    simId: SIM_ID,
    status: "open",
    code: CODE,
    caseCount: 5,
    perCaseLimitMs: 60_000,
    totalLimitMs: 300_000,
    expiresAt: "2026-09-27T12:00:00.000+03:00",
    participants: [participantWireBody()],
    winner: null,
    mySessionId: null,
    ...overrides,
  };
}

function sessionWireBody() {
  return {
    sessionId: SESSION_ID,
    mode: "challenge",
    caseCount: 5,
    perCaseLimitMs: 60_000,
    totalLimitMs: 300_000,
    startedAt: "2026-09-27T12:00:00.000+03:00",
  };
}

describe("api-client challenges — başarı yolları", () => {
  it("create POST /me/challenges ile simId gönderir ve CSRF ekler", async () => {
    const mock = createFetchMock([{ status: 201, json: { data: challengeWireBody() } }]);
    const client = createClient(mock);

    const result = await client.challenges.create(SIM_ID);
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/me/challenges");
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toEqual({ simId: SIM_ID });
    expect(result.data.challengeId).toBe(CHALLENGE_ID);
  });

  it("join POST /me/challenges/join ile code gönderir", async () => {
    const mock = createFetchMock([
      { status: 200, json: { data: challengeWireBody({ status: "accepted", code: null }) } },
    ]);
    const client = createClient(mock);

    const result = await client.challenges.join(CODE);
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/me/challenges/join");
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toEqual({ code: CODE });
    expect(result.data.status).toBe("accepted");
  });

  it("list GET /me/challenges çağırır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: [challengeWireBody()] } }]);
    const client = createClient(mock);

    const result = await client.challenges.list();
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/me/challenges");
    expect(mock.calls[0]?.init.method).toBe("GET");
    expect(result.data).toHaveLength(1);
  });

  it("get GET /me/challenges/:id çağırır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: challengeWireBody() } }]);
    const client = createClient(mock);

    const result = await client.challenges.get(CHALLENGE_ID);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/challenges/${CHALLENGE_ID}`);
    expect(mock.calls[0]?.init.method).toBe("GET");
    expect(result.data.challengeId).toBe(CHALLENGE_ID);
  });

  it("startSession POST /me/challenges/:id/session çağırır", async () => {
    const mock = createFetchMock([{ status: 201, json: { data: sessionWireBody() } }]);
    const client = createClient(mock);

    const result = await client.challenges.startSession(CHALLENGE_ID);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/challenges/${CHALLENGE_ID}/session`);
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(result.data.sessionId).toBe(SESSION_ID);
  });
});

describe("api-client challenges — hata yolları", () => {
  it("geçersiz code biçiminde istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(client.challenges.join("12a456")).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("sözleşme dışı yanıt ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: [{ challengeId: CHALLENGE_ID }] } }]);
    const client = createClient(mock);

    await expect(client.challenges.list()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it("409 conflict (too_many_open_challenges) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 409,
        json: { error: { code: "conflict", details: { issues: [{ code: "too_many_open_challenges" }] } } },
      },
    ]);
    const client = createClient(mock);

    await expect(client.challenges.create(SIM_ID)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "too_many_open_challenges",
    );
  });

  it("409 conflict (own_challenge) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      { status: 409, json: { error: { code: "conflict", details: { issues: [{ code: "own_challenge" }] } } } },
    ]);
    const client = createClient(mock);

    try {
      await client.challenges.join(CODE);
      expect.unreachable("409 bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("conflict");
      expect(apiIssueCode(error)).toBe("own_challenge");
    }
  });

  it("409 conflict (challenge_taken) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      { status: 409, json: { error: { code: "conflict", details: { issues: [{ code: "challenge_taken" }] } } } },
    ]);
    const client = createClient(mock);

    await expect(client.challenges.join(CODE)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "challenge_taken",
    );
  });

  it("409 conflict (challenge_not_accepted) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 409,
        json: { error: { code: "conflict", details: { issues: [{ code: "challenge_not_accepted" }] } } },
      },
    ]);
    const client = createClient(mock);

    await expect(client.challenges.startSession(CHALLENGE_ID)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "challenge_not_accepted",
    );
  });

  it("409 conflict (challenge_already_played) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 409,
        json: { error: { code: "conflict", details: { issues: [{ code: "challenge_already_played" }] } } },
      },
    ]);
    const client = createClient(mock);

    await expect(client.challenges.startSession(CHALLENGE_ID)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "challenge_already_played",
    );
  });

  it("403 role_not_permitted ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 403, json: { error: { code: "role_not_permitted" } } }]);
    const client = createClient(mock);

    await expect(client.challenges.create(SIM_ID)).rejects.toMatchObject({
      name: "ApiError",
      code: "role_not_permitted",
      status: 403,
    });
  });

  it("404 not_found ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 404, json: { error: { code: "not_found" } } }]);
    const client = createClient(mock);

    await expect(client.challenges.get(CHALLENGE_ID)).rejects.toMatchObject({
      name: "ApiError",
      code: "not_found",
      status: 404,
    });
  });

  it("429 rate_limited ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 429, json: { error: { code: "rate_limited" } } }]);
    const client = createClient(mock);

    await expect(client.challenges.create(SIM_ID)).rejects.toMatchObject({
      name: "ApiError",
      code: "rate_limited",
      status: 429,
    });
  });
});

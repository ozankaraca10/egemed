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
import type { SimSessionAnswerRequest } from "../../packages/contracts/src/index";

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

const SIM_ID = "ausculta" as const;
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "tok_ab12cd34";
const QUESTION_ID = "q1";
const OPTION_ID = "opt_ab12cd34";

function sessionWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: SESSION_ID,
    mode: "practice",
    caseCount: 6,
    perCaseLimitMs: null,
    totalLimitMs: null,
    startedAt: "2026-09-20T10:00:00.000+03:00",
    ...overrides,
  };
}

function publicCaseWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    simId: "ausculta",
    index: 1,
    label: "Vaka 1",
    patient: { age: 45, sex: "erkek" },
    chiefComplaint: "Nefes darlığı",
    history: "3 gündür şikayet.",
    vitalSigns: { hr: 88, rr: 18, bp: "120/80", spo2: 97, temp: "36.8" },
    tasks: ["Ausculta ile dinle"],
    views: ["front"],
    allowedHeads: ["bell", "diaphragm"],
    points: [{ pointId: "mitral", audio: { bell: TOKEN, diaphragm: TOKEN } }],
    questions: [
      {
        id: QUESTION_ID,
        type: "single_choice",
        domain: "recognition",
        prompt: "Hangisi doğru?",
        multiple: false,
        hintAvailable: true,
        options: [
          { id: OPTION_ID, label: "Seçenek A" },
          { id: "opt_ef56gh78", label: "Seçenek B" },
        ],
      },
    ],
    technique: { minPointsVisited: 1 },
    openedAt: "2026-09-20T10:00:00.000+03:00",
    ...overrides,
  };
}

function caseResultWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    index: 1,
    title: "Mitral Yetmezliği",
    diagnosis: "Mitral yetmezliği",
    summary: "Özet metin.",
    total: 8,
    max: 10,
    mastery: false,
    domains: { recognition: { earned: 8, max: 10 } },
    hintsUsed: 0,
    questions: [
      { questionId: QUESTION_ID, correct: true, correctOptionIds: [OPTION_ID], feedback: "Doğru." },
    ],
    ...overrides,
  };
}

function answerRequestBody(): SimSessionAnswerRequest {
  return {
    answers: { [QUESTION_ID]: [OPTION_ID] },
    telemetry: {
      visits: { mitral: { dwellMs: 1000, listenMs: 500, visits: 1, firstOrder: 0 } },
      order: ["mitral"],
      headChanges: 0,
      headUse: { bell: 1, diaphragm: 0 },
      replayCount: 0,
    },
  };
}

describe("api-client simSessions — başarı yolları", () => {
  it("start POST /me/sims/:simId/sessions ile mode gönderir ve CSRF ekler", async () => {
    const mock = createFetchMock([{ status: 201, json: { data: sessionWireBody() } }]);
    const client = createClient(mock);

    const result = await client.simSessions.start(SIM_ID, "practice");
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/sims/${SIM_ID}/sessions`);
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toEqual({ mode: "practice" });
    expect(result.data.sessionId).toBe(SESSION_ID);
  });

  it("getCase GET .../cases/:index çağırır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: publicCaseWireBody() } }]);
    const client = createClient(mock);

    const result = await client.simSessions.getCase(SIM_ID, SESSION_ID, 1);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/sims/${SIM_ID}/sessions/${SESSION_ID}/cases/1`);
    expect(mock.calls[0]?.init.method).toBe("GET");
    expect(result.data.index).toBe(1);
  });

  it("hint POST .../hint ile questionId gönderir", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: { hint: "İpucu metni", hintsUsed: 1 } } }]);
    const client = createClient(mock);

    const result = await client.simSessions.hint(SIM_ID, SESSION_ID, 1, QUESTION_ID);
    expect(mock.calls[0]?.url).toBe(
      `https://api.example.invalid/me/sims/${SIM_ID}/sessions/${SESSION_ID}/cases/1/hint`,
    );
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toEqual({ questionId: QUESTION_ID });
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(result.data.hintsUsed).toBe(1);
  });

  it("answer POST .../answer ile gövde ve CSRF gönderir (pratik sonucu)", async () => {
    const mock = createFetchMock([
      { status: 200, json: { data: { mode: "practice", result: caseResultWireBody() } } },
    ]);
    const client = createClient(mock);

    const result = await client.simSessions.answer(SIM_ID, SESSION_ID, 1, answerRequestBody());
    expect(mock.calls[0]?.url).toBe(
      `https://api.example.invalid/me/sims/${SIM_ID}/sessions/${SESSION_ID}/cases/1/answer`,
    );
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    if (result.data.mode === "practice") {
      expect(result.data.result.total).toBe(8);
    } else {
      throw new Error("practice modu bekleniyordu");
    }
  });

  it("answer değerlendirme modunda accepted döner", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: { mode: "assessment", accepted: true } } }]);
    const client = createClient(mock);

    const result = await client.simSessions.answer(SIM_ID, SESSION_ID, 1, answerRequestBody());
    expect(result.data).toEqual({ mode: "assessment", accepted: true });
  });

  it("finish POST .../finish çağırır", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: {
            mode: "assessment",
            total: 40,
            max: 50,
            passed: true,
            cases: [caseResultWireBody()],
            attemptId: "22222222-2222-4222-8222-222222222222",
            xpGained: 20,
          },
        },
      },
    ]);
    const client = createClient(mock);

    const result = await client.simSessions.finish(SIM_ID, SESSION_ID);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/sims/${SIM_ID}/sessions/${SESSION_ID}/finish`);
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(result.data.passed).toBe(true);
  });

  it("audioUrl istek yapmaz; taban adres + yolu döner", () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    const url = client.simSessions.audioUrl(SIM_ID, SESSION_ID, TOKEN);
    expect(url).toBe(`https://api.example.invalid/me/sims/${SIM_ID}/sessions/${SESSION_ID}/audio/${TOKEN}`);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("api-client simSessions — hata yolları", () => {
  it("geçersiz mode ile istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(
      client.simSessions.start(SIM_ID, "challenge" as unknown as "practice"),
    ).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("geçersiz index (0) ile istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(client.simSessions.getCase(SIM_ID, SESSION_ID, 0)).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("geçersiz index (21) ile istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(client.simSessions.getCase(SIM_ID, SESSION_ID, 21)).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("geçersiz answer gövdesinde istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(
      client.simSessions.answer(SIM_ID, SESSION_ID, 1, {
        ...answerRequestBody(),
        answers: { [QUESTION_ID]: ["invalid token!"] },
      }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("audioUrl geçersiz token'da ApiSchemaError fırlatır", () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    expect(() => client.simSessions.audioUrl(SIM_ID, SESSION_ID, "short")).toThrow(ApiSchemaError);
  });

  it("sözleşme dışı yanıt ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: sessionWireBody({ mode: "unknown" }) } }]);
    const client = createClient(mock);

    await expect(client.simSessions.start(SIM_ID, "practice")).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it("409 conflict (case_out_of_order) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      { status: 409, json: { error: { code: "conflict", details: { issues: [{ code: "case_out_of_order" }] } } } },
    ]);
    const client = createClient(mock);

    try {
      await client.simSessions.getCase(SIM_ID, SESSION_ID, 2);
      expect.unreachable("409 bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("conflict");
      expect((error as ApiError).status).toBe(409);
      expect(apiIssueCode(error)).toBe("case_out_of_order");
    }
  });

  it("409 conflict (case_already_answered) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 409,
        json: { error: { code: "conflict", details: { issues: [{ code: "case_already_answered" }] } } },
      },
    ]);
    const client = createClient(mock);

    await expect(client.simSessions.answer(SIM_ID, SESSION_ID, 1, answerRequestBody())).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "case_already_answered",
    );
  });

  it("422 validation_failed (case_time_exceeded) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 422,
        json: {
          error: { code: "validation_failed", details: { issues: [{ code: "case_time_exceeded" }] } },
        },
      },
    ]);
    const client = createClient(mock);

    try {
      await client.simSessions.answer(SIM_ID, SESSION_ID, 1, answerRequestBody());
      expect.unreachable("422 bekleniyordu");
    } catch (error) {
      expect((error as ApiError).status).toBe(422);
      expect(apiIssueCode(error)).toBe("case_time_exceeded");
    }
  });

  it("422 validation_failed (session_time_exceeded) apiIssueCode ile okunabilir", async () => {
    const mock = createFetchMock([
      {
        status: 422,
        json: {
          error: { code: "validation_failed", details: { issues: [{ code: "session_time_exceeded" }] } },
        },
      },
    ]);
    const client = createClient(mock);

    await expect(client.simSessions.getCase(SIM_ID, SESSION_ID, 1)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "session_time_exceeded",
    );
  });

  it("403 forbidden ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 403, json: { error: { code: "forbidden" } } }]);
    const client = createClient(mock);

    await expect(client.simSessions.start(SIM_ID, "practice")).rejects.toMatchObject({
      name: "ApiError",
      code: "forbidden",
      status: 403,
    });
    expect(apiIssueCode(new Error("başka"))).toBeUndefined();
  });

  it("404 not_found ApiError olarak iletilir (session_expired/finished)", async () => {
    const mock = createFetchMock([
      { status: 409, json: { error: { code: "conflict", details: { issues: [{ code: "session_finished" }] } } } },
    ]);
    const client = createClient(mock);

    await expect(client.simSessions.getCase(SIM_ID, SESSION_ID, 1)).rejects.toSatisfy(
      (error: unknown) => apiIssueCode(error) === "session_finished",
    );
  });

  it("429 rate_limited ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 429, json: { error: { code: "rate_limited" } } }]);
    const client = createClient(mock);

    await expect(client.simSessions.start(SIM_ID, "practice")).rejects.toMatchObject({
      name: "ApiError",
      code: "rate_limited",
      status: 429,
    });
  });
});

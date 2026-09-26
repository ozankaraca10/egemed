import { describe, expect, it } from "vitest";
import {
  ApiError,
  ApiSchemaError,
  createApiClient,
  type ApiFetch,
  type ApiFetchInit,
  type ApiResponse,
} from "../../packages/api-client/src/index";
import type { RewardUpsertRequest } from "../../packages/contracts/src/index";

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

const SIM_ID = "pulse" as const;
const MONTH = "2026-08";

function rewardOnlyBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    simId: SIM_ID,
    month: MONTH,
    title: "Ayın Yıldızı",
    description: "En yüksek başarıyı gösteren öğrencilere ödül.",
    sponsor: "EGEMED",
    winnersCount: 3,
    eligibility: { cohorts: [1, 2], minAssessments: 5, requirePublicName: true },
    terms: ["Katılım şartları geçerlidir."],
    finalizedAt: null,
    updatedAt: "2026-09-20T10:00:00.000+03:00",
    ...overrides,
  };
}

function rewardWireBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...rewardOnlyBody(overrides),
    winners: (overrides.winners as unknown[] | undefined) ?? [],
  };
}

function upsertRequestBody(): RewardUpsertRequest {
  return {
    title: "Ayın Yıldızı",
    description: "En yüksek başarıyı gösteren öğrencilere ödül.",
    sponsor: "EGEMED",
    winnersCount: 3,
    eligibility: { cohorts: [1, 2], minAssessments: 5, requirePublicName: true },
    terms: ["Katılım şartları geçerlidir."],
  };
}

function createClient(mock: ReturnType<typeof createFetchMock>) {
  return createApiClient({ baseUrl: "https://api.example.invalid", fetch: mock.fetch, readCsrfToken: () => "csrf-tok" });
}

describe("api-client rewards — başarı yolları", () => {
  it("listAdminRewards simId olmadan GET /admin/rewards çağırır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: [rewardWireBody()] } }]);
    const client = createClient(mock);

    const response = await client.rewards.listAdminRewards();
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/admin/rewards");
    expect(mock.calls[0]?.init.method).toBe("GET");
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({ simId: SIM_ID, month: MONTH, title: "Ayın Yıldızı" });
  });

  it("listAdminRewards simId ile sorgu parametresi ekler", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: [] } }]);
    const client = createClient(mock);

    await client.rewards.listAdminRewards(SIM_ID);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/admin/rewards?simId=${SIM_ID}`);
  });

  it("upsertAdminReward PUT ile doğru yol, gövde ve CSRF başlığını gönderir", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: rewardWireBody() } }]);
    const client = createClient(mock);

    const result = await client.rewards.upsertAdminReward(SIM_ID, MONTH, upsertRequestBody());

    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/admin/rewards/${SIM_ID}/${MONTH}`);
    expect(mock.calls[0]?.init.method).toBe("PUT");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(JSON.parse(mock.calls[0]?.init.body ?? "{}")).toMatchObject({ title: "Ayın Yıldızı", winnersCount: 3 });
    expect(result).toMatchObject({ simId: SIM_ID, month: MONTH, winners: [] });
  });

  it("deleteAdminReward DELETE ile doğru yolu ve CSRF başlığını gönderir; 204 döner", async () => {
    const mock = createFetchMock([{ status: 204, text: "" }]);
    const client = createClient(mock);

    await expect(client.rewards.deleteAdminReward(SIM_ID, MONTH)).resolves.toBeUndefined();
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/admin/rewards/${SIM_ID}/${MONTH}`);
    expect(mock.calls[0]?.init.method).toBe("DELETE");
    expect(mock.calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
  });

  it("finalizeAdminReward POST eder ve kazananlarla dönen ödülü döndürür", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: rewardWireBody({
            finalizedAt: "2026-09-01T00:00:00.000+03:00",
            winners: [{ month: MONTH, rank: 1, displayName: "AV", score: 92.5, isMe: false }],
          }),
        },
      },
    ]);
    const client = createClient(mock);

    const result = await client.rewards.finalizeAdminReward(SIM_ID, MONTH);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/admin/rewards/${SIM_ID}/${MONTH}/finalize`);
    expect(mock.calls[0]?.init.method).toBe("POST");
    expect(result?.winners).toHaveLength(1);
  });

  it("finalizeAdminReward null veri dönerse null döndürür", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: null } }]);
    const client = createClient(mock);

    await expect(client.rewards.finalizeAdminReward(SIM_ID, MONTH)).resolves.toBeNull();
  });

  it("getMyRewards GET /me/rewards çağırır ve sim bloklarını döner", async () => {
    const mock = createFetchMock([
      { status: 200, json: { data: { sims: [{ simId: SIM_ID, current: rewardOnlyBody(), lastMonthWinners: [] }] } } },
    ]);
    const client = createClient(mock);

    const response = await client.rewards.getMyRewards();
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/me/rewards");
    expect(response.data.sims).toHaveLength(1);
    expect(response.data.sims[0]?.simId).toBe(SIM_ID);
  });

  it("getMySimReward GET /me/rewards/:simId çağırır", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: { current: rewardOnlyBody(), winners: [] } } }]);
    const client = createClient(mock);

    const response = await client.rewards.getMySimReward(SIM_ID);
    expect(mock.calls[0]?.url).toBe(`https://api.example.invalid/me/rewards/${SIM_ID}`);
    expect(response.data.current).toMatchObject({ simId: SIM_ID });
  });
});

describe("api-client rewards — hata yolları", () => {
  it("sözleşme dışı yanıt ApiSchemaError fırlatır (fazladan alan)", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: [rewardWireBody({ extraField: "x" })] } }]);
    const client = createClient(mock);

    await expect(client.rewards.listAdminRewards()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it("sözleşme dışı yanıt ApiSchemaError fırlatır (eksik alan)", async () => {
    const mock = createFetchMock([{ status: 200, json: { data: { sims: [{ simId: SIM_ID }] } } }]);
    const client = createClient(mock);

    await expect(client.rewards.getMyRewards()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it("upsertAdminReward geçersiz gövdede istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(
      client.rewards.upsertAdminReward(SIM_ID, MONTH, { ...upsertRequestBody(), winnersCount: 0 }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
    expect(mock.calls).toHaveLength(0);
  });

  it("upsertAdminReward geçersiz ay biçiminde istek gönderilmeden ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([]);
    const client = createClient(mock);

    await expect(client.rewards.upsertAdminReward(SIM_ID, "2026-13", upsertRequestBody())).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
    expect(mock.calls).toHaveLength(0);
  });

  it("409 conflict (kesinleşmiş ödül) ApiError code=conflict olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 409, json: { error: { code: "conflict" } } }]);
    const client = createClient(mock);

    await expect(client.rewards.upsertAdminReward(SIM_ID, MONTH, upsertRequestBody())).rejects.toMatchObject({
      name: "ApiError",
      code: "conflict",
      status: 409,
    });
  });

  it("422 validation_failed (month_not_closed) ApiError olarak iletilir", async () => {
    const mock = createFetchMock([
      {
        status: 422,
        json: { error: { code: "validation_failed", details: { issues: [{ code: "month_not_closed", path: ["month"] }] } } },
      },
    ]);
    const client = createClient(mock);

    try {
      await client.rewards.finalizeAdminReward(SIM_ID, MONTH);
      expect.unreachable("422 bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("validation_failed");
      expect((error as ApiError).status).toBe(422);
      expect((error as ApiError).details).toMatchObject({ issues: [{ code: "month_not_closed" }] });
    }
  });

  it("403 forbidden ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 403, json: { error: { code: "forbidden" } } }]);
    const client = createClient(mock);

    await expect(client.rewards.listAdminRewards()).rejects.toMatchObject({ name: "ApiError", code: "forbidden", status: 403 });
  });

  it("404 not_found ApiError olarak iletilir", async () => {
    const mock = createFetchMock([{ status: 404, json: { error: { code: "not_found" } } }]);
    const client = createClient(mock);

    await expect(client.rewards.deleteAdminReward(SIM_ID, MONTH)).rejects.toMatchObject({
      name: "ApiError",
      code: "not_found",
      status: 404,
    });
  });
});

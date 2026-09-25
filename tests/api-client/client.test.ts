import { describe, expect, it } from "vitest";
import {
  ApiError,
  ApiSchemaError,
  createApiClient,
  createApiUsersSource,
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

describe("createApiClient", () => {
  it("isteklerde credentials=include taşır ve mutasyonlarda CSRF başlığını ekler", async () => {
    const mock = createFetchMock([{ status: 204, text: "" }]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid/",
      fetch: mock.fetch,
      readCsrfToken: () => "csrf-token-1",
    });

    await client.auth.logout();

    const call = mock.calls[0];
    expect(call?.url).toBe("https://api.example.invalid/auth/logout");
    expect(call?.init.credentials).toBe("include");
    expect(call?.init.headers).toMatchObject({
      accept: "application/json",
      "X-CSRF-Token": "csrf-token-1",
    });
  });

  it("hata zarfını ApiError'a çevirir (kod + detay korunur)", async () => {
    const mock = createFetchMock([
      {
        status: 409,
        json: {
          error: { code: "duplicate_mapping_key", details: { field: "username" } },
        },
      },
    ]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });

    await expect(
      client.admin.createUser({
        username: "yeni.kullanici",
        displayName: "Yeni Kullanıcı",
        authMethod: "sso",
        role: "kullanici",
        simAccess: [],
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "duplicate_mapping_key",
      status: 409,
      details: { field: "username" },
    });
  });

  it("başarılı ama sözleşmeye uymayan yanıtta ApiSchemaError fırlatır", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: {
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Örnek Öğrenci",
            roles: [],
            institution: { id: "00000000-0000-4000-8000-000000000010", name: "Örnek Kurum" },
            simAccess: ["pulse"],
          },
        },
      },
    ]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });

    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it("401 unauthorized hatasını oturum yok olarak işaretler", async () => {
    const mock = createFetchMock([{ status: 401, json: { error: { code: "unauthorized" } } }]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });

    try {
      await client.auth.me();
      expect.unreachable("401 hata bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(isSessionMissingError(error)).toBe(true);
    }
  });
});

describe("createApiUsersSource", () => {
  it("liste yanıtını shell sözleşmesine mapler ve sorguyu query string'e taşır", async () => {
    const mock = createFetchMock([
      {
        status: 200,
        json: {
          data: [
            {
              id: "00000000-0000-4000-8000-000000000011",
              displayName: "Ali Veli",
              username: "ali.veli",
              email: "ali.veli@example.invalid",
              roles: ["admin"],
              unitId: "00000000-0000-4000-8000-000000000020",
              unitName: "3. Sınıf",
              status: "active",
              authMethod: "sso",
              createdAt: "2026-09-24T09:00:00.000+03:00",
              lastLoginAt: null,
            },
          ],
          meta: { page: 2, pageSize: 10, total: 1 },
        },
      },
    ]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });
    const source = createApiUsersSource(client);

    const result = await source.list({ q: "ali", page: 2, pageSize: 10 });
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 1 });
    expect(result.data[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000011",
      displayName: "Ali Veli",
      role: "admin",
      status: "active",
    });
    expect(mock.calls[0]?.url).toContain("/admin/users?");
    expect(mock.calls[0]?.url).toContain("q=ali");
    expect(mock.calls[0]?.url).toContain("page=2");
    expect(mock.calls[0]?.url).toContain("pageSize=10");
  });

  it("GET ve PATCH /me/preferences liderlik görünürlüğünü taşır ve CSRF ekler", async () => {
    const mock = createFetchMock([
      { status: 200, json: { data: { leaderboardVisible: true } } },
      { status: 200, json: { data: { leaderboardVisible: false } } },
    ]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
      readCsrfToken: () => "csrf-token-1",
    });
    await expect(client.preferences.getPreferences()).resolves.toEqual({ data: { leaderboardVisible: true } });
    await expect(client.preferences.setPreferences({ leaderboardVisible: false })).resolves.toEqual({
      data: { leaderboardVisible: false },
    });
    expect(mock.calls[0]?.url).toBe("https://api.example.invalid/me/preferences");
    expect(mock.calls[0]?.init.method).toBe("GET");
    expect(mock.calls[1]?.init.method).toBe("PATCH");
    expect(mock.calls[1]?.init.headers).toMatchObject({ "X-CSRF-Token": "csrf-token-1" });
    expect(mock.calls[1]?.init.body).toBe(JSON.stringify({ leaderboardVisible: false }));
  });

  it("get() için 404 not_found durumunu null döndürür", async () => {
    const mock = createFetchMock([{ status: 404, json: { error: { code: "not_found" } } }]);
    const client = createApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: mock.fetch,
    });
    const source = createApiUsersSource(client);

    await expect(source.get("00000000-0000-4000-8000-000000000099")).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createApiClient, type ApiFetch, type ApiFetchInit, type ApiResponse } from "../../packages/api-client/src/index";

/**
 * Öğrenme tamamlama istemcisi (27 Eyl 2026): `/me/learn` okuma ve
 * `/me/sims/:simId/learn/complete` yazma; CSRF başlığı mutasyonla gider.
 */

interface Call {
  readonly url: string;
  readonly init: ApiFetchInit;
}

const SIMS = {
  ausculta: { complete: false, completedAt: null },
  opaca: { complete: false, completedAt: null },
  pulse: { complete: false, completedAt: null },
};

function createResponse(status: number, json: unknown): ApiResponse {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  };
}

function createClient(plans: readonly ApiResponse[]) {
  const queue = [...plans];
  const calls: Call[] = [];
  const fetch: ApiFetch = (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) throw new Error(`Planlanan yanıttan fazla çağrı: ${url}`);
    return Promise.resolve(next);
  };
  return { client: createApiClient({ baseUrl: "https://api.example.invalid", fetch, readCsrfToken: () => "csrf-tok" }), calls };
}

describe("api-client /me/learn", () => {
  it("durumu okur", async () => {
    const { client, calls } = createClient([createResponse(200, { data: { sims: SIMS } })]);
    await expect(client.learn.status()).resolves.toEqual({ data: { sims: SIMS } });
    expect(calls[0]?.url).toBe("https://api.example.invalid/me/learn");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("tamamlamayı CSRF başlığıyla yazar ve güncel durumu döner", async () => {
    const done = { ...SIMS, ausculta: { complete: true, completedAt: "2026-09-27T10:00:00.000+03:00" } };
    const { client, calls } = createClient([createResponse(200, { data: { sims: done } })]);
    await expect(client.learn.complete("ausculta", "ausculta.2026-09")).resolves.toEqual({ data: { sims: done } });
    expect(calls[0]?.url).toBe("https://api.example.invalid/me/sims/ausculta/learn/complete");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers?.["X-CSRF-Token"]).toBe("csrf-tok");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ contentVersion: "ausculta.2026-09" }));
  });

  it("geçersiz sürümü istek atmadan reddeder", async () => {
    const { client, calls } = createClient([]);
    await expect(client.learn.complete("ausculta", "AusCulta 2026")).rejects.toThrow(/sözleşmeye uymuyor/);
    expect(calls).toEqual([]);
  });
});

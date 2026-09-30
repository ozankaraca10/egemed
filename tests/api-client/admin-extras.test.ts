import { expect, it } from "vitest";
import { ApiSchemaError, createApiClient, type ApiFetch } from "../../packages/api-client/src/index";

function fetchQueue(responses: readonly unknown[]) {
  const calls: string[] = [];
  const queue = [...responses];
  const fetch: ApiFetch = async (url) => {
    calls.push(url);
    const body = queue.shift();
    return {
      status: 200,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetch, calls };
}

const sim = { accessUsers: 1, activeUsers30d: 1, attemptsThisMonth: { practice: 2, assessment: 1 }, learnCompleted: 1, openChallenges: 0, currentReward: null };
const overview = { data: { users: { total: 1, byStatus: { invited: 0, active: 1, suspended: 0 }, byRole: { admin: 1, kullanici: 0, ogretim_uyesi: 0, uzmanlik_ogrencisi: 0 } }, loginsLast7Days: 1, pendingImports: 0, sims: { pulse: sim, ausculta: sim, opaca: sim } } };

it("admin overview, health and user gamification methods use their endpoints and validate responses", async () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const mock = fetchQueue([
    overview,
    { status: "ok", db: "ok", lrs: "not_configured", version: "0.0.0" },
    { data: { sims: [{ simId: "pulse", xp: 50, level: 2, streak: { current: 1, best: 2, lastDate: "2026-09-30" } }] } },
  ]);
  const client = createApiClient({ baseUrl: "https://api.example.invalid", fetch: mock.fetch });
  expect((await client.admin.getOverview()).data.sims.pulse.attemptsThisMonth.practice).toBe(2);
  expect((await client.admin.getHealth()).lrs).toBe("not_configured");
  expect((await client.admin.getUserGamification(userId)).data.sims[0]?.xp).toBe(50);
  expect(mock.calls).toEqual([
    "https://api.example.invalid/admin/overview",
    "https://api.example.invalid/admin/health",
    `https://api.example.invalid/admin/users/${userId}/gamification`,
  ]);
});

it("rejects malformed admin responses and gamification ids", async () => {
  const mock = fetchQueue([{ data: {} }]);
  const client = createApiClient({ baseUrl: "https://api.example.invalid", fetch: mock.fetch });
  await expect(client.admin.getOverview()).rejects.toBeInstanceOf(ApiSchemaError);
  await expect(client.admin.getUserGamification("bad-id")).rejects.toBeInstanceOf(ApiSchemaError);
});

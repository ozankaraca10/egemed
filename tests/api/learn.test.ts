import { describe, expect, it } from "vitest";
import { learnStatusSchema } from "../../packages/contracts/src/index";
import { ALI, DEFAULT_USERS, createAdminHarness, login, user, type AdminHarness, type Login } from "./admin-harness";

// Öğrenme tamamlama kaydı (27 Eyl 2026): GET/POST uçları, sim erişimi ve
// meydan okuma kilidi (`learn_required`). Kilidin tespiti sim paketlerindedir;
// bu testler yalnız sunucu kaydını ve düello kapısını ölçer.

const ZEYNEP = user({ id: "00000000-0000-4000-8000-000000000041", username: "zeynep.learn", displayName: "Zeynep Öğren", authMethod: "dev", simAccess: ["ausculta"] });

function harness(): AdminHarness {
  const users = [...DEFAULT_USERS.map((entry) => (entry.id === ALI.id ? { ...ALI, simAccess: ["ausculta"] as const } : entry)), ZEYNEP];
  return createAdminHarness({ users });
}

async function call(h: AdminHarness, who: Login, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...who.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function status(h: AdminHarness, who: Login) {
  const response = await call(h, who, "GET", "/me/learn");
  expect(response.status).toBe(200);
  return learnStatusSchema.parse(await response.json()).data.sims;
}

async function complete(h: AdminHarness, who: Login, simId: string, contentVersion = "ausculta.2026-09") {
  const response = await call(h, who, "POST", `/me/sims/${simId}/learn/complete`, { contentVersion });
  expect(response.status).toBe(200);
  return learnStatusSchema.parse(await response.json()).data.sims;
}

function issueCode(payload: unknown): string | undefined {
  const details = (payload as { error?: { details?: { issues?: readonly { code?: string }[] } } }).error?.details;
  return details?.issues?.[0]?.code;
}

describe("öğrenme tamamlama kaydı", () => {
  it("oturumsuz istek 401; oturumlu kullanıcı üç simin boş durumunu görür", async () => {
    const h = harness();
    expect((await h.app.request("/me/learn")).status).toBe(401);

    const ali = await login(h, "ali.veli");
    const sims = await status(h, ali);
    expect(sims).toEqual({
      ausculta: { complete: false, completedAt: null },
      opaca: { complete: false, completedAt: null },
      pulse: { complete: false, completedAt: null },
    });
  });

  it("tamamlama kaydı yazılır; ilk an korunur, içerik sürümü güncellenir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const first = await complete(h, ali, "ausculta", "ausculta.2026-09");
    expect(first.ausculta.complete).toBe(true);
    expect(first.ausculta.completedAt).not.toBeNull();
    expect((await status(h, ali)).ausculta).toEqual(first.ausculta);

    // Yeniden tamamlama: completedAt değişmez, sürüm güncellenir.
    h.advance(60_000);
    const again = await complete(h, ali, "ausculta", "ausculta.2026-10");
    expect(again.ausculta.completedAt).toBe(first.ausculta.completedAt);
    expect(h.learn.records.get(`${ALI.id}:ausculta`)?.contentVersion).toBe("ausculta.2026-10");
    // Diğer simler tamamlanmamış kalır.
    expect(again.pulse.complete).toBe(false);
  });

  it("sim erişimi olmayan kullanıcı yazamaz; geçersiz sim 404, geçersiz sürüm 400", async () => {
    const h = harness();
    const zeynep = await login(h, "zeynep.learn");
    const denied = await call(h, zeynep, "POST", "/me/sims/pulse/learn/complete", { contentVersion: "pulse.1" });
    expect(denied.status).toBe(403);
    expect((await call(h, zeynep, "POST", "/me/sims/kalp/learn/complete", { contentVersion: "x.1" })).status).toBe(404);
    const invalid = await call(h, zeynep, "POST", "/me/sims/ausculta/learn/complete", { contentVersion: "Ausculta 2026" });
    expect(invalid.status).toBe(400);
    // Okuma sim erişiminden bağımsız üç simi döner; kayıt yazılmadı.
    expect((await status(h, zeynep)).pulse.complete).toBe(false);
  });

  it("meydan okuma kilidi: tamamlama yokken oluşturma ve katılma 403 learn_required", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const zeynep = await login(h, "zeynep.learn");

    const create = await call(h, ali, "POST", "/me/challenges", { simId: "ausculta" });
    expect(create.status).toBe(403);
    expect(issueCode(await create.json())).toBe("learn_required");

    await complete(h, ali, "ausculta");
    const created = await call(h, ali, "POST", "/me/challenges", { simId: "ausculta" });
    expect(created.status).toBe(201);
    const challengeId = ((await created.json()) as { data: { challengeId: string; code: string } }).data;
    expect(challengeId.challengeId).toMatch(/[0-9a-f-]{36}/);

    const join = await call(h, zeynep, "POST", "/me/challenges/join", { code: challengeId.code });
    expect(join.status).toBe(403);
    expect(issueCode(await join.json())).toBe("learn_required");

    await complete(h, zeynep, "ausculta");
    const joined = await call(h, zeynep, "POST", "/me/challenges/join", { code: challengeId.code });
    expect(joined.status).toBe(200);
  });
});

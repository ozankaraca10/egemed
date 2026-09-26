import { describe, expect, it } from "vitest";
import {
  adminRewardListResponseSchema,
  meRewardResponseSchema,
  meRewardsOverviewResponseSchema,
} from "../../packages/contracts/src/index";
import { monthEndTr } from "../../apps/api/src/rewards";
import { ALI_ID, FIXED_NOW, INSTITUTION_ID, UNIT_CODE, createAdminHarness, login, type AdminHarness } from "./admin-harness";

// Aylık ödüller (26 Eyl 2026): admin sim × ay ödülünü yönetir, ay kapanınca
// kazananları kesinleştirir; öğrenci kendi siminin ödülünü ve kazananları okur.
// FIXED_NOW = 2023-11-15 01:13 (İstanbul) → içinde bulunulan ay 2023-11.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const REWARD = {
  title: "Girişimsel radyolojide gözlemci katılım",
  description: "Ayın ilk 3'ü bir girişimsel işlemi gözlemler.",
  sponsor: "Radyoloji AD",
  winnersCount: 3,
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 1, requirePublicName: true },
  terms: ["Ay içinde en az 1 değerlendirme."],
};

function harness(): AdminHarness {
  return createAdminHarness({
    gamification: {
      profiles: [
        {
          userId: ALI_ID,
          institutionId: INSTITUTION_ID,
          simId: "pulse" as const,
          xp: 300,
          level: 2,
          displayName: "Ali Veli",
          unitCode: UNIT_CODE,
          updatedAt: FIXED_NOW - HOUR,
        },
      ],
      badges: [],
      attempts: [88, 90, 86].map((score, index) => ({
        id: `00000000-0000-4000-8000-00000000007${index}`,
        userId: ALI_ID,
        simId: "pulse" as const,
        attemptNo: index + 1,
        startedAt: FIXED_NOW - (index + 2) * HOUR,
        finishedAt: FIXED_NOW - (index + 1) * HOUR,
        score,
        maxScore: 100,
        passed: true,
        xp: 120,
        summary: { score },
      })),
    },
  });
}

async function put(h: AdminHarness, headers: Record<string, string>, path: string, body: unknown) {
  return h.app.request(path, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("admin aylık ödül yönetimi", () => {
  it("yalnız admin yönetir; öğrenci /admin/rewards için 403 alır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const response = await h.app.request("/admin/rewards", { headers: ali.headers });
    expect(response.status).toBe(403);
  });

  it("ödül oluşturur, günceller ve listeler; katı gövde reddedilir", async () => {
    const h = harness();
    const admin = await login(h, "ornek.yonetici");
    const created = await put(h, admin.headers, "/admin/rewards/pulse/2023-11", REWARD);
    expect(created.status).toBe(200);
    const updated = await put(h, admin.headers, "/admin/rewards/pulse/2023-11", { ...REWARD, winnersCount: 5 });
    expect(updated.status).toBe(200);
    expect((await put(h, admin.headers, "/admin/rewards/pulse/2023-11", { ...REWARD, winnersCount: 0 })).status).toBe(400);
    expect((await put(h, admin.headers, "/admin/rewards/pulse/2023-11", { ...REWARD, extra: 1 })).status).toBe(400);
    expect((await put(h, admin.headers, "/admin/rewards/pulse/2023-13", REWARD)).status).toBe(404);
    expect((await put(h, admin.headers, "/admin/rewards/kalp/2023-11", REWARD)).status).toBe(404);
    const list = await h.app.request("/admin/rewards?simId=pulse", { headers: admin.headers });
    const body = adminRewardListResponseSchema.parse(await list.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ simId: "pulse", month: "2023-11", winnersCount: 5, finalizedAt: null });
  });

  it("açık ay kesinleştirilemez; kapanan ay sıralamadan kazanan yazar ve kilitlenir", async () => {
    const h = harness();
    const admin = await login(h, "ornek.yonetici");
    await put(h, admin.headers, "/admin/rewards/pulse/2023-11", REWARD);
    const early = await h.app.request("/admin/rewards/pulse/2023-11/finalize", { method: "POST", headers: admin.headers });
    expect(early.status).toBe(422);
    expect(await early.json()).toMatchObject({ error: { details: { issues: [{ code: "month_not_closed" }] } } });

    h.advance(20 * DAY); // 2023-12-05
    const fresh = await login(h, "ornek.yonetici");
    const finalized = await h.app.request("/admin/rewards/pulse/2023-11/finalize", { method: "POST", headers: fresh.headers });
    expect(finalized.status).toBe(200);
    const saved = (await finalized.json()) as { data: { finalizedAt: string | null; winners: { rank: number; score: number }[] } };
    expect(saved.data.finalizedAt).not.toBeNull();
    expect(saved.data.winners[0]).toMatchObject({ rank: 1, score: 88 });

    expect((await h.app.request("/admin/rewards/pulse/2023-11/finalize", { method: "POST", headers: fresh.headers })).status).toBe(409);
    expect((await put(h, fresh.headers, "/admin/rewards/pulse/2023-11", REWARD)).status).toBe(409);
    expect((await h.app.request("/admin/rewards/pulse/2023-11", { method: "DELETE", headers: fresh.headers })).status).toBe(409);

    const ali = await login(h, "ali.veli");
    const overview = meRewardsOverviewResponseSchema.parse(await (await h.app.request("/me/rewards", { headers: ali.headers })).json());
    const pulse = overview.data.sims.find((sim) => sim.simId === "pulse");
    expect(pulse?.lastMonthWinners[0]).toMatchObject({ month: "2023-11", rank: 1 });
    // Aralık için ayrı ödül yoksa Kasım'ın koşulları aynen geçerlidir, kesinleşmemiş sayılır.
    expect(pulse?.current).toMatchObject({ month: "2023-12", title: REWARD.title, finalizedAt: null });
  });

  it("öğrenci yalnız erişimi olan simin ödülünü okur; silinen ödül görünmez", async () => {
    const h = harness();
    const admin = await login(h, "ornek.yonetici");
    await put(h, admin.headers, "/admin/rewards/opaca/2023-11", REWARD);
    const ali = await login(h, "ali.veli");
    expect((await h.app.request("/me/rewards/opaca", { headers: ali.headers })).status).toBe(403);
    const pulse = meRewardResponseSchema.parse(await (await h.app.request("/me/rewards/pulse", { headers: ali.headers })).json());
    expect(pulse.data.current).toBeNull();
    expect((await h.app.request("/admin/rewards/opaca/2023-11", { method: "DELETE", headers: admin.headers })).status).toBe(204);
    expect((await h.app.request("/admin/rewards/opaca/2023-11", { method: "DELETE", headers: admin.headers })).status).toBe(404);
  });

  it("ayın son milisaniyesi İstanbul saatine göre hesaplanır", () => {
    expect(new Date(monthEndTr("2023-11") + 1).toISOString()).toBe("2023-11-30T21:00:00.000Z");
    expect(new Date(monthEndTr("2023-12") + 1).toISOString()).toBe("2023-12-31T21:00:00.000Z");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../packages/api-client/src/index";
import type { ChallengeBody, LearnStatus, SimId } from "../../packages/contracts/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { ChallengeWorkspace, ChallengesPage, challengesForSim } from "../../apps/shell/src/challenges/ChallengesPage";
import { challengeErrorKey, type ChallengeSource } from "../../apps/shell/src/challenges/challengeSource";
import { createLearnPort, createUnlockedLearnPort, type LearnSource } from "../../apps/shell/src/learn/learnSource";
import { DEV_LEARN_KEY_PREFIX, createDevLocalLearnPort } from "../../apps/shell/src/sims/devLocalLearn";

/**
 * Sim içi Meydan Okuma merkezi (T281a) ve öğrenme kilidi (27 Eyl 2026) kabuk
 * yüzeyi: sim seçici yoktur, liste sabit sime süzülür; tamamlanmamış simde
 * oluşturma ve katılma pasiftir. `learn_required` hatası yeni ileti anahtarına
 * çözülür. Öğrenme portu tamamlamayı kaynağa yazar ve yerel durumu günceller.
 */

const COMPLETE_AT = "2026-09-27T10:00:00.000+03:00";

const INCOMPLETE: LearnStatus = {
  ausculta: { complete: false, completedAt: null },
  opaca: { complete: false, completedAt: null },
  pulse: { complete: false, completedAt: null },
};

const SOURCE: ChallengeSource = {
  create: () => Promise.reject(new Error("x")),
  join: () => Promise.reject(new Error("x")),
  list: () => Promise.resolve([]),
  get: () => Promise.reject(new Error("x")),
};

/** Tam şekilli düello gövdesi; yalnız sim kimliği değişir. */
function challenge(simId: SimId, challengeId: string): ChallengeBody {
  return {
    caseCount: 10,
    challengeId,
    code: "482913",
    expiresAt: "2026-09-30T12:00:00.000+03:00",
    mySessionId: null,
    participants: [],
    perCaseLimitMs: 120_000,
    simId,
    status: "open",
    totalLimitMs: 480_000,
    winner: null,
  };
}

describe("sim içi meydan okuma merkezi (T281a)", () => {
  it("liste yalnız sabit simin düellolarını gösterir", () => {
    const list = [
      challenge("ausculta", "11111111-1111-4111-8111-111111111111"),
      challenge("opaca", "22222222-2222-4222-8222-222222222222"),
      challenge("ausculta", "33333333-3333-4333-8333-333333333333"),
    ];
    expect(challengesForSim("opaca", list).map((item) => item.challengeId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(challengesForSim("pulse", list)).toEqual([]);
  });

  it("oluşturma kartında sim seçici yoktur; geri bağlantısı sim mod seçimine gider, başlık h2'dir", () => {
    const workspace = renderToStaticMarkup(createElement(ChallengeWorkspace, { simId: "opaca", source: SOURCE }));
    expect(workspace).not.toContain(t("challenges.create.sim"));
    expect(workspace).not.toContain('role="combobox"');

    const page = renderToStaticMarkup(createElement(ChallengesPage, { headingLevel: 2, simId: "opaca" }));
    expect(page).toContain('href="#/sims/opaca/modlar"');
    expect(page).toContain(`<h2 class="eg-shell-page__title">${t("challenges.title")}</h2>`);
    expect(page).not.toMatch(/<h1\b/);
  });
});

describe("meydan okuma öğrenme kilidi", () => {
  it("tamamlanmamış simde 'Kod oluştur' ve 'Katıl' pasiftir, açıklama metni çizilir", () => {
    const html = renderToStaticMarkup(createElement(ChallengeWorkspace, { learn: INCOMPLETE, simId: "ausculta", source: SOURCE }));
    expect(html).toContain(t("challenges.create.learnHint"));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.join.action")}</span>`));
  });

  it("tamamlanmış simde oluşturma ve katılma düğmeleri açıktır, ipucu çizilmez", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeWorkspace, {
        learn: { ...INCOMPLETE, ausculta: { complete: true, completedAt: COMPLETE_AT } },
        simId: "ausculta",
        source: SOURCE,
      }),
    );
    expect(html).not.toContain(t("challenges.create.learnHint"));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.join.action")}</span>`));
  });

  it("durum henüz okunmadıysa düğmeler açık kalır; kapı sunucudadır", () => {
    const html = renderToStaticMarkup(createElement(ChallengeWorkspace, { learn: null, simId: "ausculta", source: SOURCE }));
    expect(html).not.toContain(t("challenges.create.learnHint"));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.join.action")}</span>`));
  });

  it("learn_required hatası öğrenme kilidi iletisine çevrilir", () => {
    expect(challengeErrorKey(new ApiError("forbidden", 403, { issues: [{ code: "learn_required" }] }))).toBe(
      "challenges.error.learnRequired",
    );
  });
});

describe("öğrenme portu", () => {
  it("kaynaktan başlangıç durumunu okur, tamamlamayı yazar ve yerel değeri günceller", async () => {
    const calls: string[] = [];
    const source: LearnSource = {
      status: () => Promise.resolve(INCOMPLETE),
      complete: (_simId, contentVersion) => {
        calls.push(contentVersion);
        return Promise.resolve({ ...INCOMPLETE, ausculta: { complete: true, completedAt: COMPLETE_AT } });
      },
    };
    const port = await createLearnPort(source, "ausculta");
    expect(port.complete).toBe(false);
    await port.markComplete("ausculta.2026-09");
    expect(calls).toEqual(["ausculta.2026-09"]);
    expect(port.complete).toBe(true);
  });

  it("ayrıcalıklı rollerde (admin/öğretim üyesi/uzmanlık öğrencisi) port tamamlanmış açılır ve kaynak çağrılmaz (T219)", async () => {
    const port = createUnlockedLearnPort();
    expect(port.complete).toBe(true);
    await expect(port.markComplete("ausculta.2026-09")).resolves.toBeUndefined();
    expect(port.complete).toBe(true);
  });

  it("DEV yerel portu sekme deposuna yazar (egemed.learn.<simId>)", async () => {
    const store = new Map<string, string>();
    const port = createDevLocalLearnPort("opaca", {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });
    expect(port.complete).toBe(false);
    await port.markComplete("opaca.2026-09");
    expect(port.complete).toBe(true);
    expect(store.get(`${DEV_LEARN_KEY_PREFIX}opaca`)).toBe("1");
  });
});

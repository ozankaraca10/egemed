import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../packages/api-client/src/index";
import type { LearnStatus } from "../../packages/contracts/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { ChallengeWorkspace, challengeSimOptions } from "../../apps/shell/src/challenges/ChallengesPage";
import { challengeErrorKey, type ChallengeSource } from "../../apps/shell/src/challenges/challengeSource";
import { createLearnPort, type LearnSource } from "../../apps/shell/src/learn/learnSource";
import { DEV_LEARN_KEY_PREFIX, createDevLocalLearnPort } from "../../apps/shell/src/sims/devLocalLearn";

/**
 * Öğrenme kilidi (27 Eyl 2026) kabuk yüzeyi: tamamlanmamış sim seçilemez,
 * düello oluşturulamaz; `learn_required` hatası yeni ileti anahtarına çözülür.
 * Öğrenme portu tamamlamayı kaynağa yazar ve yerel durumu günceller.
 */

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

describe("meydan okuma öğrenme kilidi", () => {
  it("tamamlanmamış sim seçenekte pasif ve öğrenme ipucu etiketiyle çizilir", () => {
    const options = challengeSimOptions(INCOMPLETE);
    expect(options.find((option) => option.value === "ausculta")).toEqual({
      value: "ausculta",
      label: `${t("sims.ausculta.name")} · ${t("challenges.create.learnHint")}`,
      disabled: true,
    });
    // Düello desteklemeyen simler "yakında" etiketiyle pasif kalır.
    expect(options.find((option) => option.value === "opaca")).toEqual({
      value: "opaca",
      label: `${t("sims.opaca.name")} · ${t("challenges.create.soon")}`,
      disabled: true,
    });
    // Durum henüz okunmadıysa seçenek açık kalır; kapıyı sunucu uygular.
    expect(challengeSimOptions(null).find((option) => option.value === "ausculta")?.disabled).toBe(false);
  });

  it("öğrenmesi tamamlanan sim seçilebilir olur", () => {
    const options = challengeSimOptions({ ...INCOMPLETE, ausculta: { complete: true, completedAt: "2026-09-27T10:00:00.000+03:00" } });
    expect(options.find((option) => option.value === "ausculta")).toEqual({
      value: "ausculta",
      label: t("sims.ausculta.name"),
      disabled: false,
    });
  });

  it("tamamlanmamış simde 'Kod oluştur' pasiftir ve açıklama metni çizilir", () => {
    const html = renderToStaticMarkup(createElement(ChallengeWorkspace, { learn: INCOMPLETE, source: SOURCE }));
    expect(html).toContain(t("challenges.create.learnHint"));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
  });

  it("tamamlanmış simde oluşturma düğmesi açıktır ve ipucu çizilmez", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeWorkspace, {
        learn: { ...INCOMPLETE, ausculta: { complete: true, completedAt: "2026-09-27T10:00:00.000+03:00" } },
        source: SOURCE,
      }),
    );
    expect(html).not.toContain(t("challenges.create.learnHint"));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
  });

  it("durum henüz okunmadıysa düğme açık kalır; kapı sunucudadır", () => {
    const html = renderToStaticMarkup(createElement(ChallengeWorkspace, { learn: null, source: SOURCE }));
    expect(html).not.toContain(t("challenges.create.learnHint"));
    expect(html).not.toMatch(new RegExp(`<button[^>]*disabled[^>]*>\\s*<span class="eg-btn__label">${t("challenges.create.action")}</span>`));
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
        return Promise.resolve({ ...INCOMPLETE, ausculta: { complete: true, completedAt: "2026-09-27T10:00:00.000+03:00" } });
      },
    };
    const port = await createLearnPort(source, "ausculta");
    expect(port.complete).toBe(false);
    await port.markComplete("ausculta.2026-09");
    expect(calls).toEqual(["ausculta.2026-09"]);
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

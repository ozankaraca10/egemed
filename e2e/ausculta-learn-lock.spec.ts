import { expect, test } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";
import { unlockAuscultaLearn } from "./sim-flows";

/**
 * T209 — Ausculta öğrenme kilidi (depo sahibi kararı, 27 Eyl 2026): öğrenme
 * kütüphanesindeki her ses (T307: konu başına 60 sn çalarak) dinlenmeden uygulama/değerlendirme KİLİTLİDİR.
 * Bu spec kilidin kullanıcıya görünen yüzünü doğrular: pasif kart + ilerleme
 * metni, öğrenme ekranı ilerlemesi ve düello bağlamının öğrenmeye düşmesi.
 */

test.describe("Ausculta öğrenme kilidi", () => {
  test("kilitliyken uygulama/değerlendirme kartları pasif ve ilerleme metni görünür", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/ausculta");
    const root = page.locator(".eg-sim-ausculta").first();

    const practice = root.locator(".mode-card.practice");
    await expect(practice).toHaveClass(/learn-locked/);
    await expect(practice.locator("button.eg-gami-mode-cta")).toBeDisabled();
    await expect(practice.getByText("Önce öğrenme modunu tamamlayın: 0/24 ses dinlendi.")).toBeVisible();

    const assessment = root.locator(".mode-card.assessment");
    await expect(assessment).toHaveClass(/learn-locked/);
    await expect(assessment.locator("button.eg-gami-mode-cta")).toBeDisabled();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta kilitli mod seçimi");

    // Öğrenme her zaman açıktır; ilerleme satırı ve kilitli odaklı uygulama düğmesi.
    await root.locator(".mode-card.learn button.eg-gami-mode-cta").click();
    await expect(root.getByText("Öğrenme: 0/24 ses dinlendi")).toBeVisible();
    await expect(root.getByRole("button", { name: /uygulama yap/ })).toBeDisabled();
    await expect(root.getByText("Önce öğrenme modunu tamamlayın: 0/24 ses dinlendi.").last()).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme kilidi");

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("öğrenme tamamlanınca mod kartları açılır", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await unlockAuscultaLearn(page);
    await openRoute(page, "#/sims/ausculta");
    const root = page.locator(".eg-sim-ausculta").first();

    await expect(root.locator(".mode-card.practice")).toHaveAttribute("data-learn-locked", "false");
    await expect(root.locator(".mode-card.practice button.eg-gami-mode-cta")).toBeEnabled();
    await expect(root.locator(".mode-card.assessment button.eg-gami-mode-cta")).toBeEnabled();
    await expect(root.getByText("Vakaları çöz")).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta acik mod secimi");

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("düello bağlamı öğrenme kilitliyken öğrenme ekranına düşer ve bilgi notu gösterir", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/sims/ausculta/duello/11111111-1111-4111-8111-111111111111", { waitUntil: "networkidle" });
    const root = page.locator(".eg-sim-ausculta").first();
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root.locator(".lib-col .lib-item").first()).toBeVisible();
    await expect(
      root.getByText("Meydan okuma için önce öğrenme modunu tamamlayın: 0/24 ses dinlendi."),
    ).toBeVisible();
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

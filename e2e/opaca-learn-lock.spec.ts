import { expect, test, type Locator } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";
import { unlockOpacaLearn } from "./sim-flows";

/**
 * T218 — Opaca öğrenme kilidi (depo sahibi kararı, 27 Eyl 2026): öğrenme
 * kütüphanesindeki her konu en az bir kez açılmadan uygulama/değerlendirme
 * KİLİTLİDİR. Bu spec kilidin kullanıcıya görünen yüzünü doğrular: pasif kart +
 * ilerleme metni, öğrenme ekranı ilerlemesi, görüntü yüklenince "açıldı" kaydı
 * ve düello bağlamının öğrenmeye düşmesi.
 */

/** Öğrenme ekranında "Bu konuda uygulama yap" eylemi olan ilk konuyu açar. */
async function openTopicPracticeButton(root: Locator): Promise<Locator> {
  const items = root.locator(".lib-item");
  const count = await items.count();
  for (let index = 0; index < count; index += 1) {
    await items.nth(index).click();
    await root.locator(".tabbar.info-tabs button").nth(2).click();
    const startButton = root.getByRole("button", { name: /uygulama yap/ });
    if ((await startButton.count()) > 0) return startButton.first();
  }
  throw new Error("Uygulama başlatan konu bulunamadı");
}

test.describe("Opaca öğrenme kilidi", () => {
  test("kilitliyken uygulama/değerlendirme kartları pasif ve ilerleme metni görünür", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();

    const practice = root.locator(".mode-card.practice");
    await expect(practice).toHaveClass(/learn-locked/);
    await expect(practice.locator("button.btn")).toBeDisabled();
    await expect(practice.getByText("Önce öğrenme modunu tamamlayın: 0/33 konu açıldı.")).toBeVisible();

    const assessment = root.locator(".mode-card.assessment");
    await expect(assessment).toHaveClass(/learn-locked/);
    await expect(assessment.locator("button.btn")).toBeDisabled();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca kilitli mod seçimi");

    // Öğrenme her zaman açıktır; ilerleme satırı ve kilitli odaklı uygulama düğmesi.
    await root.locator(".mode-card.learn button.btn").click();
    await expect(root.getByText("Öğrenme: 0/33 konu açıldı")).toBeVisible();
    const startButton = await openTopicPracticeButton(root);
    await expect(startButton).toBeDisabled();
    await expect(root.getByText("Önce öğrenme modunu tamamlayın: 0/33 konu açıldı.").last()).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca ogrenme kilidi");

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("kütüphane konusunun görüntüsü yüklenince konu açıldı sayılır ve ilerleme artar", async ({ page }) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await root.locator(".mode-card.learn button.btn").click();

    // Gerçek dosyası olan BT konusu seçilir; görüntü yüklenince öğe "açıldı" işareti alır
    // (yalnız seçmek yetmez, E2E'de XR görüntüleri git-dışıdır; BT dosyaları depodadır).
    await root.locator(".lib-item", { hasText: "Aksiyel anatomi" }).click();
    await expect(root.getByText("Öğrenme: 1/33 konu açıldı")).toBeVisible();
    await expect(root.locator('.lib-item .lib-done[aria-label="açıldı"]')).toHaveCount(1);
    await expect(root.locator(".lib-group", { hasText: "Toraks BT" }).locator(".g-count")).toHaveText("1/2");

    // Yalnız seçmek yetmez: ilk görüntü dosyası depoda olmayan (XR) konu seçilince
    // görüntü yüklenemez, kayıt büyümez ve işaret çizilmez.
    await root.locator(".lib-item", { hasText: "Pnömotoraks" }).click();
    await expect(root.locator(".film-empty", { hasText: "Görüntü dosyası yüklenemedi" })).toBeVisible();
    await expect(root.getByText("Öğrenme: 1/33 konu açıldı")).toBeVisible();
    await expect(root.locator('.lib-item .lib-done[aria-label="açıldı"]')).toHaveCount(1);
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("öğrenme tamamlanınca mod kartları açılır", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await unlockOpacaLearn(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();

    await expect(root.locator(".mode-card.practice")).toHaveAttribute("data-learn-locked", "false");
    await expect(root.locator(".mode-card.practice button.btn")).toBeEnabled();
    await expect(root.locator(".mode-card.assessment button.btn")).toBeEnabled();
    await expect(root.getByText("Vakaları çöz")).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca acik mod secimi");

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("düello bağlamı öğrenme kilitliyken öğrenme ekranına düşer ve bilgi notu gösterir", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/sims/opaca/duello/11111111-1111-4111-8111-111111111111", { waitUntil: "networkidle" });
    const root = page.locator(".eg-sim-opaca").first();
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root.locator(".lib-col .lib-item").first()).toBeVisible();
    await expect(
      root.getByText("Meydan okuma için önce öğrenme modunu tamamlayın: 0/33 konu açıldı."),
    ).toBeVisible();
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

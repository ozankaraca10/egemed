import { expect, test } from "@playwright/test";
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

test.describe("Opaca öğrenme kilidi", () => {
  // Ortamdan bağımsızlık: XR çalışma zamanı görüntüleri git-dışıdır ve bazı makinelerde
  // bulunur. Testler her zaman "XR dosyası yok" koşulunda koşar (Vite dev sunucusunun eksik dosyada döndürdüğü gibi HTML yanıt); depodaki BT
  // görüntüleri etkilenmez. Aksi hâlde ilk konu kendiliğinden açılıp sayaç 1/30 olur.
  test.beforeEach(async ({ page }) => {
    await page.route("**/assets/xray/runtime/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }));
  });

  test("kilitliyken uygulama/değerlendirme kartları pasif ve ilerleme metni görünür", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();

    const practice = root.locator(".mode-card.practice");
    await expect(practice).toHaveClass(/learn-locked/);
    await expect(practice.locator("button.eg-gami-mode-cta")).toBeDisabled();
    await expect(practice.getByText("Önce öğrenme modunu tamamlayın: 0/30 konu incelendi.")).toBeVisible();

    const assessment = root.locator(".mode-card.assessment");
    await expect(assessment).toHaveClass(/learn-locked/);
    await expect(assessment.locator("button.eg-gami-mode-cta")).toBeDisabled();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca kilitli mod seçimi");

    // Öğrenme her zaman açıktır; ray başlığı ilerlemeyi gösterir (T318: konu uygulaması düğmesi yok).
    await root.locator(".mode-card.learn button.eg-gami-mode-cta").click();
    await expect(root.getByRole("status", { name: "Öğrenme: 0/30 konu incelendi" })).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca ogrenme kilidi");

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("T320: konu, her filmi 15 sn incelenince tamamlanır; yüklenmeyen film sayılmaz", async ({ page }) => {
    const errors = trackErrors(page);
    // Sayaç sayfa saatine bağlıdır; sahte saatle süre ileri sarılır (gerçek bekleme yok).
    await page.clock.install();
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await root.locator(".mode-card.learn button.eg-gami-mode-cta").click();

    // Gerçek dosyası olan BT konusu (BT dosyaları depodadır; XR görüntüleri git-dışıdır).
    await root.locator(".lib-item", { hasText: "Aksiyel anatomi" }).click();
    const films = root.locator(".ex-btn");
    const count = await films.count();
    expect(count).toBeGreaterThan(1);

    // Eşiğin altında konu tamamlanmaz.
    await expect(root.locator(".film-stage img.is-loaded").first()).toBeVisible();
    await page.clock.runFor(6_000);
    await expect(films.first()).toContainText(/[56]\/15 sn/);
    await expect(root.getByRole("status", { name: "Öğrenme: 0/30 konu incelendi" })).toBeVisible();

    // Dosyası depoda olan filmler (BT) 15 sn sonra incelenmiş sayılır; Commons kesiti
    // git-dışı çalışma zamanı klasöründedir: yüklenemez, süre kazanmaz, konu tamamlanmaz.
    let loadedFilms = 0;
    for (let index = 0; index < count; index += 1) {
      await films.nth(index).click();
      const loaded = root.locator(".film-stage img.is-loaded").first();
      const failed = root.locator(".film-empty", { hasText: "Görüntü dosyası yüklenemedi" });
      await expect(loaded.or(failed)).toBeVisible();
      await page.clock.runFor(16_000);
      if ((await failed.count()) > 0) {
        await expect(films.nth(index)).toContainText("0/15 sn");
      } else {
        loadedFilms += 1;
        await expect(films.nth(index)).toContainText("✓ incelendi");
      }
    }
    expect(loadedFilms).toBeGreaterThan(0);
    const expected = loadedFilms === count ? 1 : 0;
    await expect(root.getByRole("status", { name: `Öğrenme: ${expected}/30 konu incelendi` })).toBeVisible();
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("öğrenme tamamlanınca mod kartları açılır", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await unlockOpacaLearn(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();

    await expect(root.locator(".mode-card.practice")).toHaveAttribute("data-learn-locked", "false");
    await expect(root.locator(".mode-card.practice button.eg-gami-mode-cta")).toBeEnabled();
    await expect(root.locator(".mode-card.assessment button.eg-gami-mode-cta")).toBeEnabled();
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
      root.getByText("Meydan okuma için önce öğrenme modunu tamamlayın: 0/30 konu incelendi."),
    ).toBeVisible();
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

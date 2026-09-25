import { expect, test, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

const NAV = "nav";

/** Simülatörler sayfasındaki kart bağlantısıyla paketin gerçek modül köküne geçer. */
/** Pulse kaynak runtime'ı gölge DOM kökünde çalışır (PULSE-00). */
const PULSE_ROOT = ".egemed-pulse-runtime";
const SIM_ROOTS = { ausculta: ".eg-sim-ausculta", pulse: PULSE_ROOT } as const;

async function openSimCard(page: Page, simId: "ausculta" | "pulse"): Promise<void> {
  await page.locator(`a[href="#/sims/${simId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/sims/${simId}$`));
  await expect(page.locator(SIM_ROOTS[simId]).first()).toBeVisible();
}

async function backToSimulators(page: Page): Promise<void> {
  await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
  await expect(page).toHaveURL(/#\/simulatorler$/);
  await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
  await expect(page.locator(PULSE_ROOT)).toHaveCount(0);
}

test.describe("sim rotaları yaşam döngüsü", () => {
  test("gerçek modüller arası geçişte tek kök kalır, ana sayfada sıfırdır", async ({ page }) => {
    await openRoute(page, "#/simulatorler");

    await openSimCard(page, "pulse");
    await expect(page.locator(PULSE_ROOT)).toHaveCount(1);

    await backToSimulators(page);

    await openSimCard(page, "ausculta");
    // Paket kapsayıcısı ve `App` kökü aynı sınıfı paylaşır (iç içe); `app-shell`
    // yalnız modül köküne aittir, tek örnek olduğunu bu ölçer.
    await expect(page.locator(".eg-sim-ausculta.app-shell")).toHaveCount(1);
    await expect(page.locator(PULSE_ROOT)).toHaveCount(0);

    // Birleşik barda ana gezinme yoktur: önce konumdan Simülatörler'e, oradan Ana sayfaya.
    await page.locator('a[href="#/simulatorler"]').first().click();
    await page.locator(`${NAV} a[href="#/"]`).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
  });

  test("geri tuşu önceki sim oturumunu tek kökle getirir", async ({ page }) => {
    await openRoute(page, "#/simulatorler");
    await openSimCard(page, "pulse");
    await backToSimulators(page);
    await openSimCard(page, "ausculta");

    await page.goBack();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
    await expect(page.locator(PULSE_ROOT).first()).toBeVisible();
  });
});

/**
 * Opaca gerçek modüle bağlandı (T14c): kart artık yer tutucu değil, gerçek
 * @egemed/sim-opaca ağacını mount eder. Bu blok yer tutucu sözleşmesi yerine
 * gerçek modülün başlangıç ekranını, tek üst bar kuralını (embedded — kendi
 * marka üst barını çizmez) ve konsol/sayfa hatası olmadığını doğrular.
 */
test.describe("Opaca sim rotası (gerçek modül)", () => {
  test("başlangıç ekranı görünür, tek üst bar ve tek h1 kalır, konsol hatası yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/simulatorler");

    await page.locator('a[href="#/sims/opaca"]').click();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    // Kaynak paket kapsayıcısı ve `App` kökü aynı "eg-sim-opaca" sınıfını
    // paylaşır (iç içe); `.first()` ilkini görünür bekler.
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible();

    // Gömülü modda tanıtım atlanır; mod seçimi ekranı açılır (S24).
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible();
    await expect(page.locator(".mode-card.learn")).toBeVisible();
    await expect(page.locator(".mode-card.practice")).toBeVisible();
    await expect(page.locator(".mode-card.assessment")).toBeVisible();

    // Tek üst bar: Opaca embedded modda kendi marka üst barını (.eg-header) çizmez;
    // kabuğun kendi marka barı (.eg-shell-header) tek kalır, sayfada tek h1 vardır.
    await expect(page.locator("header.eg-header")).toHaveCount(0);
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    expect(errors, "konsol/sayfa hatası").toEqual([]);

    // Simülatörler'e dönünce Opaca kökü temiz biçimde kaldırılır.
    await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-opaca")).toHaveCount(0);

    expect(errors, "konsol/sayfa hatası (dispose sonrası)").toEqual([]);
  });
});

test.describe("birleşik bar (Opaca ve Ausculta)", () => {
  for (const simId of ["opaca", "ausculta"] as const) {
    test(`${simId}: adımlar, sim araç çubuğu yok, Yardım modalı`, async ({ page }, testInfo) => {
      const errors = trackErrors(page);
      await openRoute(page, `#/sims/${simId}`);
      const width = testInfo.project.use.viewport?.width ?? 0;
      const steps = page.locator(".eg-shell-simbar__steps");
      if (width >= 1024) await expect(steps).toBeVisible();
      await expect(page.locator(".eg-sim-toolbar")).toHaveCount(0);
      await page.getByRole("button", { name: "Yardım" }).click();
      await expect(page.getByRole("dialog", { name: "Yardım" })).toBeVisible();
      await captureRouteScreenshot(page, testInfo.project.name, `#/sims/${simId} birleşik bar`);
      expect(errors, "konsol/sayfa hatası").toEqual([]);
    });
  }
});

test.describe("Ausculta ilerleme sayfası", () => {
  test("İlerlemem Başarılarım ve Liderlik sekmelerini açar", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/ausculta");
    await page.locator(".eg-shell-simbar").getByRole("button", { name: "İlerlemem" }).click();
    await expect(page.getByRole("tab", { name: "Başarılarım" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Liderlik Tahtası" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Başarılarım", exact: true })).toBeVisible();
    await expect(page.getByText("Demo verisi", { exact: false }).first()).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ilerleme");
    await page.getByRole("tab", { name: "Liderlik Tahtası" }).click();
    await expect(page.getByRole("heading", { name: "Liderlik Tahtası" })).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta liderlik");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

test.describe("Opaca ilerleme sayfası", () => {
  test("İlerlemem Başarılarım ve Liderlik sekmelerini açar", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/opaca");
    await page.locator(".eg-shell-simbar").getByRole("button", { name: "İlerlemem" }).click();
    await expect(page.getByRole("tab", { name: "Başarılarım" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Başarılarım", exact: true })).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca basarilarim");
    await page.getByRole("tab", { name: "Liderlik Tahtası" }).click();
    await expect(page.getByRole("heading", { name: "Liderlik Tahtası" })).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca liderlik");

test.describe("kompakt hesap menüsü (T120)", () => {
  // Plan gereği 360 px doğrulaması: düğme ve panel yatay taşma üretmez.
  test.use({ viewport: { width: 360, height: 780 } });

  test("baş harf düğmesi menüyü açar, çıkış görünür, Esc odağı geri verir", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/");
    await page.evaluate(() => {
      sessionStorage.setItem("egemed.devSession", JSON.stringify({ actorId: "dev-student-0001", role: "student" }));
    });
    await openRoute(page, "#/sims/ausculta");

    const account = page.getByRole("button", { name: /Hesap menüsü/ });
    await expect(account).toBeVisible();
    await expect(account).toContainText("ST");
    await expect(account).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menu")).toBeHidden();

    await account.click();
    await expect(account).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    const logout = page.getByRole("menuitem", { name: "Çıkış yap" });
    await expect(logout).toBeVisible();
    await expect(logout).toBeFocused();
    await expect(page.getByText("Sahte test öğrencisi")).toBeVisible();
    await expect(page.getByText("Geliştirme oturumu", { exact: true })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, "yatay kaydırma").toBe(false);

    // Dışarı tıklama kapatır; Esc kapatıp odağı düğmeye döndürür.
    await page.locator(".eg-shell-simbar__title").click();
    await expect(page.getByRole("menu")).toBeHidden();
    await account.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(account).toBeFocused();

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

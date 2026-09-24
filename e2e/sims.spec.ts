import { expect, test, type Page } from "@playwright/test";
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

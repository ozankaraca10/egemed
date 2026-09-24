import { expect, test, type Page } from "@playwright/test";
import { openRoute, trackErrors } from "./helpers";

/** Ausculta S18a'ya dek tek yer tutucu kalan simdir (Opaca T14c, Pulse T14d gerçek modüle bağlandı). */
type PlaceholderSimId = "ausculta";

const PLACEHOLDER = ".eg-shell-sim-placeholder";
const NAV = "nav";

/** Simülatörler sayfasındaki kart bağlantısıyla yer tutucu sim rotasına geçer (ausculta). */
async function openPlaceholderSimCard(page: Page, simId: PlaceholderSimId): Promise<void> {
  await page.locator(`a[href="#/sims/${simId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/sims/${simId}$`));
  await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
}

/** Simülatörler sayfasındaki kart bağlantısıyla Pulse'un gerçek modül köküne geçer (T14d). */
async function openPulseSimCard(page: Page): Promise<void> {
  await page.locator('a[href="#/sims/pulse"]').click();
  await expect(page).toHaveURL(/#\/sims\/pulse$/);
  await expect(page.locator(".eg-sim-pulse").first()).toBeVisible();
}

async function backToSimulators(page: Page): Promise<void> {
  await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
  await expect(page).toHaveURL(/#\/simulatorler$/);
  await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
  await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);
}

test.describe("sim rotaları yaşam döngüsü", () => {
  test("gerçek modülden yer tutucuya geçişte tek kök kalır, ana sayfada sıfırdır", async ({ page }) => {
    await openRoute(page, "#/simulatorler");

    await openPulseSimCard(page);
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(1);

    await backToSimulators(page);

    await openPlaceholderSimCard(page, "ausculta");
    await expect(page.locator(PLACEHOLDER)).toContainText("Ausculta");
    await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);

    await page.locator(`${NAV} a[href="#/"]`).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
  });

  test("geri tuşu önceki sim oturumunu tek kökle getirir", async ({ page }) => {
    await openRoute(page, "#/simulatorler");
    await openPulseSimCard(page);
    await backToSimulators(page);
    await openPlaceholderSimCard(page, "ausculta");

    await page.goBack();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
    await expect(page.locator(".eg-sim-pulse").first()).toBeVisible();
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
    await expect(page.locator(".mode-card.learn h3")).toHaveText("İnceleme Modu");
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

/**
 * Pulse gerçek modüle bağlandı (T14d): kart artık yer tutucu değil, gerçek
 * @egemed/sim-pulse ağacını mount eder. Pulse Opaca'dan farklı olarak
 * "embedded" React kökü değil, vanilla DOM kökü (`.eg-sim-pulse`) taşır ve
 * kendi bölüm gezinmesini (`.topbar`) her zaman çizer; bu bar kabuğun
 * `<main>`i içine gömülü olduğundan HTML "banner" rolü almaz (WHATWG header
 * kapsamı algoritması main'i sectioning kapsamına dahil eder) — sayfanın tek
 * "banner" üst barı kabuğun kendi `.eg-shell-header`ı olarak kalır. Bu blok
 * EKG kanvasının göründüğünü, tek üst bar/h1 kuralını, konsol hatası
 * olmadığını ve rota değişiminde dispose'un kanvası (RAF/timer'larıyla
 * birlikte) kaldırdığını doğrular.
 */
test.describe("Pulse sim rotası (gerçek modül)", () => {
  test("EKG kanvası görünür, tek üst bar ve tek h1 kalır, konsol hatası yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/simulatorler");

    await openPulseSimCard(page);

    // Gömülü modda tanıtım (landing) atlanır; mod seçimi ekranı açılır.
    await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible();

    // Mod kartından ("İnceleme Modu") EKG inceleme ekranına geçilir.
    await page.locator(".mode-card.learn button").click();
    await expect(page.locator("[data-pulse-ecg]")).toBeVisible();

    // Tek üst bar: Pulse'un kendi bölüm çubuğu `<main>` içine gömülüdür,
    // "banner" rolü almaz; kabuğun kendi marka barı tek kalır. Sayfada tek
    // h1 vardır (kabuk çubuğu Pulse hazır olduğunda kendi h1'ini bırakır).
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    expect(errors, "konsol/sayfa hatası").toEqual([]);

    // Simülatörler'e dönünce Pulse kökü (kanvas dahil) temiz biçimde kaldırılır.
    await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);
    await expect(page.locator("[data-pulse-ecg]")).toHaveCount(0);

    // RAF/timer sızıntısı yok: dispose sonrası ek konsol/sayfa hatası oluşmaz.
    expect(errors, "konsol/sayfa hatası (dispose sonrası, RAF/timer sızıntısı yok)").toEqual([]);
  });
});

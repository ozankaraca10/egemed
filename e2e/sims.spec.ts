import { expect, test, type Page } from "@playwright/test";
import { openRoute } from "./helpers";

type SimId = "pulse" | "ausculta" | "opaca";

const PLACEHOLDER = ".eg-shell-sim-placeholder";
const NAV = "nav";

/** Simülatörler sayfasındaki kart bağlantısıyla sim rotasına geçer. */
async function openSimCard(page: Page, simId: SimId): Promise<void> {
  await page.locator(`a[href="#/sims/${simId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/sims/${simId}$`));
  await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
}

async function backToSimulators(page: Page): Promise<void> {
  await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
  await expect(page).toHaveURL(/#\/simulatorler$/);
  await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
}

test.describe("sim rotaları yaşam döngüsü", () => {
  test("rotalar arasında tek yer tutucu kalır, ana sayfada sıfırdır", async ({ page }) => {
    await openRoute(page, "#/simulatorler");

    await openSimCard(page, "pulse");
    await expect(page.locator(PLACEHOLDER)).toContainText("Pulse");

    await page.locator(".eg-shell-sim-placeholder__back").click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);

    await openSimCard(page, "ausculta");
    await expect(page.locator(PLACEHOLDER)).toContainText("Ausculta");
    await expect(page.locator(PLACEHOLDER)).toHaveCount(1);

    await backToSimulators(page);
    await openSimCard(page, "opaca");
    await expect(page.locator(PLACEHOLDER)).toContainText("Opaca");
    await expect(page.locator(PLACEHOLDER)).toHaveCount(1);

    await page.locator(`${NAV} a[href="#/"]`).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);
  });

  test("geri tuşu önceki sim oturumunu tek yer tutucuyla getirir", async ({ page }) => {
    await openRoute(page, "#/simulatorler");
    await openSimCard(page, "pulse");
    await backToSimulators(page);
    await openSimCard(page, "ausculta");

    await page.goBack();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(PLACEHOLDER)).toHaveCount(1);
    await expect(page.locator(PLACEHOLDER)).toContainText("Pulse");
  });
});

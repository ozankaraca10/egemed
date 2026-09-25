import { expect, test } from "@playwright/test";

/**
 * Kullanıcı kararı (25 Eylül 2026): platformda zorla tam ekran önerisi (popup)
 * açılmaz; tam ekran yalnız birleşik bardaki ikondan (T139). Depo boşken — yani
 * "Tekrar sorma" hiç işaretlenmemişken — simler açılır ve istem gecikmesinden
 * (Opaca 500 ms) sonra da hiçbir tam ekran penceresi görünmez.
 */
test.describe("tam ekran önerisi yok (T139)", () => {
  test("Opaca açılışta tam ekran penceresi açmaz", async ({ page }) => {
    await page.goto("/#/sims/opaca");
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await expect(page.getByRole("dialog", { name: "Tam ekran önerilir" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tam ekran" }).first()).toBeVisible();
  });

  test("Pulse açılışta tam ekran penceresi açmaz", async ({ page }) => {
    await page.goto("/#/sims/pulse");
    const root = page.locator(".egemed-pulse-runtime");
    await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await expect(root.locator("dialog#fullscreenPrompt[open]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tam ekran" }).first()).toBeVisible();
  });
});

test("Pulse oynatma çubuğunda ikinci tam ekran düğmesi yok (T139)", async ({ page }) => {
  await page.goto("/#/sims/pulse");
  const root = page.locator(".egemed-pulse-runtime");
  await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
  await expect(root.locator("#transportFullscreen")).toBeHidden();
  await expect(page.getByRole("button", { name: "Tam ekran" })).toHaveCount(1);
});

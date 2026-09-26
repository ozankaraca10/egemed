import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

/**
 * Ziyaretçi modu (depo sahibi kararı, 26 Eylül 2026): giriş ekranından
 * "Ziyaretçi olarak göz at" → yalnız öğrenme modu açık; uygulama/değerlendirme
 * kilitli ve "Yalnızca Ege Üniversitesi Tıp Fakültesi öğrencileri yararlanabilir";
 * "Öğrenci girişi" giriş ekranına döner ve ziyaretçi işareti kalkar.
 */
test("ziyaretçi: sınırlı öğrenme modu, kilitli modlar ve öğrenci girişine dönüş", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#/giris/test-ogrenci");
  await page.getByRole("button", { name: "Ziyaretçi olarak göz at" }).click();
  await expect(page).toHaveURL(/#\/simulatorler$/);
  await expect(page.getByRole("button", { name: "Öğrenci girişi" }).first()).toBeVisible();

  await page.goto("/#/sims/opaca");
  const root = page.locator(".eg-sim-opaca").first();
  await expect(root).toBeVisible({ timeout: 20_000 });
  await expect(root.getByText("Yalnızca Ege Üniversitesi Tıp Fakültesi öğrencileri yararlanabilir.").first()).toBeVisible();
  await expect(root.locator(".mode-card.practice.audience-locked")).toBeVisible();
  await expect(root.locator(".mode-card.assessment.audience-locked")).toBeVisible();

  // Kartın "Öğrenci girişi" düğmesi giriş ekranına götürür; ziyaretçi işareti kalkar.
  await root.locator(".mode-card.practice").getByRole("button", { name: /Öğrenci girişi/ }).click();
  await expect(page).toHaveURL(/#\/giris\/test-ogrenci$/);
  expect(await page.evaluate(() => window.sessionStorage.getItem("egemed.visitor"))).toBeNull();
  expect(errors).toEqual([]);
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

/**
 * T233/T307 — Ausculta öğrenme görünüm kuralı: her örnek yalnız kaydı olan
 * noktaların görünümlerini açar (anterior/posterior; gerçek lateral kayıtta sol/sağ
 * lateral). Kaydı olmayan görünüm devre dışı çizilir (kilit imi + kısa açıklama) ve
 * 360 px'de yatay kaydırma oluşmaz.
 */

async function signInAsStudent(page: Page): Promise<void> {
  await page.goto("/#/giris/test-ogrenci");
  await page.fill("#entry-username", "ogrenci");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/$/);
}

async function openLearn(page: Page): Promise<Locator> {
  await signInAsStudent(page);
  await openRoute(page, "#/sims/ausculta");
  const root = page.locator(".eg-sim-ausculta").first();
  await root.locator(".mode-card.learn button.eg-gami-mode-cta").first().click();
  await expect(root.locator(".learn-head")).toBeVisible();
  return root;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "yatay kaydırma").toBeLessThanOrEqual(1);
}

function viewButton(root: Locator, label: "Anterior" | "Posterior" | "Sol lat." | "Sağ lat."): Locator {
  return root.locator(".view-toggle button", { hasText: label });
}

/** Kütüphane öğesini kısa başlığıyla seçer (alt dize çakışması yok: tam eşleşme). */
async function selectItem(root: Locator, shortTitle: string): Promise<void> {
  const escaped = shortTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await root.locator(".lib-item b").filter({ hasText: new RegExp(`^${escaped}$`) }).click();
}

test.describe("Ausculta öğrenme görünüm kuralı (T233/T307)", () => {
  test("kalp öğesinde sahne anterior; Posterior devre dışı ve açıklamalı", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);

    await selectItem(root, "Normal S1–S2");
    await expect(root.locator(".learn-grid .stage-card")).toHaveAttribute("data-view", "front");
    const back = viewButton(root, "Posterior");
    await expect(back).toBeDisabled();
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(viewButton(root, "Anterior")).toBeEnabled();
    await expect(back).toHaveAttribute("title", "Bu örnekte posterior kayıt yok");
    await expectNoHorizontalScroll(page);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme kalp anterior");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("gerçek hasta örneği lateral görünümü açar; kaydı olmayan anterior kapalı", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);

    await selectItem(root, "Ronküs");
    await root.locator(".ex-btn").nth(1).click();
    const stage = root.locator(".learn-grid .stage-card");
    await expect(viewButton(root, "Anterior")).toBeDisabled();
    await expect(stage).toHaveAttribute("data-view", "back");
    await viewButton(root, "Sol lat.").click();
    await expect(stage).toHaveAttribute("data-view", "left");
    await expectNoHorizontalScroll(page);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme ronkus lateral");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("karma öğede iki görünüm açık; Posterior'a geçiş sahneyi çevirir", async ({ page }) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);
    await selectItem(root, "Üfürüm + Wheezing");
    const stage = root.locator(".learn-grid .stage-card");
    await expect(stage).toHaveAttribute("data-view", "front");
    await expect(viewButton(root, "Posterior")).toBeEnabled();
    await viewButton(root, "Posterior").click();
    await expect(stage).toHaveAttribute("data-view", "back");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

/**
 * T233 — Ausculta gövde görünümü izin kuralı (depo sahibi kararı, 28 Eyl 2026):
 * yalnız akciğer sesi → sahne arkada, Ön devre dışı; yalnız kalp sesi → sahne önde,
 * Arka devre dışı; karma içerikte iki görünüm açık. İzinli olmayan görünüm devre dışı
 * çizilir (kilit imi + kısa açıklama) ve 360 px'de yatay kaydırma oluşmaz.
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
  await expect(root.locator(".tabbar.info-tabs")).toBeVisible();
  return root;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "yatay kaydırma").toBeLessThanOrEqual(1);
}

function viewButton(root: Locator, label: "Ön" | "Arka"): Locator {
  return root.locator(".view-toggle button", { hasText: label });
}

/** Kütüphane öğesini kısa başlığıyla seçer (alt dize çakışması yok: tam eşleşme). */
async function selectItem(root: Locator, shortTitle: string): Promise<void> {
  const escaped = shortTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await root.locator(".lib-item b").filter({ hasText: new RegExp(`^${escaped}$`) }).click();
}

test.describe("Ausculta görünüm kuralı (T233)", () => {
  test("akciğer öğesinde sahne arkada; Ön devre dışı ve açıklamalı", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);

    await selectItem(root, "Normal Solunum");
    await expect(root.locator(".learn-grid .stage-card")).toHaveAttribute("data-view", "back");
    const front = viewButton(root, "Ön");
    await expect(front).toBeDisabled();
    await expect(front).toHaveAttribute("aria-disabled", "true");
    await expect(viewButton(root, "Arka")).toBeEnabled();
    await expect(root.getByText("Ön görünüm kapalı")).toBeVisible();
    // Devre dışı görünüm klavye sırasına girmez (native disabled).
    await expect(front).toHaveAttribute("disabled", "");
    await expectNoHorizontalScroll(page);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme akciger arkada");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("kalp öğesinde sahne önde; Arka devre dışı ve açıklamalı", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);

    await selectItem(root, "Normal S1–S2");
    await expect(root.locator(".learn-grid .stage-card")).toHaveAttribute("data-view", "front");
    const back = viewButton(root, "Arka");
    await expect(back).toBeDisabled();
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(viewButton(root, "Ön")).toBeEnabled();
    await expect(root.getByText("Arka görünüm kapalı")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme kalp onde");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("karma öğede iki görünüm de açık", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);

    await selectItem(root, "Üfürüm + Wheezing");
    await expect(root.locator(".learn-grid .stage-card")).toHaveAttribute("data-view", "front");
    await expect(viewButton(root, "Ön")).toBeEnabled();
    await expect(viewButton(root, "Arka")).toBeEnabled();
    await expect(root.getByText("görünüm kapalı")).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta ogrenme karma acik");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });

  test("görünüm değiştirilebilir: karma öğede Arka'ya geçiş sahneyi çevirir", async ({ page }) => {
    const errors = trackErrors(page);
    const root = await openLearn(page);
    await selectItem(root, "Üfürüm + Wheezing");
    const stage = root.locator(".learn-grid .stage-card");
    await viewButton(root, "Arka").click();
    await expect(stage).toHaveAttribute("data-view", "back");
    // Akciğer öğesine dönünce kilitli ön yerine izinli arka görünüm korunur.
    await selectItem(root, "Normal Solunum");
    await expect(stage).toHaveAttribute("data-view", "back");
    await expect(viewButton(root, "Arka")).toBeEnabled();
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

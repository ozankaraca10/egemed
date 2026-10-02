import { expect, test } from "@playwright/test";
import { openRoute } from "./helpers";

/**
 * T206: 3 sütunlu masaüstü öğrenme düzeninde sol kütüphane sütunu satır
 * yüksekliğini belirliyor, ızgara onun içerik boyuna uzuyor ve orta sahne bu
 * yüksekliğe gerildiği için görüntünün üstünde/altında boş alan kalıyordu
 * (1440×900'de scrollHeight ≈1480). Düzeltmede satır içerik yüksekliğinde
 * hizalanır, kütüphane paneli kendi içinde kayar ve sahne gövde görselinin
 * en-boy oranında kalır. Ölçüm yalnız 1440×900 masaüstü projesinde anlamlıdır;
 * 768/390 akışı bu görevde değişmez.
 * T309: onaylı maket düzeni — belge ekran yüksekliğinde kalır, sütunlar kendi içinde kayar.
 */
test.describe("Ausculta öğrenme düzeni (T206)", () => {
  test("1440×900: belge ekranı aşmaz, üç sütun kendi içinde kayar", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "ölçüm yalnız 1440×900 projesinde");

    await openRoute(page, "#/sims/ausculta");
    await page.locator(".mode-card.learn button.eg-gami-mode-cta").first().click();

    const stage = page.locator(".learn-grid .stage-card .stage");
    await expect(stage).toBeVisible();
    const lib = page.locator(".learn-grid > .lib-col");
    await expect(lib).toBeVisible();
    // T309 (maket): üç sütun da ekran yüksekliğinde, her biri kendi içinde kayar.
    for (const column of [lib, page.locator(".learn-grid > .sim-main"), page.locator(".learn-grid > .sim-side")]) {
      await expect(column).toHaveCSS("overflow-y", "auto");
    }

    const { scrollHeight, viewport } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(scrollHeight - viewport, "öğrenme ekranı belgeyi kaydırmaz").toBeLessThanOrEqual(1);
  });
});

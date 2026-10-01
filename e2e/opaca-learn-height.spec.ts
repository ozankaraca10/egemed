import { expect, test } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

/**
 * T207 — Opaca öğrenme ekranı dikey uzama regresyonu.
 *
 * Hata (27 Eyl 2026): 3 sütunlu öğrenme ızgarasında satır yüksekliği uzun
 * kütüphane listesine göre büyüyor, gerilen orta sütun film tuvalini
 * şişiriyordu (1440×900'de scrollHeight ≈2551). Düzeltme sonrası sayfa kısa
 * kalır ve kütüphane kendi içinde kayar. Tek ölçüm noktası masaüstü 3 sütun
 * düzenidir; <1024 px akışı bu testin kapsamı dışındadır (mevcut davranış).
 */
test.describe("Opaca öğrenme ekranı dikey yerleşimi (T207)", () => {
  test("1440×900'de sayfa kısa kalır ve kütüphane kendi içinde kayar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "yalnız masaüstü 3 sütun düzeni");
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await root.locator(".mode-card.learn button.eg-gami-mode-cta").first().click();
    await expect(root.locator(".lib-col")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const scroller = document.querySelector(".lib-col .lib-scroll");
      const heading = document.querySelector(".lib-col h2");
      const headingRect = heading?.getBoundingClientRect() ?? null;
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        headingVisible: headingRect !== null && headingRect.height > 0 && headingRect.top < window.innerHeight,
        listClientHeight: scroller?.clientHeight ?? 0,
        listOverflowY: scroller === null ? null : getComputedStyle(scroller).overflowY,
        listScrollHeight: scroller?.scrollHeight ?? 0,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca öğrenme");

    expect(metrics.scrollHeight, "1440×900'de öğrenme ekranı yüksekliği").toBeLessThanOrEqual(1200);
    expect(metrics.listOverflowY, "sol liste kendi içinde kayar").toBe("auto");
    expect(metrics.listScrollHeight, "kütüphane listesi kaydırılabilir").toBeGreaterThan(metrics.listClientHeight);
    expect(metrics.headingVisible, "kütüphane başlığı görünür kalır").toBe(true);
    expect(metrics.horizontalOverflow, "yatay kaydırma").toBe(false);
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

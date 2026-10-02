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
 * T307: orta sütuna örnek seçimi ve hasta kartı eklendiği için sabit 1200 px
 * sınırı yerine "belge, en uzun sütunun içeriğinden uzun değil" (boş alan yok) ölçülür.
 */
test.describe("Ausculta öğrenme düzeni (T206)", () => {
  test("1440×900: sayfa hedef yüksekliği aşmaz, kütüphane kendi içinde kayar", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "ölçüm yalnız 1440×900 projesinde");

    await openRoute(page, "#/sims/ausculta");
    await page.locator(".mode-card.learn button.eg-gami-mode-cta").first().click();

    const stage = page.locator(".learn-grid .stage-card .stage");
    await expect(stage).toBeVisible();
    const lib = page.locator(".learn-grid > .lib-col");
    await expect(lib).toBeVisible();
    // Kütüphane paneli ekran yüksekliğine sığar ve kendi içinde kayar.
    await expect(lib).toHaveCSS("overflow-y", "auto");
    await expect(lib).toHaveCSS("position", "sticky");

    const { scrollHeight, contentBottom } = await page.evaluate(() => {
      const bottoms = [".learn-grid .sim-main > :last-child", ".learn-grid .sim-side > :last-child"].map((selector) => {
        const node = document.querySelector(selector);
        return node ? node.getBoundingClientRect().bottom + window.scrollY : 0;
      });
      return { scrollHeight: document.documentElement.scrollHeight, contentBottom: Math.max(...bottoms) };
    });
    expect(contentBottom, "içerik ölçülebilir").toBeGreaterThan(0);
    expect(scrollHeight - contentBottom, "öğrenme ekranında içerik altı boş alan").toBeLessThanOrEqual(64);
  });
});

import { expect, test, type Locator } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

/**
 * T228 — stetoskop ses iletim tüpü: sahnenin sol üstünde sabit bağlantı
 * (Y-parça), göğüs parçasının tüpe bakan kenarına bağlı hareketli uç ve
 * sürükleme sırasında aynı karede güncellenen kübik Bézier yolu.
 */

interface Point {
  x: number;
  y: number;
}

function parseTube(d: string): { start: Point; end: Point } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers, `yol verisi sayı çiftleri taşımalı: ${d}`).toHaveLength(8);
  const [sx = 0, sy = 0, , , , , ex = 0, ey = 0] = numbers;
  return { start: { x: sx, y: sy }, end: { x: ex, y: ey } };
}

async function viewBoxOf(path: Locator): Promise<{ w: number; h: number }> {
  return path.evaluate((node) => {
    const svg = (node as SVGPathElement).ownerSVGElement;
    if (!svg) throw new Error("tüp katmanı SVG bulunamadı");
    return { w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height };
  });
}

test.describe("Ausculta stetoskop tüpü (T228)", () => {
  test("tüp göğüs parçasını izler, bağlantı sabit kalır, sahne taşmaz", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/sims/ausculta");
    await page.locator(".mode-card.learn button.btn").first().click();

    const stage = page.locator(".learn-grid .stage-card .stage");
    await expect(stage).toBeVisible();
    const tube = stage.locator(".body-wrap svg.tube-layer path.tube-line");
    await expect(tube).toHaveAttribute("d", /M /);

    const before = (await tube.getAttribute("d")) ?? "";
    const parsedBefore = parseTube(before);
    const viewBox = await viewBoxOf(tube);
    // Sabit bağlantı: gövde sahnesinin sol üst köşesi (~%4, %4).
    expect(parsedBefore.start.x / viewBox.w).toBeCloseTo(0.06, 2);
    expect(parsedBefore.start.y / viewBox.h).toBeCloseTo(0.12, 2);

    const steth = stage.locator(".steth");
    await steth.scrollIntoViewIfNeeded();
    const box = await steth.boundingBox();
    expect(box, "göğüs parçası kutusu ölçülemedi").not.toBeNull();
    const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 40, startY - 70, { steps: 12 });
    await expect
      .poll(() => tube.getAttribute("d"), { message: "sürükleme tüp yolunu güncellemeli" })
      .not.toBe(before);
    await page.mouse.up();

    const after = (await tube.getAttribute("d")) ?? "";
    const parsedAfter = parseTube(after);
    expect(parsedAfter.start, "başlangıç noktası değişmemeli").toEqual(parsedBefore.start);

    // Uç, göğüs parçasının kenarında: merkeze uzaklık yarıçap (38 px) kadar.
    const tipDistance = async (): Promise<number> => {
      const centerPct = await steth.evaluate((node) => ({
        left: Number.parseFloat((node as HTMLElement).style.left),
        top: Number.parseFloat((node as HTMLElement).style.top),
      }));
      const center: Point = { x: (centerPct.left / 100) * viewBox.w, y: (centerPct.top / 100) * viewBox.h };
      const end = parseTube((await tube.getAttribute("d")) ?? "").end;
      return Math.hypot(end.x - center.x, end.y - center.y);
    };
    const distance = await tipDistance();
    expect(distance, "uç göğüs parçası kenarında olmalı").toBeGreaterThan(20);
    expect(distance, "uç göğüs parçası kutusuna yakın olmalı").toBeLessThanOrEqual(box ? box.width / 2 + 3 : 41);

    // Proje genişliğinde (360/768/1440) yatay kaydırma yok.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "yatay kaydırma").toBeLessThanOrEqual(1);
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/ausculta stetoskop tüpü");

    // Pencere yeniden boyutlanması tüp ile göğüs parçasını ayırmamalı.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: Math.max(320, (viewport?.width ?? 360) - 40), height: viewport?.height ?? 780 });
    expect(parseTube((await tube.getAttribute("d")) ?? "").start, "başlangıç yeniden boyutlanmada sabit").toEqual(parsedBefore.start);
    const resizedDistance = await tipDistance();
    expect(resizedDistance, "uç yeniden boyutlanmada kenarda kalmalı").toBeGreaterThan(20);
    expect(resizedDistance).toBeLessThanOrEqual(box ? box.width / 2 + 3 : 41);

    // Tüp sahne dışına taşmaz (SVG görünüm kutusu içinde).
    const bbox = await tube.evaluate((node) => {
      const rect = (node as SVGPathElement).getBBox();
      return { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
    });
    expect(bbox.x).toBeGreaterThanOrEqual(-1);
    expect(bbox.y).toBeGreaterThanOrEqual(-1);
    expect(bbox.right).toBeLessThanOrEqual(viewBox.w + 1);
    expect(bbox.bottom).toBeLessThanOrEqual(viewBox.h + 1);

    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

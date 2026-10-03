import { expect, test } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { openRoute, trackErrors } from "./helpers";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function openLearn(page: import("@playwright/test").Page) {
  await openRoute(page, "#/sims/opaca");
  const root = page.locator(".eg-sim-opaca").first();
  await root.locator(".mode-card.learn button.eg-gami-mode-cta").click();
  await expect(root.locator(".lib-col")).toBeVisible();
  return root;
}

test.describe("Opaca görüntüye özgü okuma bölgeleri", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/assets/xray/runtime/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
  });

  test("frontal, lateral ve bölgesiz görüntü davranışları", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-768", "kabul mobil ve masaüstünde doğrulanır");
    const errors = trackErrors(page);
    const root = await openLearn(page);

    // T321a: pediatrik konular çıktı; erişkin frontal film (Kardiyomegali, ilk örnek) kullanılır.
    await root.locator(".lib-item", { hasText: "Kardiyomegali" }).click();
    await expect(root.locator('img[src*="nih_00000211_041.webp"]')).toBeVisible();
    const firstRect = { x: 0.3279, y: 0.0076 }; // ilk çizilen bölge: a_trachea (segmentasyon)
    const drawn = root.locator(".zone-rect").first();
    await expect(drawn).toHaveAttribute("x", String(firstRect.x));
    await expect(drawn).toHaveAttribute("y", String(firstRect.y));
    expect(firstRect.x).not.toBe(0.1); // Eski sabit PA şablonundaki b_r_upper.x

    await root.locator(".lib-item", { hasText: "Lateral grafi" }).click();
    await expect(root.locator('img[src*="commons_hiatal_lat.webp"]')).toBeVisible();
    await expect(root.locator(".zone-chip", { hasText: "Retrosternal" })).toBeVisible();

    await root.locator(".lib-item", { hasText: "Klavikula kırığı" }).click();
    await expect(root.locator('img[src*="commons_clavicle_fx.webp"]')).toBeVisible();
    await expect(root.getByText(/Bu görüntü için okuma bölgesi tanımlı değil\./)).toBeVisible();
    await expect(root.locator(".zone-rect")).toHaveCount(0);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca goruntu bolgeleri");
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

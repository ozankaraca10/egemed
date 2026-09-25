import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { captureRouteScreenshot, writeAxeArtifact, type AxeViolationArtifact } from "./artifacts";
import { trackErrors } from "./helpers";

async function signInStudent(page: Page): Promise<void> {
  await page.goto("/#/giris/test-ogrenci");
  await page.fill("#entry-username", "ogrenci");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "İlerlemem" })).toBeVisible();
}

function visiblePanel(page: Page) {
  return page.locator(".eg-tabs__panel:not([hidden])");
}

test.describe("dashboard İlerlemem", () => {
  test("sekme değiştirir; gami-ui ve sim bağlantısı görünür", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await signInStudent(page);
    const panel = visiblePanel(page);
    await expect(panel.locator(".eg-gami-profile")).toBeVisible();
    await expect(panel.locator(".eg-gami-goals")).toBeVisible();
    await expect(panel.locator(".eg-gami-recent")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Simülatörde İlerlemem'i aç" })).toHaveAttribute("href", "#/sims/pulse");
    await captureRouteScreenshot(page, testInfo.project.name, "#/dashboard-ilerleme");

    await page.getByRole("tab", { name: "Ausculta" }).click();
    await expect(page.getByRole("tab", { name: "Ausculta" })).toHaveAttribute("aria-selected", "true");
    await expect(visiblePanel(page).getByText("Henüz rozet yok.")).toBeVisible();
    await expect(visiblePanel(page).getByRole("link", { name: "Simülatörde İlerlemem'i aç" })).toHaveAttribute(
      "href",
      "#/sims/ausculta",
    );
    await captureRouteScreenshot(page, testInfo.project.name, "#/dashboard-ilerleme-ausculta");

    await page.getByRole("tab", { name: "Opaca" }).click();
    await expect(page.getByRole("tab", { name: "Opaca" })).toHaveAttribute("aria-selected", "true");
    await expect(visiblePanel(page).locator(".eg-gami-profile")).toBeVisible();
    await expect(visiblePanel(page).getByRole("link", { name: "Simülatörde İlerlemem'i aç" })).toHaveAttribute(
      "href",
      "#/sims/opaca",
    );
    await captureRouteScreenshot(page, testInfo.project.name, "#/dashboard-ilerleme-opaca");

    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(fits, "yatay kaydırma").toBe(true);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations: AxeViolationArtifact[] = results.violations.map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact ?? null,
      targets: violation.nodes.flatMap((node) => node.target).slice(0, 5).map(String),
    }));
    await writeAxeArtifact(testInfo.project.name, "#/dashboard-ilerleme", violations);
    expect(violations, "axe ihlalleri").toEqual([]);
    expect(errors, "konsol/sayfa hatası").toEqual([]);
  });
});

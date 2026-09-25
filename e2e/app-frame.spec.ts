import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";

/**
 * T152 — uygulama çerçevesi: tüm sayfalarda tek hesap menüsü (Radix), yönetim alanında
 * sol menü / dar ekranda sekme şeridi. WCAG 2.2 AA (axe), klavye, yatay taşma yok.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function signIn(page: Page, role: "admin" | "student"): Promise<void> {
  await page.goto(role === "admin" ? "/#/giris/admin" : "/#/giris/test-ogrenci");
  await page.fill("#entry-username", role === "admin" ? "admin" : "ogrenci");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(role === "admin" ? /#\/admin$/ : /#\/$/);
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "yatay taşma").toBeLessThanOrEqual(1);
}

async function axe(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.describe("uygulama çerçevesi (T152)", () => {
  test("öğrenci: hesap menüsü klavyeyle açılır, çıkış menüden yapılır; rol çipi yoktur", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await signIn(page, "student");
    const account = page.getByRole("button", { name: /Hesap menüsü/ });
    await expect(account).toBeVisible();
    await expect(page.getByRole("button", { name: "Çıkış yap" })).toHaveCount(0);
    await noHorizontalOverflow(page);
    await account.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Çıkış yap" })).toBeFocused();
    await expect(menu.getByText("Geliştirme oturumu", { exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Yönetim paneli" })).toHaveCount(0);
    expect(await axe(page)).toEqual([]);
    await captureRouteScreenshot(page, testInfo.project.name, "#/hesap-menusu");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/giris\//);
    expect(errors).toEqual([]);
  });

  test("admin: yönetim menüsü etkin bölümü işaretler, bölümler arası gezinir; menüde yönetim paneli", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await signIn(page, "admin");
    const adminNav = page.getByRole("navigation", { name: "Yönetim bölümleri" });
    await expect(adminNav).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Genel bakış" })).toHaveAttribute("aria-current", "page");
    await adminNav.getByRole("link", { name: "Kullanıcılar" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
    await expect(adminNav.getByRole("link", { name: "Kullanıcılar" })).toHaveAttribute("aria-current", "page");
    await expect(adminNav.getByRole("link", { name: "Genel bakış" })).not.toHaveAttribute("aria-current", "page");
    await noHorizontalOverflow(page);
    expect(await axe(page)).toEqual([]);
    await captureRouteScreenshot(page, testInfo.project.name, "#/admin/kullanicilar-cerceve");
    await adminNav.getByRole("link", { name: "Denetim" }).click();
    await expect(page).toHaveURL(/#\/admin\/denetim$/);
    await expect(adminNav.getByRole("link", { name: "Denetim" })).toHaveAttribute("aria-current", "page");
    const targets = await adminNav.getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect()).filter((rect) => rect.width < 44 || rect.height < 44).length,
    );
    expect(targets, "44 px altı yönetim bağlantısı").toBe(0);
    await page.getByRole("button", { name: /Hesap menüsü/ }).click();
    await page.getByRole("menuitem", { name: "Yönetim paneli" }).click();
    await expect(page).toHaveURL(/#\/admin$/);
    expect(errors).toEqual([]);
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";

/**
 * T151 — premium bileşen temeli (Radix + lucide + EGEMED token'ları). Geliştirme vitrini
 * `#/_vitrin` üzerinde: WCAG 2.2 AA (axe), klavye, odak tuzağı/dönüşü, 44 px hedefler,
 * mobil alt sayfa. Vitrin yalnız geliştirme paketindedir (üretim: auth-prod.spec.ts).
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function openShowcase(page: Page): Promise<void> {
  await page.goto("/#/_vitrin");
  await expect(page.getByRole("heading", { name: "Bileşen vitrini" })).toBeVisible();
}

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function smallTargets(page: Page): Promise<string[]> {
  // Açılış animasyonu (ölçek .98 → 1) sürerken ölçülen kutu küçük görünür; bitmesi beklenir.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY),
  );
  return page.evaluate(() =>
    [...document.querySelectorAll("button, input:not([type=hidden]), textarea, [role=combobox], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option]")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return rect.width < 44 || rect.height < 44 ? `${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 24)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : null;
      })
      .filter((entry): entry is string => entry !== null),
  );
}

test.describe("premium bileşen temeli (T151)", () => {
  test("vitrin axe 0, hatasız ve tüm hedefler ≥ 44 px", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await openShowcase(page);
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    await captureRouteScreenshot(page, testInfo.project.name, "#/_vitrin");
    expect(errors).toEqual([]);
  });

  test("açılır liste klavyeyle seçilir; boş değerli 'Tümü' seçeneği korunur", async ({ page }) => {
    await openShowcase(page);
    const role = page.getByRole("combobox", { name: "Rol" });
    await expect(role).toHaveText("Tümü");
    await role.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await expect(page.getByRole("option", { name: "Tümü" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    // Radix odağı bir sonraki görev döngüsünde taşır; Enter odak yeni öğeye geçince basılır (insan hızı).
    await expect(page.getByRole("option", { name: "Kullanıcı" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(role).toHaveText("Kullanıcı");
    await expect(role).toBeFocused();
  });

  test("diyalog odağı tutar, Esc ile kapanır ve odak açan düğmeye döner", async ({ page }) => {
    await openShowcase(page);
    const opener = page.getByRole("button", { name: "Diyaloğu aç" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Yeni kullanıcı" });
    await expect(dialog).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("hesap menüsü ok tuşlarıyla gezilir ve Esc ile kapanır", async ({ page }) => {
    await openShowcase(page);
    const trigger = page.getByRole("button", { name: "Hesap menüsü" });
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Profilim" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Çıkış yap" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("anahtar ve onay kutusu klavyeyle değişir; bildirim canlı bölgede duyurulur", async ({ page }) => {
    await openShowcase(page);
    const toggle = page.getByRole("switch", { name: /Liderlik tablosunda görün/ });
    await expect(toggle).toBeChecked();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    const ausculta = page.getByRole("checkbox", { name: "Ausculta" });
    await ausculta.focus();
    await page.keyboard.press("Space");
    await expect(ausculta).toBeChecked();
    await page.getByRole("button", { name: "Bildirim göster" }).click();
    await expect(page.getByRole("region", { name: /Bildirimler/ }).getByText("Kaydedildi")).toBeVisible();
  });

  test("tarih alanı: yazarak giriş yapılır, takvimden klavyeyle seçilir, axe 0, 360'da taşma yok", async ({ page }) => {
    await openShowcase(page);
    const dateInput = page.getByLabel("Doğum tarihi");
    await dateInput.click();
    await dateInput.pressSequentially("15042026");
    await expect(dateInput).toHaveValue("15.04.2026");
    await page.keyboard.press("Tab");
    await expect(page.locator(".eg-datefield__error")).toHaveCount(0);

    const openCalendar = page.getByRole("button", { name: "Takvimi aç" });
    await openCalendar.click();
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);

    const selectedCell = page.locator('[data-iso="2026-04-15"]');
    await expect(selectedCell).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-iso="2026-04-16"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(grid).toBeHidden();
    await expect(openCalendar).toBeFocused();
    await expect(dateInput).toHaveValue("16.04.2026");

    await page.setViewportSize({ width: 360, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("tablo: aria-sort klavyeyle sıralanır, seçim çalışır, 360 px'te yatay taşma yok, tüm hedefler ≥ 44 px", async ({ page }) => {
    const errors = trackErrors(page);
    await openShowcase(page);
    const table = page.getByRole("table", { name: "Örnek kullanıcı tablosu" });
    await expect(table).toBeVisible();

    const nameHeader = page.getByRole("columnheader", { name: /Ad Soyad/ });
    await expect(nameHeader).toHaveAttribute("aria-sort", "none");
    const sortButton = nameHeader.getByRole("button", { name: /Ad Soyad/ });
    await sortButton.focus();
    await page.keyboard.press("Enter");
    await expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    await page.keyboard.press("Enter");
    await expect(nameHeader).toHaveAttribute("aria-sort", "descending");

    const firstRowCheckbox = page.getByRole("checkbox", { name: /satırını seç/ }).first();
    await firstRowCheckbox.focus();
    await page.keyboard.press("Space");
    await expect(firstRowCheckbox).toBeChecked();
    const selectAll = page.getByRole("checkbox", { name: "Tümünü seç" });
    await expect(selectAll).toBeVisible();

    expect(await axeViolations(page)).toEqual([]);

    await page.setViewportSize({ width: 360, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(await smallTargets(page)).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(errors).toEqual([]);
  });
});

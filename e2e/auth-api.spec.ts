import { expect, test, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";

/**
 * T57 — API oturumu (dev sağlayıcı, E3 §a). Bu spec yalnız `api-dev`
 * projesinde koşar; proje `playwright.config.ts` içinde API `/health` ucu
 * yanıt verdiğinde eklenir. API ayakta değilse spec atlanmaz (test.skip yok),
 * proje kapsamında hiç çalışmaz. Beklenen ortam: `AUTH_DEV_ENABLED=true`,
 * migrate + `seed:dev` uygulanmış geliştirme veritabanı.
 */

const ADMIN_ENTRY = "/#/giris/admin";
const STUDENT_ENTRY = "/#/giris/test-ogrenci";
const SESSION_COOKIE = "egemed_session";
const CSRF_COOKIE = "egemed_csrf";
const ADMIN_NAME = "Geliştirme Yöneticisi";
const STUDENT_NAME = "Geliştirme Öğrencisi";
/** Oturumsuz `/auth/me` isteği 401 döner; Chromium bunu konsola yazar (beklenen). */
const EXPECTED_401 = /401 \(Unauthorized\)/;

async function signIn(page: Page, username: string, password = "egemed"): Promise<void> {
  await page.fill("#entry-username", username);
  await page.fill("#entry-password", password);
  await page.click("button[type=submit]");
}

/** Üst bardaki oturum göstergesi; API oturumunda sunucudan gelen görünen adı taşır. */
function sessionRole(page: Page) {
  return page.locator(".eg-shell-session__role");
}

test.describe("API oturumu (dev sağlayıcı)", () => {
  test("öğrenci girişi sunucu oturumu kurar, yenilemede korunur", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    await expect(sessionRole(page)).toHaveText(STUDENT_NAME);

    // Oturum sessionStorage'da değil, sunucu çerezinde: `egemed_session` HttpOnly
    // olduğu için `document.cookie`'de görünmez, double-submit CSRF çerezi görünür.
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain(SESSION_COOKIE);
    expect(cookie).toContain(CSRF_COOKIE);
    expect(await page.evaluate(() => sessionStorage.getItem("egemed.devSession"))).toBeNull();

    await page.reload();
    await expect(sessionRole(page)).toHaveText(STUDENT_NAME);
    await captureRouteScreenshot(page, testInfo.project.name, "#/");
    expect(errors.filter((line) => !EXPECTED_401.test(line)), "konsol/sayfa hatası").toEqual([]);
  });

  test("rol /auth/me'den gelir: öğrenci admin panelini açamaz, admin açar", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);

    await signIn(page, "admin");
    await expect(page).toHaveURL(/#\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toBeVisible();
    await expect(sessionRole(page)).toHaveText(ADMIN_NAME);
    // Sentetik oturum uyarısı API oturumunda çizilmez.
    await expect(page.getByText("Geliştirme oturumu")).toHaveCount(0);
  });

  test("çıkış /auth/logout ile sunucu oturumunu kapatır", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin");
    await expect(page).toHaveURL(/#\/admin$/);
    await page.reload();
    await expect(sessionRole(page)).toHaveText(ADMIN_NAME);

    await page.getByRole("button", { name: "Çıkış yap" }).click();
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toBeVisible();
    await page.reload();
    await expect(sessionRole(page)).toHaveCount(0);
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("hatalı parola, bilinmeyen kullanıcı ve rol karışması reddedilir", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin", "yanlis");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await signIn(page, "yok-boyle-kullanici");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await signIn(page, "ogrenci");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(sessionRole(page)).toHaveCount(0);
  });

  test("sahte sessionStorage kaydı API modunda oturum açmaz", async ({ page }) => {
    await page.goto("/#/");
    await page.evaluate(() => {
      sessionStorage.setItem("egemed.devSession", JSON.stringify({ actorId: "dev-admin-0001", role: "admin" }));
    });
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("oluşturulan kullanıcı listede kalır ve yenilemede durur", async ({ page }) => {
    const username = `t89.${crypto.randomUUID().slice(0, 8)}`;
    const displayName = "T89 Kalici Kullanici";
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin");
    await expect(page).toHaveURL(/#\/admin$/);
    await page.goto("/#/admin/kullanicilar/yeni");
    const dialog = page.getByRole("dialog");
    const textInputs = dialog.locator('input[type="text"]');
    await textInputs.nth(0).fill(username);
    await textInputs.nth(1).fill(displayName);
    await dialog.getByLabel("Birim").selectOption("unit-3");
    const created = page.waitForResponse(
      (response) => response.url().includes("/admin/users") && response.request().method() === "POST" && response.ok(),
    );
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await dialog.getByRole("button", { name: "Onayla" }).click();
    await created;
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
    await page.getByLabel("Ara").fill(username);
    await expect(page.getByRole("link", { name: displayName }).filter({ visible: true })).toBeVisible();
    await page.reload();
    await page.getByLabel("Ara").fill(username);
    await expect(page.getByRole("link", { name: displayName }).filter({ visible: true })).toBeVisible();
  });

  test("dashboard gerçek oturumda demo 1450 XP göstermez", async ({ page }) => {
    const summary = page.waitForResponse(
      (response) => response.url().includes("/me/gamification") && response.request().method() === "GET" && response.ok(),
    );
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const payload = (await (await summary).json()) as {
      data?: { sims?: readonly { simId?: string; xp?: number }[] };
    };
    const pulseXp = payload.data?.sims?.find((sim) => sim.simId === "pulse")?.xp;
    expect(pulseXp).not.toBe(1450);
    expect(JSON.stringify(payload)).not.toContain("1450");
    await expect(page.getByRole("heading", { name: "İlerlemem" })).toBeVisible();
    await expect(page.getByText("1450", { exact: true })).toHaveCount(0);
    await expect(page.locator(".eg-shell-progress__num").first()).toHaveText(String(pulseXp));
  });
});

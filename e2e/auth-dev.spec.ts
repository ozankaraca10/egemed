import { expect, test, type Page } from "@playwright/test";

const ADMIN_ENTRY = "/#/giris/admin";
const STUDENT_ENTRY = "/#/giris/test-ogrenci";

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.fill("#entry-username", username);
  await page.fill("#entry-password", password);
  await page.click("button[type=submit]");
}

test.describe("dev giriş akışları", () => {
  test("yanlış parola hata gösterir", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin", "yanlis");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
  });

  test("rol karışması reddedilir", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "ogrenci", "egemed");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await expect(page).toHaveURL(/#\/giris\/admin$/);

    await page.goto(STUDENT_ENTRY);
    await signIn(page, "admin", "egemed");
    await expect(page.getByRole("alert")).toContainText("hatalı");
    await expect(page).toHaveURL(/#\/giris\/test-ogrenci$/);
  });

  test("admin girişi (Enter, boşluk/büyük harf) panele götürür", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await page.fill("#entry-username", "  ADMIN ");
    await page.fill("#entry-password", "egemed");
    await page.press("#entry-password", "Enter");
    await expect(page).toHaveURL(/#\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toBeVisible();
    await expect(page.getByText("Geliştirme oturumu")).toBeVisible();
    // T152: oturum adı hesap menüsü düğmesinin erişilebilir adındadır (dar ekranda yalnız baş harf görünür).
    await expect(page.getByRole("button", { name: "Hesap menüsü: Sahte yönetici" })).toBeVisible();
  });

  test("çıkış oturumu kapatır, admin kapalı kalır", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin", "egemed");
    await expect(page).toHaveURL(/#\/admin$/);
    // T152: çıkış hesap menüsündedir.
    await page.getByRole("button", { name: /Hesap menüsü/ }).click();
    await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toBeVisible();
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("öğrenci girişi ana sayfaya gider, admin açamaz", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci", "egemed");
    await expect(page).toHaveURL(/#\/$/);
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("tutarsız sahte kayıt admin açmaz", async ({ page }) => {
    await page.goto("/#/");
    await page.evaluate(() => {
      sessionStorage.setItem("egemed.devSession", JSON.stringify({ actorId: "forged", role: "admin" }));
    });
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("ilk Tab odağı içeriğe geç bağlantısıdır", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveClass(/eg-shell-skip/);
    await expect(focused).toHaveText("İçeriğe geç");
    await page.keyboard.press("Enter");
    await expect(page.locator("#icerik")).toBeFocused();
  });
});

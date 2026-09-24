import { expect, test } from "@playwright/test";

test.describe("üretim önizlemesi güvenlik kontrolleri", () => {
  test("elle yazılmış geçerli görünen oturum admin açmaz", async ({ page }) => {
    await page.goto("/#/");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "egemed.devSession",
        JSON.stringify({ actorId: "dev-admin-0001", role: "admin" }),
      );
    });
    await page.goto("/#/admin");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toHaveCount(0);
  });

  test("giriş formu önizleme uyarısı gösterir, dev hesabı çizmez", async ({ page }) => {
    await page.goto("/#/giris/admin");
    await expect(page.getByText("Kimlik doğrulama henüz bağlı değil")).toBeVisible();
    await expect(page.getByText("Geliştirme hesabı")).toHaveCount(0);
  });
});

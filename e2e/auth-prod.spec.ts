import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import auscultaCasesCore from "../packages/assessment-bank/data/ausculta/cases.json" with { type: "json" };
import auscultaCasesAuto from "../packages/assessment-bank/data/ausculta/cases-auto.json" with { type: "json" };

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

  test("geliştirme bileşen vitrini üretim paketinde yoktur (T151)", async ({ page }) => {
    await page.goto("/#/_vitrin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Bileşen vitrini" })).toHaveCount(0);
  });

  test("T196: üretim paketi anahtarlı Ausculta vakalarını ve DEV yerel oturumunu taşımaz", () => {
    const dir = "apps/shell/dist/assets";
    const bundle = readdirSync(dir)
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(`${dir}/${name}`, "utf8"))
      .join("\n");
    expect(bundle.length).toBeGreaterThan(0);
    const ids = [...(auscultaCasesCore as { cases: { id: string }[] }).cases, ...(auscultaCasesAuto as { cases: { id: string }[] }).cases].map(
      (entry) => entry.id,
    );
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => bundle.includes(`"${id}"`))).toEqual([]);
    expect(bundle).not.toContain("createDevLocalSessionSource");
  });
});

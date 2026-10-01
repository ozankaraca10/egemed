import { expect, test } from "@playwright/test";

/**
 * T283f — XP kazandıran ekranda yapay zekâ ajanı işareti: 10 sn kapatma uyarısı,
 * süre dolunca duraklatma, ajan kapanınca kendiliğinden açılma; rekabetçi
 * olmayan ekranda (mod seçimi) uyarı yok. Değerlendirme adresi sunucusuz
 * ortamda açılamadığı için `replaceState` ile verilir (sim tepki vermez).
 */
test("yapay zekâ ajanı uyarısı: rekabetçi ekranda geri sayım, engel ve açılma", async ({ page }) => {
  await page.goto("/#/giris/test-ogrenci");
  await page.fill("#entry-username", "ogrenci"); await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]"); await page.waitForTimeout(1200);
  await page.goto("/#/sims/opaca/modlar");
  await expect(page.locator(".eg-gami-journey")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { const d = document.createElement("div"); d.id = "claude-agent-glow"; document.body.append(d); });
  await page.waitForTimeout(2000);
  await expect(page.locator(".eg-shell-aiguard"), "mod seçimi rekabetçi değil").toHaveCount(0);
  await page.evaluate(() => history.replaceState(null, "", "#/sims/opaca/degerlendirme"));
  await expect(page.locator(".eg-shell-aiguard")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Ekran duraklatıldı")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.getElementById("claude-agent-glow")?.remove());
  await expect(page.locator(".eg-shell-aiguard")).toHaveCount(0, { timeout: 10_000 });
});

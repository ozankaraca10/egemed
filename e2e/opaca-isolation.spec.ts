import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";

/**
 * Opaca yerel kayıtları kullanıcıya ayrıdır (T93, PULSE-08 deseni): durum,
 * oyunlaştırma ve tercih anahtarları `egemed:u:<actorId>:opaca:` ad alanında
 * tutulur; aynı tarayıcıda hesap değişince önceki kullanıcının verisi
 * yüklenmez ve öneksiz anahtar oluşmaz. Emsal: e2e/pulse-runtime.spec.ts (PULSE-08).
 */
const ROOT = ".eg-sim-opaca";
const ADMIN = { actorId: "dev-admin-0001", role: "admin" } as const;
const STUDENT = { actorId: "dev-student-0001", role: "student" } as const;

function namespaceOf(actorId: string): string {
  return `egemed:u:${encodeURIComponent(actorId)}:opaca:`;
}

async function asUser(page: Page, session: typeof ADMIN | typeof STUDENT): Promise<void> {
  await page.evaluate((value) => sessionStorage.setItem("egemed.devSession", JSON.stringify(value)), session);
}

async function openOpaca(page: Page): Promise<Locator> {
  await page.goto("/#/sims/opaca");
  // Kapsayıcı ve app kökü aynı sınıfı paylaşır (iç içe); `.first()` emsalle uyumlu.
  const root = page.locator(ROOT).first();
  await expect(root).toBeVisible();
  return root;
}

test.describe("Opaca kayıt izolasyonu (T93)", () => {
  test("kayıtlar kullanıcıya özeldir; öneksiz anahtar oluşmaz ve öğrenci boş başlar", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    // Admin ad alanına tohum: ad alanlı OKUMA doğrulanabilir olur (öğrenci bunu görmez).
    const adminBestKey = `${namespaceOf(ADMIN.actorId)}opaca.bestScore`;
    await page.addInitScript((pair: [string, string]) => {
      localStorage.setItem(pair[0], pair[1]);
    }, [adminBestKey, JSON.stringify({ practice: 77, assessment: 0 })]);

    await page.goto("/#/");
    await asUser(page, ADMIN);
    let root = await openOpaca(page);
    await expect(root.locator(".mode-card.practice"), "admin en iyi puanı kendi ad alanından okundu").toContainText("En iyi puan: 77");

    // İşlem: öğrenme modunu seç → konu kaydı oyunlaştırma deposuna yazılır.
    await root.locator(".mode-card.learn").getByRole("button", { name: "Öğrenmeye başla" }).click();
    await expect(root.locator(".lib-col")).toBeVisible();

    const adminGamiKey = `${namespaceOf(ADMIN.actorId)}opaca.gami.v1`;
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), adminGamiKey), "öğrenme kaydı yazıldı")
      .not.toBeNull();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), adminBestKey),
      "en iyi puan admin ad alanında",
    ).toBe(JSON.stringify({ practice: 77, assessment: 0 }));
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("opaca."))),
      "öneksiz opaca anahtarı oluşmadı",
    ).toEqual([]);

    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/opaca");

    // Hesap değişimi: aynı tarayıcıda öğrenci oturumu.
    await page.goto("/#/simulatorler");
    await asUser(page, STUDENT);
    root = await openOpaca(page);
    await expect(root.locator(".mode-card.practice"), "öğrenci admin kaydını yüklemez").toContainText("Henüz denenmedi");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), `${namespaceOf(STUDENT.actorId)}opaca.gami.v1`),
      "öğrenci oyunlaştırma ad alanı boş başladı",
    ).toBeNull();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), `${namespaceOf(STUDENT.actorId)}opaca.bestScore`),
      "öğrenci en iyi puanı sıfırdan başladı",
    ).toBe(JSON.stringify({ practice: 0, assessment: 0 }));
    expect(
      await page.evaluate((key) => localStorage.getItem(key), adminGamiKey),
      "admin kaydı öğrenciye taşınmadı",
    ).not.toBeNull();
    expect(errors).toEqual([]);
  });
});

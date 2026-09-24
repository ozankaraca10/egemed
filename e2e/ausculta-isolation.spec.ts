import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./helpers";

/**
 * Ausculta yerel kayıtları kullanıcıya özeldir (PULSE-08 deseni, T94).
 * Kabul: yerel anahtarlar yalnız `egemed:u:<actorId>:ausculta:` (yoksa
 * `egemed:anon:ausculta:`) ad alanına yazılır; eski öneksiz kayıt hiçbir
 * hesaba taşınmaz ve aynı tarayıcıda hesap değişince önceki veri görünmez.
 */
const ROOT = ".eg-sim-ausculta";
const BEST_SCORE_KEY = "ausculta.bestScore";
const GAMI_KEY = "egemed.ausculta.gamification.v1";
const ADMIN = { actorId: "dev-admin-0001", role: "admin" } as const;
const STUDENT = { actorId: "dev-student-0001", role: "student" } as const;

function namespaceOf(actorId: string): string {
  return `egemed:u:${actorId}:ausculta:`;
}

async function asUser(page: Page, session: typeof ADMIN | typeof STUDENT): Promise<void> {
  await page.evaluate((value) => sessionStorage.setItem("egemed.devSession", JSON.stringify(value)), session);
}

async function openAusculta(page: Page): Promise<void> {
  await page.goto("/#/sims/ausculta", { waitUntil: "networkidle" });
  await expect(page.locator(`${ROOT}.app-shell`)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible();
}

/** `Storage` arayüzüyle yerel anahtarları toplar (own-key sırasına güvenilmez). */
function localStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "").filter((key) => key !== ""),
  );
}

function readLocal(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => localStorage.getItem(name), key);
}

test.describe("Ausculta kayıt izolasyonu", () => {
  test("kayıt yalnız kendi ad alanına yazılır; eski öneksiz kayıt taşınmaz", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/");
    await asUser(page, ADMIN);
    // Admin'in önceki oturumundan kendi ad alanında kaydı var; cihazda ayrıca
    // eski (öneksiz) bir kayıt duruyor — yeni hesap bunu devralmamalı.
    const legacy = JSON.stringify({ practice: 77, assessment: 0 });
    await page.evaluate(
      ({ namespacedKey, legacyKey, value, legacyValue }) => {
        localStorage.setItem(namespacedKey, value);
        localStorage.setItem(legacyKey, legacyValue);
      },
      {
        namespacedKey: `${namespaceOf(ADMIN.actorId)}${BEST_SCORE_KEY}`,
        legacyKey: BEST_SCORE_KEY,
        value: JSON.stringify({ practice: 91, assessment: 0 }),
        legacyValue: legacy,
      },
    );

    await openAusculta(page);
    const practiceCard = page.locator(".mode-card.practice");
    await expect(practiceCard.locator(".mode-best-score")).toContainText("En iyi puan: 91");
    // Bir işlem yap: mod seç (öğrenme moduna yönlendirir) ve ekran değişsin.
    await practiceCard.locator("button").click();
    await expect(
      page.getByRole("heading", { name: /^(Kalp Sesleri|Akciğer Sesleri|Kombine Sesler)$/ }).first(),
    ).toBeVisible();

    const adminKeys = await localStorageKeys(page);
    expect(adminKeys.some((key) => key.startsWith(namespaceOf(ADMIN.actorId)))).toBe(true);
    expect(
      adminKeys.filter((key) => !key.startsWith("egemed:u:") && !key.startsWith("egemed:anon:")),
      "uygulama öneksiz anahtar oluşturmaz (yalnız testin tohumladığı eski kayıt kalır)",
    ).toEqual([BEST_SCORE_KEY]);
    expect(await readLocal(page, BEST_SCORE_KEY), "eski kayıt değiştirilmedi").toBe(legacy);
    expect(await readLocal(page, GAMI_KEY), "oyunlaştırma öneksiz yazılmaz").toBeNull();

    // Hesap değişimi: sayfa yeniden yüklenir (gerçek kullanımda oturum baştan okunur).
    await asUser(page, STUDENT);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`${ROOT}.app-shell`)).toHaveCount(1);
    await expect(page.getByText("Sahte test öğrencisi")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible();
    await expect(practiceCard.locator(".mode-best-score")).toContainText("Henüz denenmedi");
    await expect
      .poll(() => readLocal(page, `${namespaceOf(STUDENT.actorId)}${BEST_SCORE_KEY}`), {
        message: "öğrenci ad alanı sıfırlarla başlar",
      })
      .toBe('{"practice":0,"assessment":0}');
    expect(
      await readLocal(page, `${namespaceOf(ADMIN.actorId)}${BEST_SCORE_KEY}`),
      "admin kaydı yerinde kalır",
    ).toBe('{"practice":91,"assessment":0}');
    expect(
      (await localStorageKeys(page)).filter((key) => !key.startsWith("egemed:u:") && !key.startsWith("egemed:anon:")),
      "öğrenci oturumu da öneksiz anahtar oluşturmaz",
    ).toEqual([BEST_SCORE_KEY]);
    expect(errors).toEqual([]);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { curriculum } from "../packages/sim-pulse/src/data/curriculum";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";
import { completeTopicPractice, startTopicPractice } from "./sim-flows";

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

/** Üst bardaki hesap menüsü düğmesi (T152); erişilebilir adı sunucudan gelen görünen adı taşır. */
function sessionRole(page: Page) {
  return page.getByRole("button", { name: /Hesap menüsü/ });
}

test.describe("API oturumu (dev sağlayıcı)", () => {
  // Testler aynı tohum kullanıcılarını (admin/ogrenci) ve aynı DB’yi paylaşır; erişim
  // kaldırma gibi durum değiştiren senaryolar paralel koşuda birbirini bozar.
  test.describe.configure({ mode: "serial" });
  test("öğrenci girişi sunucu oturumu kurar, yenilemede korunur", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    await expect(sessionRole(page)).toHaveAccessibleName(`Hesap menüsü: ${STUDENT_NAME}`);

    // Oturum sessionStorage'da değil, sunucu çerezinde: `egemed_session` HttpOnly
    // olduğu için `document.cookie`'de görünmez, double-submit CSRF çerezi görünür.
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toContain(SESSION_COOKIE);
    expect(cookie).toContain(CSRF_COOKIE);
    expect(await page.evaluate(() => sessionStorage.getItem("egemed.devSession"))).toBeNull();

    await page.reload();
    await expect(sessionRole(page)).toHaveAccessibleName(`Hesap menüsü: ${STUDENT_NAME}`);
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
    await expect(sessionRole(page)).toHaveAccessibleName(`Hesap menüsü: ${ADMIN_NAME}`);
    // Sentetik oturum uyarısı API oturumunda çizilmez.
    await expect(page.getByText("Geliştirme oturumu")).toHaveCount(0);
  });

  test("çıkış /auth/logout ile sunucu oturumunu kapatır", async ({ page }) => {
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin");
    await expect(page).toHaveURL(/#\/admin$/);
    await page.reload();
    await expect(sessionRole(page)).toHaveAccessibleName(`Hesap menüsü: ${ADMIN_NAME}`);

    await sessionRole(page).click();
    await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
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

  test("CSV içe aktarma gerçek API'de uygulanır; geçerli satır kalıcı, hatalı satır raporlanır (TEST-01, T143)", async ({ page }) => {
    const tag = crypto.randomUUID().slice(0, 8);
    const username = `t143.${tag}`;
    const displayName = `T143 Ice Aktarim ${tag}`;
    const csv = [
      "kullanici_adi;eposta;ad_soyad;rol;birim_kodu;sim_erisimi;giris_tipi",
      `${username};;${displayName};;;pulse;`,
      `t143.hata.${tag};gecersiz-eposta;T143 Hatali Satir;;;;`,
    ].join("\n");
    await page.goto(ADMIN_ENTRY);
    await signIn(page, "admin");
    await expect(page).toHaveURL(/#\/admin$/);
    await page.goto("/#/admin/ice-aktar");
    await page.getByRole("button", { name: "İleri" }).click();
    await page.getByLabel("CSV içeriği").fill(csv);
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByText("2 satır algılandı")).toBeVisible();
    await page.getByRole("button", { name: "İleri" }).click();
    await page.getByRole("button", { name: "İleri" }).click();
    await expect(page.getByText("1 geçerli · 1 hatalı")).toBeVisible();
    // Sunucu doğrulaması: iletiler sahte kaynakla aynı, alana özgü Türkçe metindir (T144).
    await expect(page.getByText("satır 2 · E-posta · E-posta biçimi geçersiz.")).toBeVisible();
    await page.getByRole("button", { name: "İleri" }).click();
    await page.getByRole("button", { name: "İleri" }).click();
    await page.getByRole("button", { name: "Uygula" }).click();
    const applied = page.waitForResponse(
      (response) => response.url().includes("/admin/imports") && response.request().method() === "POST" && response.ok() && response.url().includes("apply"),
    );
    await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
    await applied;
    await expect(page.getByText("1 uygulandı · 1 hatalı")).toBeVisible();
    // Kalıcılık: kullanıcı listede ve yenilemeden sonra da var.
    await page.goto("/#/admin/kullanicilar");
    await page.getByLabel("Ara").fill(username);
    await expect(page.getByRole("link", { name: displayName }).filter({ visible: true })).toBeVisible();
    await page.reload();
    await page.getByLabel("Ara").fill(username);
    await expect(page.getByRole("link", { name: displayName }).filter({ visible: true })).toBeVisible();
    await page.getByLabel("Ara").fill(`t143.hata.${tag}`);
    await expect(page.getByRole("link", { name: "T143 Hatali Satir" })).toHaveCount(0);
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
    await expect(page.locator("[data-sim-id='pulse']")).toHaveAttribute("data-xp", String(pulseXp));
  });

  test("öğrenci liderlik anahtarını kapatır ve yenilemede kapalı kalır", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const toggle = page.getByRole("switch", { name: "Liderlik tablosunda görün" });
    await expect(toggle).toBeVisible();
    // T145: tercih GET /me/preferences ile eşzamansız yüklenir; anahtar yüklenene
    // dek devre dışı ve işaretsiz başlar. Beklemeden `uncheck()` no-op olur (zaten
    // işaretsiz) ve PATCH hiç gönderilmez — bu da aşağıdaki `waitForResponse`'u
    // asılı bırakan bir yarışa yol açar.
    await expect(toggle).toBeEnabled();
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/me/preferences") && response.request().method() === "PATCH" && response.ok(),
    );
    await toggle.uncheck();
    await saved;
    await page.reload();
    const reloaded = page.getByRole("switch", { name: "Liderlik tablosunda görün" });
    await expect(reloaded).not.toBeChecked();
    // T145: tercih GET /me/preferences ile eşzamansız yüklenir; anahtar yüklenene
    // dek devre dışı kalır (bkz. ProgressSection). Tıklamadan önce etkin olmasını
    // bekleriz ki yükleme bitmeden gelen bir tıklama kayıp/kararsız olmasın.
    await expect(reloaded).toBeEnabled();
    const restored = page.waitForResponse(
      (response) =>
        response.url().includes("/me/preferences") && response.request().method() === "PATCH" && response.ok(),
    );
    await reloaded.check();
    await restored;
  });

  test("admin pulse erişimini kaldırınca öğrenci simi açamaz", async ({ page, browser, baseURL }, testInfo) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const studentId = await page.evaluate(async () => {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      const body = (await response.json()) as { data?: { id?: string } };
      return body.data?.id ?? "";
    });
    expect(studentId).not.toBe("");

    const adminContext = await browser.newContext({ baseURL });
    const adminPage = await adminContext.newPage();
    try {
      await adminPage.goto(ADMIN_ENTRY);
      await signIn(adminPage, "admin");
      await expect(adminPage).toHaveURL(/#\/admin$/);
      const revoked = await adminPage.evaluate(async (userId) => {
        const csrf = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("egemed_csrf="))
          ?.slice("egemed_csrf=".length);
        const response = await fetch("/api/admin/users/bulk", {
          body: JSON.stringify({ operation: "revoke_sim", userIds: [userId], value: "pulse" }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(csrf === undefined ? {} : { "X-CSRF-Token": decodeURIComponent(csrf) }),
          },
          method: "POST",
        });
        return response.ok;
      }, studentId);
      expect(revoked).toBe(true);
      await page.reload();
      await page.goto("/#/sims/pulse");
      await expect(page.getByText("Bu simülatöre erişiminiz yok")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Erişim yok" })).toBeVisible();
      await expect(page.locator("main").getByRole("link", { name: "Simülatörlere dön" })).toBeVisible();
      await expect(page.locator(".egemed-pulse-runtime")).toHaveCount(0);
      // T129: duyuru kartı 360/768/1440'ta yatay taşma üretmez; ekran görüntüsü
      // yalnız erişim reddi için alınır (hata durumu, yükleyici zorlanmadan oluşmaz).
      for (const width of [360, 768, 1440]) {
        await page.setViewportSize({ height: width === 360 ? 780 : 900, width });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(overflow, `yatay kaydırma (${width}px)`).toBe(false);
      }
      await captureRouteScreenshot(page, testInfo.project.name, "#/sims/pulse erişim reddi");
    } finally {
      await adminPage.evaluate(async (userId) => {
        const csrf = document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("egemed_csrf="))
          ?.slice("egemed_csrf=".length);
        await fetch("/api/admin/users/bulk", {
          body: JSON.stringify({ operation: "grant_sim", userIds: [userId], value: "pulse" }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(csrf === undefined ? {} : { "X-CSRF-Token": decodeURIComponent(csrf) }),
          },
          method: "POST",
        });
      }, studentId).catch(() => undefined);
      await adminContext.close();
    }
  });

  test("Pulse sınavı API oturumunda sunucuya yazılır ve dashboard XP eşleşir", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const posted = page.waitForResponse(
      (response) =>
        response.url().includes("/me/gamification/pulse/attempts") &&
        response.request().method() === "POST" &&
        (response.status() === 200 || response.status() === 201),
    );
    await page.goto("/#/sims/pulse");
    const root = page.locator(".egemed-pulse-runtime");
    await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
    if (await root.locator("#tutorialSkip").isVisible().catch(() => false)) await root.locator("#tutorialSkip").click();
    await root.locator('#modeCards [data-view="quiz"]').click();
    for (let i = 0; i < 10; i += 1) {
      const id = /Q\d{3}/.exec(await root.locator("#quizForm").innerText())?.[0];
      expect(id, `soru ${i + 1} kimliği`).toBeDefined();
      const item = curriculum.byId[id ?? ""];
      expect(item, id).toBeDefined();
      await root.locator(`#quizForm input[value="${item?.correct ?? ""}"]`).check();
      await root.locator("#quizSubmit").click();
      if (i < 9) await root.locator("#quizItemNext").click();
    }
    await posted;
    const summary = page.waitForResponse(
      (response) => response.url().includes("/me/gamification") && !response.url().includes("/attempts") && response.request().method() === "GET" && response.ok(),
    );
    await page.goto("/#/");
    const payload = (await (await summary).json()) as {
      data?: { sims?: readonly { simId?: string; xp?: number; badges?: readonly { key?: string }[] }[] };
    };
    const pulse = payload.data?.sims?.find((sim) => sim.simId === "pulse");
    const pulseXp = pulse?.xp ?? 0;
    expect(pulseXp).toBeGreaterThan(0);
    // ADR-008: 10/10 sınav → 10'luk ritim serisi; rozetler sunucuda kodlu özetten verilir.
    const badgeKeys = (pulse?.badges ?? []).map((badge) => badge.key);
    expect(badgeKeys).toContain("rhythm-streak-3");
    expect(badgeKeys).toContain("rhythm-streak-10");
    await expect(page.getByRole("heading", { name: "İlerlemem" })).toBeVisible();
    await expect(page.locator("[data-sim-id='pulse']")).toHaveAttribute("data-xp", String(pulseXp));
    // T114: sunucu rozetleri katalog adlarıyla gösterilir (ADR-008 S4).
    await expect(page.getByText("Ritim izleyicisi")).toBeVisible();
  });

  test("Opaca konu oturumu API oturumunda öğrenme sayaçlarıyla sunucuya yazılır (ADR-008 S4, T143)", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const posted = page.waitForRequest(
      (request) => request.url().includes("/me/gamification/opaca/attempts") && request.method() === "POST",
    );
    await page.goto("/#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible({ timeout: 20_000 });
    // Öğrenme ekranında konu açmak öğrenme etkinliği yazar; ardından konu uygulaması biter.
    await startTopicPractice(root);
    await completeTopicPractice(root, "opaca");
    const request = await posted;
    const body = request.postDataJSON() as { summary?: Record<string, number> };
    expect(body.summary?.["opaca.v"]).toBe(1);
    expect(body.summary?.["opaca.mode"]).toBe(0);
    expect(body.summary?.["opaca.learn"] ?? 0, "birikimli öğrenme konusu").toBeGreaterThanOrEqual(1);
    expect(body.summary?.["opaca.lib"] ?? 0, "kütüphane konu toplamı").toBeGreaterThan(0);
    expect((await request.response())?.ok(), "deneme yazımı").toBe(true);
  });

  test("Pulse sınavı bitince İlerlemem sunucu rozetini gösterir ve demo bandı yoktur", async ({ page }) => {
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    const posted = page.waitForResponse(
      (response) =>
        response.url().includes("/me/gamification/pulse/attempts") &&
        response.request().method() === "POST" &&
        (response.status() === 200 || response.status() === 201),
    );
    await page.goto("/#/sims/pulse");
    const root = page.locator(".egemed-pulse-runtime");
    await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
    if (await root.locator("#tutorialSkip").isVisible().catch(() => false)) await root.locator("#tutorialSkip").click();
    await root.locator('#modeCards [data-view="quiz"]').click();
    for (let i = 0; i < 10; i += 1) {
      const id = /Q\d{3}/.exec(await root.locator("#quizForm").innerText())?.[0];
      expect(id, `soru ${i + 1} kimliği`).toBeDefined();
      const item = curriculum.byId[id ?? ""];
      expect(item, id).toBeDefined();
      await root.locator(`#quizForm input[value="${item?.correct ?? ""}"]`).check();
      await root.locator("#quizSubmit").click();
      if (i < 9) await root.locator("#quizItemNext").click();
    }
    await posted;
    await page.locator(".eg-shell-simbar").getByRole("button", { name: "İlerlemem" }).click();
    await expect(page.getByRole("button", { name: /Ritim izleyicisi.*kazanıldı/i }).first()).toBeVisible();
    await expect(page.getByText("Demo verisi")).toHaveCount(0);
  });
});

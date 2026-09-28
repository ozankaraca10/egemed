import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { curriculum } from "../packages/sim-pulse/src/data/curriculum";
import { captureRouteScreenshot } from "./artifacts";
import { clickSimBarAction, selectRadixOption, trackErrors } from "./helpers";
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

/**
 * T208 öğrenme kilidi: sınav yalnız 23 patern izlenmiş ve 10 vaka gönderilmiş
 * kayıtla açılır. Sunucu oturumunda kullanıcı ad alanı (actorId) önceden
 * bilinmediğinden çalışma zamanının yazdığı anahtar bulunup tohumlanır ve
 * sayfa yeniden yüklenir.
 */
async function openPulseQuiz(page: Page): Promise<Locator> {
  await page.goto("/#/sims/pulse");
  const root = page.locator(".egemed-pulse-runtime");
  await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
  if (await root.locator("#tutorialSkip").isVisible().catch(() => false)) await root.locator("#tutorialSkip").click();
  const record = {
    version: 6,
    cv: curriculum.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: Array.from({ length: 23 }, () => 16_000),
    u: 4,
    c: {
      // Oturum kimliği her koşuda benzersiz olmalı; sunucu aynı kimlikli denemeyi 409 ile reddeder.
      i: `egemed-seed-case-${randomUUID().slice(0, 8)}`,
      n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      a: Array.from({ length: 10 }, () => 0),
      s: 1023,
      l: Array.from({ length: 10 }, () => [0, 0, 0]),
      x: Array.from({ length: 10 }, () => -1),
    },
    // T210: runtime havuzu 500 maddeye büyüdü; doğru yanıt indeksleri TS veri
    // aynasından (ilk 400 madde) okunduğu için değerlendirme oturumu Q001–Q010'a sabitlenir.
    q: {
      i: `egemed-seed-quiz-${randomUUID().slice(0, 8)}`,
      n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      a: Array.from({ length: 10 }, () => -1),
      s: 0,
      l: Array.from({ length: 10 }, () => [0, 0, 0]),
      x: Array.from({ length: 10 }, () => -1),
    },
  };
  // İlk yükleme kayıt anahtarını (kullanıcı ad alanıyla) oluşturur; tohum bir
  // sonraki belge yüklemesinde, kaynağın `pagehide` kaydından SONRA yazılmalıdır.
  const namespaceKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.endsWith("pulse:egemed-pulse-6.0")),
  );
  expect(namespaceKeys.length, "Pulse kullanıcı kayıt ad alanı bulundu").toBeGreaterThan(0);
  await page.addInitScript((value: Record<string, unknown>) => {
    for (const key of Object.keys(localStorage)) {
      if (key.endsWith("pulse:egemed-pulse-6.0")) localStorage.setItem(key, JSON.stringify(value));
    }
  }, record);
  await page.reload();
  await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
  if (await root.locator("#tutorialSkip").isVisible().catch(() => false)) await root.locator("#tutorialSkip").click();
  await root.locator('#modeCards [data-view="quiz"]').click();
  return root;
}

/**
 * Öğrenme kilidi (27 Eyl 2026): meydan okumadan önce ilgili simin öğrenme modu
 * tamamlanmış olmalı. Kayıt sayfa içi fetch ile CSRF başlığıyla yazılır
 * (ikinci öğrenci giriş ekranından geçemediği için aynı desen kullanılır).
 */
async function completeLearn(page: Page, simId: string): Promise<void> {
  const status = await page.evaluate(
    async ({ id, cookieName }) => {
      const csrf = decodeURIComponent(document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`))?.[1] ?? "");
      const response = await fetch(`/api/me/sims/${id}/learn/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ contentVersion: "e2e.2026-09-27" }),
      });
      return response.status;
    },
    { id: simId, cookieName: CSRF_COOKIE },
  );
  expect(status, `${simId} öğrenme kaydı`).toBe(200);
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
    await selectRadixOption(dialog, "Birim", "3. Sınıf");
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
      // Yalnız özet ucu: liderlik/ödül istekleri aynı öneki taşır ve yarışta
      // yakalanırsa `data.sims` boş okunup karşılaştırmayı bozar.
      (response) => /\/me\/gamification$/.test(new URL(response.url()).pathname) && response.request().method() === "GET" && response.ok(),
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
    await expect(page.locator("[data-sim-id='pulse']")).toHaveAttribute("data-xp", String(pulseXp ?? 0)); // Pulse denemesi yoksa özet girdisi yok; panel 0 XP (test sırasından bağımsız)
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
    const root = await openPulseQuiz(page);
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
      (response) => /\/me\/gamification$/.test(new URL(response.url()).pathname) && response.request().method() === "GET" && response.ok(),
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
    await expect(page.locator("[data-sim-id='pulse']")).toHaveAttribute("data-xp", String(pulseXp ?? 0)); // Pulse denemesi yoksa özet girdisi yok; panel 0 XP (test sırasından bağımsız)
    // T114: sunucu rozetleri katalog adlarıyla gösterilir (ADR-008 S4).
    await expect(page.getByText("Ritim izleyicisi")).toBeVisible();
  });

  test("Opaca uygulaması sunucu oturumundan gelir: anahtarsız vaka, görüntü vekili 200 ve sunucu denemesi (A2.3, ADR-009)", async ({ page }) => {
    // 5 vaka × (vaka, kontrol, görüntü, yanıt) sunucu gidiş-dönüşü: varsayılan 30 sn yetmez.
    test.setTimeout(120_000);
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    // T218: öğrenme kilidi — uygulama akışından önce öğrenme kaydı sunucuya yazılır.
    await completeLearn(page, "opaca");
    const caseBodies: string[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (/\/me\/sims\/opaca\/sessions\/[^/]+\/cases\/\d+$/.test(url) && response.request().method() === "GET") {
        caseBodies.push(await response.text().catch(() => ""));
      }
    });
    const clientAttempts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/me/gamification/opaca/attempts")) clientAttempts.push(request.url());
    });
    const before = await page.request.get("/api/me/gamification/opaca");
    const xpBefore = ((await before.json()) as { data: { xp: number } }).data.xp;
    const imageOk = page.waitForResponse((response) => /\/me\/sims\/opaca\/sessions\/[^/]+\/image\//.test(response.url()) && response.status() === 200);
    const checked = page.waitForResponse((response) => /\/me\/sims\/opaca\/sessions\/[^/]+\/cases\/\d+\/check$/.test(response.url()) && response.ok());
    const finished = page.waitForResponse((response) => /\/me\/sims\/opaca\/sessions\/[^/]+\/finish$/.test(response.url()));
    await page.goto("/#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible({ timeout: 20_000 });
    await startTopicPractice(root);
    // İlk vaka: yanıt ver → uygulama kontrolü (check) sunucuda yapılır; görüntü vekilden gelir.
    const completion = completeTopicPractice(root, "opaca");
    await checked;
    await imageOk;
    await completion;
    expect((await finished).ok(), "sunucu oturumu kapanışı").toBe(true);
    expect(caseBodies.length, "sunucudan gelen vaka").toBeGreaterThan(0);
    for (const body of caseBodies) expect(body).not.toMatch(/"correct"|feedbackCorrect|targetFinding|\.webp|runtimeUrl|sourceFile|clinicalDiagnosis/);
    expect(clientAttempts, "istemci deneme yazmaz (sunucu yazar)").toEqual([]);
    const after = await page.request.get("/api/me/gamification/opaca");
    expect(((await after.json()) as { data: { xp: number } }).data.xp).toBeGreaterThan(xpBefore);
  });

  test("Ausculta uygulaması sunucu oturumundan gelir: anahtarsız vaka, sunucu puanı ve denemesi (A1.4, ADR-009)", async ({ page }) => {
    // 5 vaka × (vaka, kontrol, yanıt) sunucu gidiş-dönüşü: seri koşuda varsayılan 30 sn yetmez.
    test.setTimeout(90_000);
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    // T209: öğrenme kilidi — uygulama akışından önce öğrenme kaydı sunucuya yazılır.
    await completeLearn(page, "ausculta");
    const caseBodies: string[] = [];
    const clientAttempts: string[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (/\/me\/sims\/ausculta\/sessions\/[^/]+\/cases\/\d+$/.test(url) && response.request().method() === "GET") {
        caseBodies.push(await response.text().catch(() => ""));
      }
    });
    page.on("request", (request) => {
      if (request.url().includes("/me/gamification/ausculta/attempts")) clientAttempts.push(request.url());
    });
    const before = await page.request.get("/api/me/gamification/ausculta");
    const xpBefore = ((await before.json()) as { data: { xp: number } }).data.xp;
    const finished = page.waitForResponse((response) => /\/me\/sims\/ausculta\/sessions\/[^/]+\/finish$/.test(response.url()));
    await page.goto("/#/sims/ausculta");
    const root = page.locator(".eg-sim-ausculta").first();
    await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible({ timeout: 20_000 });
    await startTopicPractice(root);
    await completeTopicPractice(root, "ausculta");
    expect((await finished).ok(), "sunucu oturumu kapanışı").toBe(true);
    expect(caseBodies.length, "sunucudan gelen vaka").toBeGreaterThan(0);
    for (const body of caseBodies) expect(body).not.toMatch(/"correct"|feedbackCorrect|\.wav|acousticFinding/);
    expect(clientAttempts, "istemci deneme yazmaz (sunucu yazar)").toEqual([]);
    const after = await page.request.get("/api/me/gamification/ausculta");
    expect(((await after.json()) as { data: { xp: number } }).data.xp).toBeGreaterThan(xpBefore);
  });

  test("Meydan Okuma: kod ile davet, iki öğrenci aynı vakaları oynar, sonuç ve kazanan görünür (ADR-010)", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    // 1) Admin ikinci bir geliştirme öğrencisi oluşturur (Ausculta erişimli).
    const adminContext = await browser.newContext(baseURL === undefined ? {} : { baseURL });
    const admin = await adminContext.newPage();
    await admin.goto(ADMIN_ENTRY);
    await signIn(admin, "admin");
    await expect(admin).toHaveURL(/#\/admin$/);
    const csrf = (await adminContext.cookies()).find((cookie) => cookie.name === CSRF_COOKIE)?.value ?? "";
    const username = `duello.${randomUUID().slice(0, 8)}`;
    const created = await admin.request.post("/api/admin/users", {
      headers: { "x-csrf-token": csrf },
      data: { username, displayName: "Düello Rakibi", authMethod: "dev", role: "kullanici", simAccess: ["ausculta"] },
    });
    expect(created.ok(), "ikinci öğrenci").toBe(true);
    await adminContext.close();

    // 2) Öğrenci A kod oluşturur (önce öğrenme modu tamamlanır).
    await page.goto(STUDENT_ENTRY);
    await signIn(page, "ogrenci");
    await expect(page).toHaveURL(/#\/$/);
    await completeLearn(page, "ausculta");
    await page.goto("/#/meydan-okuma");
    await page.getByRole("button", { name: "Kod oluştur" }).click();
    const code = (await page.locator(".eg-shell-duel__codeValue").first().innerText()).trim();
    expect(code).toMatch(/^[0-9]{6}$/);
    await captureRouteScreenshot(page, testInfo.project.name, "#/meydan-okuma kod");

    // 3) Öğrenci B kodla katılır.
    const rivalContext = await browser.newContext(baseURL === undefined ? {} : { baseURL });
    const rival = await rivalContext.newPage();
    // Giriş ekranı yalnız sabit geliştirme hesaplarını kabul eder; ikinci öğrenci
    // sayfa kökeninden doğrudan `/auth/dev/login` ile oturum açar.
    await rival.goto(STUDENT_ENTRY);
    const login = await rival.evaluate(async (name) => {
      const response = await fetch("/api/auth/dev/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      return response.status;
    }, username);
    expect(login, "ikinci öğrenci girişi").toBe(200);
    // Kabuk oturumu açılışta `/auth/me` ile geri yükler; hash değişimi yeniden yüklemez.
    await rival.goto("/#/meydan-okuma");
    await rival.reload();
    await completeLearn(rival, "ausculta");
    await rival.getByLabel("6 haneli kod").fill(code);
    await rival.getByRole("button", { name: "Katıl" }).click();
    await expect(rival).toHaveURL(/#\/meydan-okuma\/[0-9a-f-]{36}$/);
    await expect(rival.getByText("Devam ediyor")).toBeVisible();

    /** Düello oturumunu (10 vaka, değerlendirme arayüzü) sonuna kadar oynar. */
    async function playDuel(target: Page, correctFirst: boolean): Promise<void> {
      await target.getByRole("button", { name: "Şimdi oyna" }).click();
      const root = target.locator(".eg-sim-ausculta").first();
      await expect(root.getByText("Meydan Okuma.", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      const report = target.getByRole("heading", { name: "Değerlendirme Tamamlandı" });
      for (let step = 0; step < 120; step += 1) {
        if ((await report.count()) > 0) break;
        const options = root.locator(".opt");
        if ((await options.count()) > 0) {
          await options.nth(correctFirst ? 0 : (await options.count()) - 1).click();
          await root.locator(".q-nav button.btn").first().click();
        }
        await target.waitForTimeout(120);
      }
      await expect(report).toBeVisible({ timeout: 20_000 });
      await target.getByRole("button", { name: "Düello sonucunu gör" }).click();
      await expect(target).toHaveURL(/#\/meydan-okuma\/[0-9a-f-]{36}$/);
    }

    // 4) A oynar → rakibi bekler; puanlar gizli.
    await rival.close();
    await page.goto(`/#/meydan-okuma`);
    await page.locator(".eg-shell-duel__rowLink").first().click();
    await playDuel(page, true);
    await expect(page.getByText("Rakibin bitirmesi bekleniyor", { exact: false })).toBeVisible();

    // 5) B oynar → iki tarafta sonuç ve kazanan şeridi.
    const rivalAgain = await rivalContext.newPage();
    await rivalAgain.goto("/#/meydan-okuma");
    await rivalAgain.locator(".eg-shell-duel__rowLink").first().click();
    await playDuel(rivalAgain, false);
    await expect(rivalAgain.locator(".eg-shell-duel__banner")).toBeVisible();
    await page.getByRole("button", { name: "Yenile" }).click();
    await expect(page.locator(".eg-shell-duel__banner")).toBeVisible();
    await captureRouteScreenshot(page, testInfo.project.name, "#/meydan-okuma/sonuc");
    const scores = await page.locator(".eg-shell-duel__stats dd").allInnerTexts();
    expect(scores.filter((value) => value !== "—").length).toBeGreaterThanOrEqual(2);
    await rivalContext.close();
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
    const root = await openPulseQuiz(page);
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
    await clickSimBarAction(page, "İlerlemem");
    await expect(page.getByRole("button", { name: /Ritim izleyicisi.*kazanıldı/i }).first()).toBeVisible();
    await expect(page.getByText("Demo verisi")).toHaveCount(0);
  });
});

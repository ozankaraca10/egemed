import { expect, test, type Locator, type Page } from "@playwright/test";
import { fillAdminFilter, openRoute, trackErrors } from "./helpers";
import { completeTopicPractice, giveAnswer, startTopicPractice, submitAnswer } from "./sim-flows";

/**
 * T155 — kullanıcı kabul (UAT) yolculukları ve zor koşullar (geliştirme/sahte
 * veri modu, API gerektirmez). Yalnız rol/etiket/metin tabanlı seçiciler
 * kullanılır (arayüz premium bileşenlere taşınıyor; CSS sınıfı seçicisi
 * yalnız mevcut sim kökleri ve `sim-flows.ts`/`helpers.ts` yardımcılarında
 * kalır). Her senaryo mevcut davranışı doğrular; bir senaryo gerçek bir hata
 * ortaya çıkarırsa test DÜZ bırakılır (test.fail KULLANILMAZ) ve
 * `.egemed-run/summary.md`de BULGU olarak raporlanır.
 */

const ADMIN_ENTRY = "/#/giris/admin";
const STUDENT_ENTRY = "/#/giris/test-ogrenci";
const SIMBAR = ".eg-shell-simbar";

/** Vite dev sunucusunun HMR soketi her tam sayfa geçişinde/offline sırasında
 *  düşer; bu gürültü uygulama hatası değildir (bkz. admin.spec.ts `openAdmin`). */
function appErrors(errors: readonly string[]): string[] {
  return errors.filter((error) => !error.includes("WebSocket connection to 'ws://"));
}

async function signInStudent(page: Page): Promise<void> {
  await page.goto(STUDENT_ENTRY);
  await page.fill("#entry-username", "ogrenci");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/$/);
}

async function signInAdmin(page: Page): Promise<void> {
  await page.goto(ADMIN_ENTRY);
  await page.fill("#entry-username", "admin");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/admin$/);
}

/** Birleşik bardaki sim eylemini tıklatır (sims-a11y.spec.ts deseni). */
async function openSimBarAction(page: Page, label: string): Promise<void> {
  await page.locator(SIMBAR).getByRole("button", { name: label }).click();
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, "yatay kaydırma").toBe(false);
}

/** Odaklı düğüme/bağlantıya ulaşana dek Tab basar; bulamazsa hata fırlatır. */
async function tabUntil(
  page: Page,
  matches: (focused: Locator) => Promise<boolean>,
  maxSteps = 40,
): Promise<Locator> {
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    if ((await focused.count()) > 0 && (await matches(focused))) return focused;
  }
  throw new Error("Klavye ile hedef odak bulunamadı");
}

async function activeElementTag(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.tagName ?? "BODY");
}

test.describe("T155 UAT yolculukları", () => {
  test("1. Öğrenci yolculuğu: giriş → Simülatörler → Opaca öğren/uygula → sonuç → İlerlemem → Simülatörler'e dön, oturum korunur", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await signInStudent(page);
    await page.locator("nav").getByRole("link", { name: "Simülatörler", exact: true }).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.getByRole("heading", { name: "Simülatörler", exact: true })).toBeVisible();

    // Simülatörler listesinde birden fazla "#/sims/opaca" bağlantısı olabilir
    // (sim kartı + öğrencide "İlerlemem" boş durum bağlantısı); dış liste
    // bölümü de "Opaca" başlığını (iç içe) içerdiğinden yalnız "has" filtresi
    // yetmez — "Pulse" başlığını İÇERMEYEN bölüm tam olarak Opaca kartıdır.
    const opacaSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Opaca", exact: true }) })
      .filter({ hasNot: page.getByRole("heading", { name: "Pulse", exact: true }) });
    await opacaSection.getByRole("link", { name: "Simülatörü aç" }).click();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    const root = page.locator(".eg-sim-opaca").first();
    await expect(root).toBeVisible();
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible();

    await startTopicPractice(root);
    await completeTopicPractice(root, "opaca");
    await expect(page.getByRole("heading", { name: "Vaka Raporu", exact: true })).toBeVisible();

    await openSimBarAction(page, "İlerlemem");
    await expect(page.getByRole("tab", { name: "Başarılarım" })).toBeVisible();

    await page.getByRole("link", { name: "Simülatörlere dön" }).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-opaca")).toHaveCount(0);

    // Oturum korunur: hesap menüsü hâlâ öğrenci oturumunu gösterir, girişe düşülmez.
    // Ad/rol metni yalnız ≥1024 px genişlikte görünür (shell.css); aria-label
    // her genişlikte mevcuttur, bu yüzden buton erişilebilir adıyla doğrulanır.
    await expect(page.getByRole("button", { name: /Hesap menüsü: Sahte test öğrencisi/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toHaveCount(0);

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("2. Tarayıcı geri/ileri: sim ortasında geri ana sayfaya döner, ileri tek kökle sim'i yeniden açar", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await signInStudent(page);
    await page.locator('a[href="#/sims/opaca"]').first().click();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    const root = page.locator(".eg-sim-opaca").first();
    await expect(root).toBeVisible();
    // Sim modülü kendi kapsayıcısını kabuğun sim sayfası kökü içine gömer
    // (T14c, `.eg-sim-opaca` iç içe iki kez eşleşir; bkz. helpers.ts `openRoute`
    // yorum satırı); referans temel sayı ilk açılışta alınır.
    const baselineRootCount = await page.locator(".eg-sim-opaca").count();
    // Oturum ortasına gir (mod seçimi + öğrenme ekranından bir soru).
    await startTopicPractice(root);
    await expect(root.locator(".q-card-dark").first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole("heading", { name: "İlerlemem" })).toBeVisible();
    await expect(page.locator(".eg-sim-opaca")).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    // Çift kök yok: ileri gidince sim yeniden aynı (iç içe) kök sayısıyla açılır,
    // ikiye katlanmaz (ör. 4 yerine 2).
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible();
    await expect(page.locator(".eg-sim-opaca")).toHaveCount(baselineRootCount);

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("3. Sayfa yenileme ortasında: 1 soru yanıtla → reload → sim açılır, hata yok, oturum korunur", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await signInStudent(page);
    await page.locator('a[href="#/sims/opaca"]').first().click();
    const root = page.locator(".eg-sim-opaca").first();
    await expect(root).toBeVisible();
    await startTopicPractice(root);
    await giveAnswer(root, "opaca");
    await submitAnswer(root);

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    // Kullanıcı hâlâ oturumda: girişe düşülmedi, hesap menüsü öğrenci oturumunu gösterir.
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Hesap menüsü/ })).toBeVisible();

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("4. Çift tıklama/çift gönderim: yanıt gönder düğmesine hızlı iki tık → tek geri bildirim, akış bozulmaz", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await openRoute(page, "#/sims/opaca");
    const root = page.locator(".eg-sim-opaca").first();
    await startTopicPractice(root);
    await giveAnswer(root, "opaca");

    const submitButton = root.locator(".q-nav button.btn.primary");
    await submitButton.dblclick();

    // Tek geri bildirim paneli görünür; çiftlenmiş/kayıp durum yoktur.
    await expect(root.locator(".feedback-head")).toHaveCount(1);
    await expect(root.locator(".feedback-head").first()).toBeVisible();

    // Akış bozulmadı: bir sonraki adıma normal şekilde ilerlenebilir.
    const nextState = root
      .locator(".q-card-dark")
      .first()
      .or(root.locator(".case-end-card"))
      .or(page.getByRole("heading", { name: "Vaka Raporu", exact: true }));
    await root.locator(".q-nav button.btn.primary").click();
    await expect(nextState.first()).toBeVisible();

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("5. Yalnız klavye: Tab/Enter ile Simülatörler'e ve bir sim kartına gidip simi açma (fare yok)", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await page.goto("/#/");
    await expect(page.locator("main").first()).toBeVisible();

    const simulatorsLink = await tabUntil(page, async (focused) => {
      const tag = await focused.evaluate((element) => element.tagName).catch(() => "");
      const text = ((await focused.textContent().catch(() => "")) ?? "").trim();
      return tag === "A" && text === "Simülatörler";
    });
    await expect(simulatorsLink).toBeFocused();
    expect(await activeElementTag(page), "odak görünür").not.toBe("BODY");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/simulatorler$/);
    expect(await activeElementTag(page), "rota değişince odak görünür").not.toBe("BODY");

    const openSimLink = await tabUntil(page, async (focused) => {
      const text = ((await focused.textContent().catch(() => "")) ?? "").trim();
      return text === "Simülatörü aç";
    });
    await expect(openSimLink).toBeFocused();
    expect(await activeElementTag(page), "odak görünür").not.toBe("BODY");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(".egemed-pulse-runtime").first()).toBeVisible();
    expect(await activeElementTag(page), "sim açılınca odak görünür").not.toBe("BODY");

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("6. 320 px yeniden akış (WCAG 1.4.10): ana sayfa, Simülatörler, sim mod seçimi, admin kullanıcı listesi — yatay kaydırma yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.setViewportSize({ width: 320, height: 640 });

    await openRoute(page, "#/");
    await assertNoHorizontalScroll(page);

    await openRoute(page, "#/simulatorler");
    await assertNoHorizontalScroll(page);

    await page.locator('a[href="#/sims/opaca"]').click();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible();
    await assertNoHorizontalScroll(page);

    await signInAdmin(page);
    await page.getByRole("link", { name: "Kullanıcı listesini aç" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
    await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();
    await assertNoHorizontalScroll(page);

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("7. Azaltılmış hareket ve zorunlu renkler: ana sayfa ve bir sim açılır, odak görünür, hata yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });

    await openRoute(page, "#/");
    await page.keyboard.press("Tab");
    expect(await activeElementTag(page), "ana sayfada odak görünür").not.toBe("BODY");

    await openRoute(page, "#/sims/ausculta");
    await expect(page.locator(".eg-sim-ausculta").first()).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await activeElementTag(page), "sim açıkken odak görünür").not.toBe("BODY");

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("8. Oturumsuz derin bağlantı: #/admin/kullanicilar girişe yönlenir, #/sims/pulse (mevcut davranış) doğrudan açılır; giriş sonrası hedef belgelenir", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    // Korumalı admin rotası: oturum yoksa giriş ekranına yönlenir.
    await page.goto("/#/admin/kullanicilar");
    await expect(page).toHaveURL(/#\/giris\/admin$/);
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toBeVisible();

    // Sim rotası: MEVCUT DAVRANIŞ — `sessionAllowsSim` oturumsuz gezinmeyi
    // sınırsız kabul eder (apps/shell/src/session.ts), bu yüzden #/sims/pulse
    // girişe yönlenmeden doğrudan açılır. Bu, korumalı admin rotalarından
    // farklı ve kasıtlı bir tasarım kararıdır (bkz. yorum satırı), test bunu
    // olduğu gibi doğrular/belgeler.
    await page.goto("/#/sims/pulse");
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(".egemed-pulse-runtime").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toHaveCount(0);

    // Giriş sonrası hedef: sabit `entryRedirectHref` hedefine gidilir
    // (admin → #/admin); orijinal derin bağlantı (#/admin/kullanicilar)
    // korunmaz — bu da mevcut, belgelenen davranıştır.
    await signInAdmin(page);
    await expect(page.getByRole("heading", { name: "Yönetici paneli" })).toBeVisible();

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("9. Admin yolculuğu (sahte veri): Kullanıcılar → ara → ayrıntı → askıya al → durum değişir → etkinleştir; kendi hesap koruması belgelenir (T150)", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await signInAdmin(page);
    await page.getByRole("link", { name: "Kullanıcı listesini aç" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
    await expect(page.getByRole("heading", { name: "Kullanıcılar" })).toBeVisible();

    await fillAdminFilter(page, "Ara", "ornek.kullanici.002");
    await expect(page.getByText("1–1 / 1 kayıt")).toBeVisible();
    await page.getByRole("link", { name: "Örnek Kullanıcı 002" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar\/user-002$/);
    await expect(page.getByRole("heading", { name: "Örnek Kullanıcı 002" })).toBeVisible();
    const general = page.getByRole("tabpanel", { name: "Genel" });

    await page.getByRole("button", { name: "Askıya al" }).click();
    const suspendDialog = page.getByRole("dialog");
    await expect(suspendDialog.getByRole("heading", { name: "Kullanıcıyı askıya al" })).toBeVisible();
    await suspendDialog.getByRole("button", { name: "Askıya al" }).click();
    await expect(general.getByText("Askıda")).toBeVisible();
    await expect(page.getByRole("button", { name: "Etkinleştir" })).toBeVisible();

    await page.getByRole("button", { name: "Etkinleştir" }).click();
    const activateDialog = page.getByRole("dialog");
    await expect(activateDialog.getByRole("heading", { name: "Kullanıcıyı etkinleştir" })).toBeVisible();
    await activateDialog.getByRole("button", { name: "Etkinleştir" }).click();
    // Rozet metni ekran okuyucu için gizli bir ton öneki taşır (Badge.tsx, T151:
    // "Başarılı: Etkin"); tam eşleşme yerine alt dize aranır.
    await expect(general.getByText("Etkin")).toBeVisible();
    await expect(page.getByRole("button", { name: "Askıya al" })).toBeVisible();

    // Kendi hesabında askıya al/sil görünmez (T150): koruma `detail.id ===
    // currentUserId` karşılaştırmasına dayanır (UserDetailPage.tsx:232/237),
    // oturum kimliği `dev-admin-0001`dir (devAuth.ts). Sahte veri kaynağı
    // yalnız `user-001..240` kayıtları üretir (usersDataSource.ts), bu yüzden
    // "kendi hesap" kaydı listede YOKTUR ve doğrudan bu id ile açılan ayrıntı
    // sayfası "bulunamadı" döner — koruma bu ortamda UI üzerinden asla
    // tetiklenemez (önceden admin.spec.ts:319-322'de de belgelenmiştir; bu
    // yeni bir bulgu değil, geliştirme modu sahte veri sınırlamasıdır).
    await page.goto("/#/admin/kullanicilar/dev-admin-0001");
    // "Kullanıcı bulunamadı" burada <p> olarak çizilir (heading değil).
    await expect(page.getByText("Kullanıcı bulunamadı")).toBeVisible();
    await expect(page.getByRole("button", { name: "Askıya al" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sil" })).toHaveCount(0);

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });

  test("10. Ağ kesintisi (dev modu): offline iken sayfa geçişi uygulamayı çökertmez (beyaz ekran yok, h1 görünür)", async ({
    page,
  }) => {
    const errors = trackErrors(page);

    await openRoute(page, "#/");
    await page.context().setOffline(true);
    try {
      await page.locator("nav").getByRole("link", { name: "Simülatörler", exact: true }).click();
      await expect(page).toHaveURL(/#\/simulatorler$/);
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
      await expect(heading).toHaveText("Simülatörler");
      const bodyText = (await page.evaluate(() => document.body.innerText)).trim();
      expect(bodyText.length, "beyaz ekran yok").toBeGreaterThan(0);
    } finally {
      await page.context().setOffline(false);
    }

    expect(appErrors(errors), "konsol/sayfa hatası").toEqual([]);
  });
});

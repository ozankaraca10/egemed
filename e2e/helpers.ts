import { expect, type Locator, type Page } from "@playwright/test";

/** T09 kapsamı: tüm kabuk rotaları (bilinmeyen rota dâhil). */
export const ROUTES = [
  { hash: "#/", label: "ana sayfa" },
  { hash: "#/simulatorler", label: "simülatörler" },
  { hash: "#/giris/admin", label: "yönetici girişi" },
  { hash: "#/giris/test-ogrenci", label: "test öğrencisi girişi" },
  { hash: "#/sims/opaca", label: "opaca sim rotası" },
  { hash: "#/sims/ausculta", label: "ausculta sim rotası" },
  { hash: "#/sims/pulse", label: "pulse sim rotası" },
  { hash: "#/bilinmeyen-rota", label: "bilinmeyen rota" },
] as const;

/**
 * Sim rotalarının paket kökü (T14c: Opaca, T14d: Pulse, T14e: Ausculta).
 * Üç sim de gerçek modüllerine bağlandığı için `openRoute` her sim rotasında
 * sim paketinin kendi kökünü bekler; kabuk içi yer tutucu kalmamıştır.
 */
const LIVE_SIM_ROOT_SELECTORS: Readonly<Record<string, string>> = {
  "#/sims/ausculta": ".eg-sim-ausculta",
  "#/sims/opaca": ".eg-sim-opaca",
  "#/sims/pulse": ".egemed-pulse-runtime",
};

/** Konsol ve sayfa hatalarını toplar; testin sonunda boş olması beklenir. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/**
 * Hash rotasını açar; kabuk çizilene dek bekler. Kabuğa gerçek modülü
 * bağlanmış sim rotaları (T14c: Opaca, T14d: Pulse, T14e: Ausculta) kendi
 * paket kökünü bekler.
 */
export async function openRoute(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`, { waitUntil: "networkidle" });
  // Gerçek modüller kendi `<main>` iskelesini kabuğun `<main id="icerik">`si
  // içine gömer (iç içe, T14c/T14d/T14e); `.first()` her rotada kabuğun kendi
  // bölgesini bekler.
  await expect(page.locator("main").first()).toBeVisible();
  const liveRootSelector = LIVE_SIM_ROOT_SELECTORS[hash];
  if (liveRootSelector !== undefined) {
    // Kaynak paket kapsayıcısı ve gerçek modül kökü aynı sınıfı paylaşabilir
    // (iç içe); `.first()` ilkini görünür bekler.
    await expect(page.locator(liveRootSelector).first()).toBeVisible();
    // Sim host hazır olunca opaklık geçişiyle belirir (T107); axe/renk ölçümleri
    // geçiş sırasında yarı saydam okuyup kararsızlaşmasın diye tam opaklık beklenir.
    await page.waitForFunction(() => {
      const host = document.querySelector(".eg-shell-sim-page__host");
      return host === null || getComputedStyle(host).opacity === "1";
    });
  }
}

/**
 * Admin liste filtreleri (T156, `UsersPage`/`AuditPage`): masaüstünde (≥768 px)
 * yatay çubukta hep görünür, <768 px'te "Filtreler" düğmesiyle açılan `Dialog`
 * içindedir (CSS'e göre ikisinden yalnız biri erişilebilir ağaçtadır). Bu
 * yardımcılar hangi görünümde çalıştığını fark etmeden alan doldurur;
 * diyalog açıldıysa alan işlemi sonrası kapatır (arka plandaki tablo/sayfalama
 * ile devam eden adımlar diyalog kaplamasının arkasında kalmasın diye).
 */
/** Kırılım noktası shell.css ile aynıdır (`.eg-shell-adminlist__filtertrigger`, 768 px). */
const ADMIN_FILTER_MOBILE_BREAKPOINT = 768;

/**
 * Görünürlüğe (`.isVisible()`) değil, yapılandırılan viewport genişliğine bakar: rota
 * geçişinin hemen ardından bir DOM anlık görüntüsü henüz yerleşmemişken `.isVisible()`
 * yanlış `false` dönebiliyordu (T156 e2e kararsızlığı) — genişlik karşılaştırması yarışsız.
 */
function isMobileFiltersViewport(page: Page): boolean {
  const size = page.viewportSize();
  return size !== null && size.width < ADMIN_FILTER_MOBILE_BREAKPOINT;
}

async function openAdminFilters(page: Page): Promise<boolean> {
  if (!isMobileFiltersViewport(page)) return false;
  // Rol/ada göre eşleşme "Filtreleri temizle" düğmesiyle çakışır (alt dize) ve etkin
  // filtre rozeti sayıyı ada eklediğinde tam eşleşme de kırılganlaşır; bu yüzden
  // mobil tetikleyici sarmalayıcı sınıfıyla (`UsersPage.tsx`/`AuditPage.tsx`) hedeflenir.
  const trigger = page.locator(".eg-shell-adminlist__filtertrigger").getByRole("button");
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return true;
}

async function closeAdminFilters(page: Page, opened: boolean): Promise<void> {
  if (!opened) return;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

function adminFilterScope(page: Page, opened: boolean): Page | Locator {
  return opened ? page.getByRole("dialog") : page;
}

/** Metin/tarih filtre alanını doldurur (ör. "Ara", "Aktör", "Bitiş"). Tarih alanları
 *  (`DateField`, T161) doğrulamayı blur'da yaptığı için `fill()` sonrası açıkça
 *  blur tetiklenir — diyalog kapatan `Escape` bu garantiyi masaüstünde vermez. */
export async function fillAdminFilter(page: Page, label: string, value: string): Promise<void> {
  const opened = await openAdminFilters(page);
  const field = adminFilterScope(page, opened).getByLabel(label);
  await field.fill(value);
  await field.blur();
  await closeAdminFilters(page, opened);
}

/** `@egemed/ui` `Select` (Radix) filtre alanını seçenek adıyla ayarlar; native
 *  `<select>`in `selectOption`i yerine geçer (filtre alanları artık bu bileşeni kullanır). */
export async function selectAdminFilterOption(
  page: Page,
  label: string,
  optionName: string | RegExp,
): Promise<void> {
  const opened = await openAdminFilters(page);
  await adminFilterScope(page, opened).getByLabel(label).click();
  await page.getByRole("option", { name: optionName }).click();
  await closeAdminFilters(page, opened);
}

/** `@egemed/ui` `Select` (Radix) alanını, verilen kapsam (diyalog/sayfa) içinde
 *  etiketiyle bulup seçenek adıyla ayarlar; native `<select>`in `selectOption`i
 *  yerine geçer (filtre dışı formlar — kullanıcı ekle, toplu düzenleme, içe aktarma
 *  eşleme tablosu — artık bu bileşeni kullanır, T163). Açılır liste Portal ile
 *  belgeye eklendiği için seçenek `scope.page()` üzerinden aranır. */
export async function selectRadixOption(scope: Locator, label: string, optionName: string | RegExp): Promise<void> {
  await scope.getByLabel(label).click();
  await scope.page().getByRole("option", { name: optionName }).click();
}

/** Filtre panelindeki bir düğmeyi (ör. "Filtreleri temizle") tıklar. */
export async function clickAdminFilterButton(page: Page, name: string): Promise<void> {
  const opened = await openAdminFilters(page);
  await adminFilterScope(page, opened).getByRole("button", { name }).first().click();
  await closeAdminFilters(page, opened);
}

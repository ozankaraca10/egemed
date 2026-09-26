import { expect, type Page } from "@playwright/test";

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

import { expect, type Page } from "@playwright/test";

/** T09 kapsamı: tüm kabuk rotaları (bilinmeyen rota dâhil). */
export const ROUTES = [
  { hash: "#/", label: "ana sayfa" },
  { hash: "#/simulatorler", label: "simülatörler" },
  { hash: "#/gorevler", label: "görevler" },
  { hash: "#/not-defteri", label: "not defteri" },
  { hash: "#/giris/admin", label: "yönetici girişi" },
  { hash: "#/giris/test-ogrenci", label: "test öğrencisi girişi" },
  { hash: "#/sims/opaca", label: "opaca sim rotası" },
  { hash: "#/bilinmeyen-rota", label: "bilinmeyen rota" },
] as const;

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
 * Hash rotasını açar; kabuk çizilene dek bekler. Opaca gerçek modüle
 * bağlandı (T14c): kendi kökü (`.eg-sim-opaca`) beklenir. Pulse/ausculta
 * S15a/S18a'ya dek yer tutucuda kaldığı için o kökü bekler.
 */
export async function openRoute(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`, { waitUntil: "networkidle" });
  // Opaca kendi `<main>` iskelesini kabuğun `<main id="icerik">`si içine
  // gömer (iç içe, T14c); `.first()` her rotada kabuğun kendi bölgesini
  // bekler.
  await expect(page.locator("main").first()).toBeVisible();
  if (hash === "#/sims/opaca") {
    // Kaynak paket kapsayıcısı ve `App` kökü aynı sınıfı paylaşır (iç içe).
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible();
  } else if (hash.startsWith("#/sims/")) {
    await expect(page.locator(".eg-shell-sim-placeholder")).toBeVisible();
  }
}

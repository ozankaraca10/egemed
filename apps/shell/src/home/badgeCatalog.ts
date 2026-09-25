/**
 * T114 — sunucu rozet anahtarını katalog tanımıyla eşler (ADR-008 S4, kabuk
 * kısmı). API oturumunda dashboard, rozet anahtarını katalog adı/kısa
 * açıklamasıyla gösterir; katalogda olmayan anahtar sessizce atlanır.
 * Sahte oturum bu modülü kullanmaz (mevcut ham anahtar davranışı korunur).
 * Simler arası toplam yoktur (ADR-006): her kayıt yalnız kendi siminin
 * kataloğuna bakar.
 */
import { AUSCULTA_BADGES, OPACA_BADGES, PULSE_BADGES } from "@egemed/gami-catalogs";
import type { SimId } from "@egemed/contracts";

/** Dashboard'un gösterdiği katalog tanımı kırpığı (rule/progress vb. gerekmez). */
export interface BadgeCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

const CATALOGS: Readonly<Record<SimId, readonly BadgeCatalogEntry[]>> = {
  pulse: PULSE_BADGES,
  ausculta: AUSCULTA_BADGES,
  opaca: OPACA_BADGES,
};

/** Simin katalog uzunluğu: "x / toplam rozet" sayacının paydası. */
export function badgeCatalogSize(simId: SimId): number {
  return CATALOGS[simId].length;
}

/** Anahtarı katalog tanımıyla eşler; katalogda yoksa `undefined` (sessiz atlama). */
export function catalogBadge(simId: SimId, key: string): BadgeCatalogEntry | undefined {
  return CATALOGS[simId].find((def) => def.id === key);
}

import { LIBRARY_ITEMS } from "../data/terminology";

/**
 * T175 — ziyaretçi (hesapsız) kitle için Öğrenme modu içerik sınırı (depo sahibi kararı,
 * 26 Eylül 2026): "ilk kategori (normaller) + 2 görüntü" — Pulse (normal + 2 EKG) ve
 * Ausculta (normal + 2 kategoriden birer ses) ile aynı kalıp. İlk kategori `technique`
 * ("Temel okuma": sistematik okuma, projeksiyon, lateral, normal grafi) tamamen açık; ek olarak
 * sonraki iki kategorinin ilk bulgusu (pnömotoraks, hava boşluğu opasitesi) açık. Diğer tüm
 * konular listede görünür kalır ama kilitlidir. Saf modül — UI yalnız `isVisitorUnlocked` sorgular.
 */
export const VISITOR_UNLOCKED_ITEM_KEYS: readonly string[] = [
  "technique.systematic",
  "technique.projection",
  "technique.lateral",
  "finding.normal",
  "finding.pneumothorax",
  "finding.airspace_opacity",
];

/** Derleme zamanı değil ama modül yüklenirken doğrulanan sağlamlık kontrolü: sabit
 *  kimlikler `library.json`teki gerçek konularla eşleşmezse veri güncellemesi hatası erken yakalanır. */
const KNOWN_KEYS = new Set(LIBRARY_ITEMS.map((it) => it.key));
for (const key of VISITOR_UNLOCKED_ITEM_KEYS) {
  if (!KNOWN_KEYS.has(key)) {
    throw new Error(`visitorAccess: bilinmeyen kütüphane anahtarı '${key}'`);
  }
}

/** Ziyaretçi kitlesi bu konu için içeriği açabilir mi (kilit mantığı, tek kaynak). */
export function isVisitorUnlocked(itemKey: string): boolean {
  return VISITOR_UNLOCKED_ITEM_KEYS.includes(itemKey);
}

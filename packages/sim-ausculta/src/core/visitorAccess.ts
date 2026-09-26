/**
 * Ziyaretçi (hesapsız) kitlesi için Öğrenme modunda açık içerik kimlikleri.
 * Depo sahibi kararı (T174): normal ses + kataloğun ilk 2 kategorisinden
 * birer normal-olmayan ses (her kategorinin ilk normal-olmayan sesi).
 * Liste sabit ve açıktır (id ile); veri JSON'undan türetilmez ki denetlenebilir
 * kalsın. UI yalnız `isVisitorUnlocked` üzerinden sorgular.
 */
export const VISITOR_UNLOCKED_LEARN_ITEMS: readonly string[] = [
  "heart.normal",
  "heart.s3",
  "lung.normal",
  "lung.wheezing",
];

/** Ziyaretçi bu öğrenme kütüphanesi öğesini açabilir mi? */
export function isVisitorUnlocked(itemKey: string): boolean {
  return VISITOR_UNLOCKED_LEARN_ITEMS.includes(itemKey);
}

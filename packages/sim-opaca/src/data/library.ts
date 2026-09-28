import { LIBRARY_ITEMS, libraryItem, type LibraryItem } from "./terminology";

/** Öğrenme kütüphanesi anahtar listesi (T218): kilit kararları (`core/learnLock`) ve
 *  "açıldı" kümesi bu sıralı listeden türetilir; öğe tanımları tek kaynak `terminology`de kalır. */

/** Sıralı öğe anahtarları: içerik sürümü ve açıldı kümesi bu listeye göre kurulur. */
export const LIBRARY_ITEM_KEYS: readonly string[] = LIBRARY_ITEMS.map((item) => item.key);

export const LIBRARY_ITEM_COUNT = LIBRARY_ITEM_KEYS.length;

/** Kütüphane boşsa veri hatasıdır; ilk öğe modül yüklenirken doğrulanır. */
export const FIRST_LIBRARY_ITEM: LibraryItem = (() => {
  const first = LIBRARY_ITEMS[0];
  if (!first) throw new Error("Kütüphane boş olamaz");
  return first;
})();

export function findLibraryItem(key: string): LibraryItem {
  return libraryItem(key) ?? FIRST_LIBRARY_ITEM;
}

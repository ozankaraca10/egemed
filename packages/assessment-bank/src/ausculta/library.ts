import libraryJson from "../../../sim-ausculta/src/data/library.json" with { type: "json" };
import type { CaseDef } from "./types";

/**
 * T214: öğrenme kütüphanesi (T209) anahtar çözümü — SUNUCU TARAFI. Kütüphane verisi
 * sim paketinde kalır ve buradan OKUNUR (ses manifestleri gibi; kod bağımlılığı değil
 * veri). Anahtar yalnız vaka BİTTİKTEN sonra sonuçla döner — `buildPublicCase`
 * çıktısına (vaka açılışında) asla girmez.
 */

/** Kütüphane öğesinin eşleme için gereken alanları. */
export interface LibraryItemRef {
  readonly key: string;
  readonly category: string;
  readonly acousticFinding: string;
}

const LIBRARY_ITEMS: readonly LibraryItemRef[] = (
  libraryJson as unknown as { groups: { items: LibraryItemRef[] }[] }
).groups.flatMap((group) => group.items);

/** Vakanın öğrenme kütüphanesi anahtarı: önce vakanın kendi `libraryKey` alanı, yoksa
 *  (ilk ses atamasının kategorisi + `primaryAcousticFinding`) eşleşmesi. Eşleşme yoksa
 *  null — istemci zayıf konu odağını kurmaz. Sim paketindeki eski `libraryKeyForCase`
 *  mantığının banka eşdeğeridir. */
export function libraryKeyForCase(caseDef: CaseDef): string | null {
  if (caseDef.libraryKey) return caseDef.libraryKey;
  const category = caseDef.soundAssignments[0]?.category;
  const match = LIBRARY_ITEMS.find((item) => item.category === category && item.acousticFinding === caseDef.primaryAcousticFinding);
  return match?.key ?? null;
}

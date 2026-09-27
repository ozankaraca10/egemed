import libraryData from "./library.json";

/** Öğrenme kütüphanesi kataloğu (T209): gruplar ve öğeler saf veriden türetilir;
 *  dinleme kaydı/kilit kararları `core/learnLock` bu anahtar listesini kullanır. */

export interface LibItem {
  key: string;
  category: string;
  acousticFinding: string;
  description: string;
  metaphor?: string;
  s1?: string;
  s2?: string;
  phase?: string;
  clinical: string;
  bestPoints: string[];
  group: string;
}

export interface LibGroup {
  id: string;
  title: string;
  items: LibItem[];
}

interface RawItem {
  key: string;
  category: string;
  acousticFinding: string;
  description: string;
  metaphor?: string;
  s1?: string;
  s2?: string;
  phase?: string;
  clinical: string;
  bestPoints: string[];
}

interface RawGroup {
  id: string;
  title: string;
  items: RawItem[];
}

function toItem(groupId: string, raw: RawItem): LibItem {
  const item: LibItem = {
    key: raw.key,
    category: raw.category,
    acousticFinding: raw.acousticFinding,
    description: raw.description,
    clinical: raw.clinical,
    bestPoints: raw.bestPoints,
    group: groupId,
  };
  if (raw.metaphor !== undefined) item.metaphor = raw.metaphor;
  if (raw.s1 !== undefined) item.s1 = raw.s1;
  if (raw.s2 !== undefined) item.s2 = raw.s2;
  if (raw.phase !== undefined) item.phase = raw.phase;
  return item;
}

export const LIBRARY_GROUPS: LibGroup[] = (libraryData.groups as RawGroup[]).map((group) => ({
  id: group.id,
  title: group.title,
  items: group.items.map((item) => toItem(group.id, item)),
}));

/** Sıralı öğe anahtarları: içerik sürümü ve dinlendi kümesi bu listeye göre kurulur. */
export const LIBRARY_ITEM_KEYS: readonly string[] = LIBRARY_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key),
);

export const LIBRARY_ITEM_COUNT = LIBRARY_ITEM_KEYS.length;

/** Kaynakta `heart.normal`; strict indeks için modül yüklenirken doğrulanan ilk öğe. */
export const FIRST_LIBRARY_ITEM: LibItem = (() => {
  const first = LIBRARY_GROUPS[0]?.items[0];
  if (!first) throw new Error("Kütüphane boş olamaz");
  return first;
})();

export function findLibraryItem(key: string): LibItem {
  for (const group of LIBRARY_GROUPS) {
    const found = group.items.find((item) => item.key === key);
    if (found) return found;
  }
  return FIRST_LIBRARY_ITEM;
}

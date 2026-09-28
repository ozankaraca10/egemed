import type { SimSessionMode } from "@egemed/contracts";
import { ITEMS, SESSION_SIZE } from "./data";
import type { PulseItem, PulseSection } from "./data";

/** Oturum başına madde sayısı (müfredat `sessionSize` ile aynı: 10). */
export const SESSION_CASE_COUNT = SESSION_SIZE;

/** Odaklı uygulama oturumu en fazla bu kadar madde içerir (öğrenme ekranı "bu EKG'de çalış"). */
export const FOCUS_CASE_COUNT = 5;

/** Mod havuzu: uygulama → `case`, değerlendirme/meydan okuma → `quiz` maddeleri. */
export function poolFor(mode: SimSessionMode): readonly PulseItem[] {
  const section: PulseSection = mode === "practice" ? "case" : "quiz";
  return ITEMS.filter((item) => item.section === section);
}

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function caseById(id: string): PulseItem | undefined {
  return BY_ID.get(id);
}

/** Havuzdan tekrar etmeyen `count` madde seçer; `focusMode` yalnız aynı EKG paternini tutar. */
export function selectCaseIds(mode: SimSessionMode, random: () => number, count = SESSION_CASE_COUNT, focusMode?: string): string[] {
  const pool = [...poolFor(mode)].filter((item) => focusMode === undefined || item.mode === focusMode);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pool[i] as PulseItem;
    pool[i] = pool[j] as PulseItem;
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length)).map((item) => item.id);
}

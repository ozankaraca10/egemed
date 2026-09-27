import type { SimSessionMode } from "@egemed/contracts";
import { ALL_CASES } from "./data";
import type { CaseDef } from "./types";

/** Oturum başına vaka sayısı (sim ile aynı: rastgele 10). */
export const SESSION_CASE_COUNT = 10;

/** Mod havuzu (sim `poolFor` ile aynı kural): değerlendirme yalnız doğrulanmış eşlemeli vakalar. */
export function poolFor(mode: SimSessionMode): readonly CaseDef[] {
  // Düello (challenge) değerlendirme havuzunu kullanır (doğrulanmış eşleme).
  if (mode !== "practice") return ALL_CASES.filter((c) => c.modes.includes("assessment") && c.mappingValidation === "validated");
  return ALL_CASES.filter((c) => c.modes.includes("practice"));
}

const BY_ID = new Map(ALL_CASES.map((c) => [c.id, c]));

export function caseById(id: string): CaseDef | undefined {
  return BY_ID.get(id);
}

/** Havuzdan tekrar etmeyen `count` vaka seçer; `random` kriptografik kaynaktan gelmelidir. */
/** Odaklı uygulama oturumu en fazla bu kadar vaka içerir (öğrenme ekranı "bu bulguda çalış"). */
export const FOCUS_CASE_COUNT = 5;

export function selectCaseIds(mode: SimSessionMode, random: () => number, count = SESSION_CASE_COUNT, focusFinding?: string): string[] {
  const pool = [...poolFor(mode)].filter((c) => focusFinding === undefined || c.primaryAcousticFinding === focusFinding);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pool[i] as CaseDef;
    pool[i] = pool[j] as CaseDef;
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length)).map((c) => c.id);
}

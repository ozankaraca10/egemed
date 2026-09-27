import type { SimSessionMode } from "@egemed/contracts";
import { ALL_CASES } from "./data";
import type { CaseDef } from "./types";

/** Oturum başına vaka sayısı (sim ile aynı: rastgele 10). */
export const SESSION_CASE_COUNT = 10;

/** Mod havuzu (sim `poolFor` ile aynı kural): değerlendirme yalnız doğrulanmış eşlemeli vakalar. */
export function poolFor(mode: SimSessionMode): readonly CaseDef[] {
  if (mode === "assessment") return ALL_CASES.filter((c) => c.modes.includes("assessment") && c.mappingValidation === "validated");
  return ALL_CASES.filter((c) => c.modes.includes("practice"));
}

const BY_ID = new Map(ALL_CASES.map((c) => [c.id, c]));

export function caseById(id: string): CaseDef | undefined {
  return BY_ID.get(id);
}

/** Havuzdan tekrar etmeyen `count` vaka seçer; `random` kriptografik kaynaktan gelmelidir. */
export function selectCaseIds(mode: SimSessionMode, random: () => number, count = SESSION_CASE_COUNT): string[] {
  const pool = [...poolFor(mode)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pool[i] as CaseDef;
    pool[i] = pool[j] as CaseDef;
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length)).map((c) => c.id);
}

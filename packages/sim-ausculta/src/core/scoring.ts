import type { CaseResult, ScoringWeights } from "./types";

/** Sunucunun döndürdüğü vaka sonuçlarını özetler (ADR-009: vaka puanı yalnız sunucuda,
 *  değerlendirme bankasında). İstemci tek vaka puanlamaz. */

export const MASTERY_THRESHOLD = 80;

/** Çoklu vaka toplamı (değerlendirme modu). Her vakanın ağırlık toplamı kendi domains.max'ında taşınır. */
export function aggregateResults(results: CaseResult[]): {
  total: number;
  mastery: boolean;
  domains: Record<keyof ScoringWeights, { earned: number; max: number }>;
} {
  const domains = {} as Record<keyof ScoringWeights, { earned: number; max: number }>;
  for (const r of results) {
    for (const key of Object.keys(r.domains) as (keyof ScoringWeights)[]) {
      const d = r.domains[key];
      if (!d) continue;
      const cur = domains[key] ?? { earned: 0, max: 0 };
      cur.earned += d.earned;
      cur.max += d.max;
      domains[key] = cur;
    }
  }
  let earned = 0;
  let max = 0;
  for (const d of Object.values(domains)) {
    earned += d.earned;
    max += d.max;
  }
  const total = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { total, mastery: total >= MASTERY_THRESHOLD, domains };
}

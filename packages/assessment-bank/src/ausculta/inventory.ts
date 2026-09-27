import { ALL_CASES } from "./data";
import { poolFor } from "./select";

/**
 * Yalnız SAYILARDAN oluşan vaka envanteri (sızıntı taşımaz): istemcinin kaynaklar
 * ekranı ve öğrenme ekranı bulgu kapsamı için. İstemci tarafındaki kopya
 * `packages/sim-ausculta/src/data/case-inventory.json`; eşitliği test korur.
 */
export interface AuscultaCaseInventory {
  readonly totalCases: number;
  readonly practicePoolSize: number;
  readonly assessmentPoolSize: number;
  readonly assessmentQuestions: number;
  readonly pediatricCases: number;
  readonly mixedCases: number;
  /** bulgu → { p: uygulama vakası sayısı, a: değerlendirme vakası sayısı } */
  readonly coverage: Readonly<Record<string, { readonly p: number; readonly a: number }>>;
}

export function caseInventory(): AuscultaCaseInventory {
  const coverage: Record<string, { p: number; a: number }> = {};
  for (const entry of ALL_CASES) {
    const row = coverage[entry.primaryAcousticFinding] ?? { p: 0, a: 0 };
    if (entry.modes.includes("practice")) row.p += 1;
    if (entry.modes.includes("assessment")) row.a += 1;
    coverage[entry.primaryAcousticFinding] = row;
  }
  const assessment = poolFor("assessment");
  return {
    totalCases: ALL_CASES.length,
    practicePoolSize: poolFor("practice").length,
    assessmentPoolSize: assessment.length,
    assessmentQuestions: assessment.reduce((sum, c) => sum + c.questions.length, 0),
    pediatricCases: ALL_CASES.filter((c) => (c as { population?: string }).population === "pediatrik").length,
    mixedCases: ALL_CASES.filter((c) => c.primaryAcousticFinding.includes("+")).length,
    coverage: Object.fromEntries(Object.keys(coverage).sort().map((key) => [key, coverage[key] as { p: number; a: number }])),
  };
}

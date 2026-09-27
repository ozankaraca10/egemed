import { ALL_CASES } from "./data";
import { poolFor } from "./select";

/**
 * Yalnız SAYILARDAN oluşan vaka envanteri (sızıntı taşımaz): istemcinin kaynaklar
 * ve öğrenme ekranı bulgu kapsamı için.
 */
export interface OpacaCaseInventory {
  readonly totalCases: number;
  readonly practicePoolSize: number;
  readonly assessmentPoolSize: number;
  readonly assessmentQuestions: number;
  readonly pediatricCases: number;
  /** bulgu → { p: uygulama vakası sayısı, a: değerlendirme vakası sayısı } */
  readonly coverage: Readonly<Record<string, { readonly p: number; readonly a: number }>>;
}

export function caseInventory(): OpacaCaseInventory {
  const coverage: Record<string, { p: number; a: number }> = {};
  for (const entry of ALL_CASES) {
    const row = coverage[entry.primaryFinding] ?? { p: 0, a: 0 };
    if (entry.modes.includes("practice")) row.p += 1;
    if (entry.modes.includes("assessment")) row.a += 1;
    coverage[entry.primaryFinding] = row;
  }
  const assessment = poolFor("assessment");
  return {
    totalCases: ALL_CASES.length,
    practicePoolSize: poolFor("practice").length,
    assessmentPoolSize: assessment.length,
    assessmentQuestions: assessment.reduce((sum, c) => sum + c.questions.length, 0),
    pediatricCases: ALL_CASES.filter((c) => c.population === "pediatrik").length,
    coverage: Object.fromEntries(Object.keys(coverage).sort().map((key) => [key, coverage[key] as { p: number; a: number }])),
  };
}

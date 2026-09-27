import { ITEMS } from "./data";
import { poolFor } from "./select";

/**
 * Yalnız SAYILARDAN oluşan Pulse madde envanteri (sızıntı taşımaz): istemcinin
 * kaynaklar ve öğrenme ekranı kapsam göstergesi için.
 */
export interface PulseCaseInventory {
  readonly totalCases: number;
  readonly totalQuestions: number;
  readonly practicePoolSize: number;
  readonly assessmentPoolSize: number;
  /** EKG paterni → { case: uygulama, quiz: değerlendirme } madde sayısı */
  readonly patterns: Readonly<Record<string, { readonly case: number; readonly quiz: number }>>;
}

export function caseInventory(): PulseCaseInventory {
  const patterns: Record<string, { case: number; quiz: number }> = {};
  for (const item of ITEMS) {
    const row = patterns[item.mode] ?? { case: 0, quiz: 0 };
    row[item.section] += 1;
    patterns[item.mode] = row;
  }
  return {
    totalCases: poolFor("practice").length,
    totalQuestions: poolFor("assessment").length,
    practicePoolSize: poolFor("practice").length,
    assessmentPoolSize: poolFor("assessment").length,
    patterns: Object.fromEntries(Object.keys(patterns).sort().map((key) => [key, patterns[key] as { case: number; quiz: number }])),
  };
}

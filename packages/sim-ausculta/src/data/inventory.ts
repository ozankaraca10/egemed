import inventoryJson from "./case-inventory.json";

/**
 * T196 (ADR-009): istemci vaka havuzu taşımaz. Vakalar, doğru yanıtlar ve geri
 * bildirim yalnız sunucu tarafı vaka bankası paketindedir ve sunucu oturumundan gelir;
 * burada yalnız SAYILAR (havuz büyüklükleri, bulgu kapsamı) bulunur. Dosya
 * bankadaki `caseInventory()` ile birebir aynıdır; eşitliği test korur.
 */
export interface CaseInventory {
  readonly totalCases: number;
  readonly practicePoolSize: number;
  readonly assessmentPoolSize: number;
  readonly assessmentQuestions: number;
  readonly pediatricCases: number;
  readonly mixedCases: number;
  /** bulgu → { p: uygulama vakası sayısı, a: değerlendirme vakası sayısı } */
  readonly coverage: Readonly<Record<string, { readonly p: number; readonly a: number }>>;
}

export const CASE_INVENTORY = inventoryJson as CaseInventory;

/** Değerlendirmeye açık vaka sayısı (ustalık paydası). */
export const ASSESSMENT_CASE_COUNT = Object.values(CASE_INVENTORY.coverage).reduce((sum, row) => sum + row.a, 0);

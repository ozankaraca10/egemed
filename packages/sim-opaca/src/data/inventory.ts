import inventoryJson from "./case-inventory.json";

/**
 * A2.3 (ADR-009): istemci vaka havuzu taşımaz. Vakalar, doğru yanıtlar ve geri
 * bildirim yalnız sunucu tarafı vaka bankası paketindedir ve sunucu oturumundan gelir;
 * burada yalnız SAYILAR (havuz büyüklükleri, bulgu kapsamı) bulunur. Dosya
 * bankadaki `opaca.caseInventory()` ile birebir aynıdır; eşitliği test korur.
 */
export interface CaseInventory {
  readonly totalCases: number;
  readonly practicePoolSize: number;
  readonly assessmentPoolSize: number;
  readonly assessmentQuestions: number;
  readonly pediatricCases: number;
  /** bulgu → { p: uygulama vakası sayısı, a: değerlendirme vakası sayısı } */
  readonly coverage: Readonly<Record<string, { readonly p: number; readonly a: number }>>;
}

export const CASE_INVENTORY = inventoryJson as CaseInventory;

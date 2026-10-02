import contextData from "./clinical-context.json";

/** T318 — görüntü başına klinik bağlam (gerçek hasta verisi; açık veri kümesi kaydından yalnız çeviri).
 *  Üretici: `egemed-tools/opaca-vinyet/build_context.py`. Kurgusal içerik YOK; kurgusal öykü ve
 *  ayırıcı tanı notları hekim onayından sonra ayrı alanda gelir. */

export interface ClinicalItem {
  readonly icon: string;
  readonly label: string;
  readonly value: string;
}

export interface ClinicalLabel {
  readonly finding: string;
  readonly source: string;
}

export interface ClinicalContext {
  readonly age: number | null;
  readonly sex: string | null;
  readonly view: string | null;
  readonly source: string;
  readonly items: readonly ClinicalItem[];
  readonly labels: readonly ClinicalLabel[];
  readonly orig: string | null;
  readonly note: string | null;
  readonly hasReal: boolean;
}

const CONTEXT = (contextData as unknown as { images: Readonly<Record<string, ClinicalContext>> }).images;

export function clinicalContextFor(imageId: string): ClinicalContext | null {
  return CONTEXT[imageId] ?? null;
}

/** Kayıtlı gerçek hasta verisi (klinik metin) olan görüntü mü. */
export function hasClinicalContext(imageId: string): boolean {
  return CONTEXT[imageId]?.hasReal === true;
}

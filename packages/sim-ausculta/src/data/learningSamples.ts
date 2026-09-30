import samplesData from "./learning-samples.json";

/** T259 — öğrenme modu örnek sesleri: kütüphane konusu → sıralı ses kimlikleri
 *  (en fazla 5; gerçek hasta kayıtları önce, konunun gerçek kaydı yoksa manken).
 *  Dosya `pnpm --filter @egemed/sim-ausculta learning:samples` ile deterministik
 *  üretilir; T261 hasta kartı bu listeyi okur. */

export interface LearningSamplesFile {
  readonly version: number;
  readonly topics: Readonly<Record<string, readonly string[]>>;
}

export const LEARNING_SAMPLES: Readonly<Record<string, readonly string[]>> = (samplesData as LearningSamplesFile)
  .topics;

export function learningSamplesFor(libraryKey: string): readonly string[] {
  return LEARNING_SAMPLES[libraryKey] ?? [];
}

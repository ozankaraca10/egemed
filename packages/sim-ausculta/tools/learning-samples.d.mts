/** `tools/learning-samples.mjs` saf seçim yardımcılarının tip bildirimi. */

export interface SampleRecord {
  readonly id: string;
  readonly category: string;
  readonly acousticFinding: string;
  readonly sourceDataset: string;
  readonly sourceFile: string;
  readonly validationStatus: string;
  readonly internalSourceId?: string;
  readonly internalPatientId?: string;
}

export interface SampleTopic {
  readonly key: string;
  readonly category: string;
  readonly acousticFinding: string;
}

export const MAX_SAMPLES: number;
export const REAL_DATASET_ORDER: readonly string[];

export function patientKeyOf(record: SampleRecord): string;
export function selectTopicSamples(topic: SampleTopic, records: readonly SampleRecord[], max?: number): string[];
export function buildLearningSamples(
  topics: readonly SampleTopic[],
  records: readonly SampleRecord[],
): { readonly version: number; readonly topics: Readonly<Record<string, readonly string[]>> };

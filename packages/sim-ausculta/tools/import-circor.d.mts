/** `tools/import-circor.mjs` saf yardımcılarının tip bildirimi (testler .mjs'i doğrudan içe aktarır). */

export interface CircorRow {
  readonly patientId: string;
  readonly recordingLocations: readonly string[];
  readonly age: string;
  readonly sex: string;
  readonly pregnancy: string;
  readonly murmur: string;
  readonly mostAudible: string;
  readonly systolicTiming: string;
  readonly diastolicTiming: string;
  readonly grading: string;
}

export interface CircorCandidate extends CircorRow {
  readonly topic: string;
  readonly finding: string;
  readonly location: string;
  readonly timing: string;
}

export type CircorMapping = { readonly topic: string; readonly finding: string } | { readonly skipped: string };

export const MAX_PER_TOPIC: number;
export const LEGACY_RECORD_IDS: readonly string[];
export const LEGACY_PATIENT_IDS: readonly string[];
export const LOCATION_TO_POINT: Readonly<Record<"AV" | "PV" | "TV" | "MV", string>>;
export const NORMAL_LOCATION_ORDER: readonly string[];
export const CIRCOR_TOPIC_BY_TIMING: Readonly<Record<string, { readonly topic: string; readonly finding: string }>>;
export const CIRCOR_TOPIC_ORDER: readonly string[];

export function parseCircorCsv(csvText: string): CircorRow[] | null;
export function mapCircorEntry(entry: CircorRow): CircorMapping;
export function gradeRank(grading: string | null | undefined): number;
export function chooseLocation(
  finding: string,
  mostAudible: string,
  recordingLocations: readonly string[],
  hasFile: (location: string) => boolean,
): string | null;
export function selectCircorRecords(
  candidates: readonly CircorCandidate[],
  maxPerTopic?: number,
): readonly CircorCandidate[];
export function circorMappingNote(candidate: CircorCandidate): string;

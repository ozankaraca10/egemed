/** `tools/import-sprsound.mjs` saf yardımcılarının tip bildirimi (testler .mjs'i doğrudan içe aktarır). */

export interface SprsoundFileFields {
  readonly patientNo: string;
  readonly age: string;
  readonly gender: string;
  readonly location: string;
  readonly recordNo: string;
}

export interface SprsoundEvent {
  readonly start: string | number;
  readonly end: string | number;
  readonly type: string;
}

export interface SprsoundAnnotation {
  readonly record_annotation: string;
  readonly event_annotation: readonly SprsoundEvent[];
}

export type SprsoundFinding = "rhonchi" | "wheezing";

export type SprsoundFindingResult = { readonly finding: SprsoundFinding } | { readonly skipped: string };

export interface SprsoundCandidate {
  readonly fileName: string;
  readonly recordNo: string;
  readonly location: string;
  readonly annotation: SprsoundAnnotation;
  readonly durationSec: number;
}

export interface SprsoundSelected {
  readonly fileName: string;
  readonly recordNo: string;
  readonly location: string;
  readonly annotation: SprsoundAnnotation;
  readonly durationSec: number;
  readonly finding: SprsoundFinding;
  readonly coverage: number;
  readonly pointId: string;
  readonly rank: number;
}

export const MIN_COVERAGE: number;
export const MAX_PER_BUCKET: number;
export const MAPPING_NOTE: string;
export const SPRSOUND_POINTS: Readonly<Record<"p1" | "p3", readonly string[]>>;

export function parseSprsoundFileName(fileName: string): SprsoundFileFields | null;
export function findingForAnnotation(annotation: unknown): SprsoundFindingResult;
export function coverageOf(annotation: unknown, finding: SprsoundFinding, durationSec: number): number;
export function pointForLocation(location: string, index: number): string | null;
export function selectSprsoundRecords(entries: readonly SprsoundCandidate[]): {
  readonly selected: readonly SprsoundSelected[];
  readonly skipped: ReadonlyMap<string, number>;
};

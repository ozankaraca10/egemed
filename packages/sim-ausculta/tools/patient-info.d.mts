/** `tools/patient-info.mjs` saf yardımcılarının tip bildirimi (testler .mjs'i doğrudan içe aktarır). */

export interface RealPatientInfo {
  readonly origin: "real";
  readonly ageYears: number | null;
  readonly sex: "F" | "M" | null;
  readonly diagnosis: string | null;
  readonly diagnosisSource: string;
  readonly soundTypeRaw: string | null;
  readonly site: string | null;
}

export interface SprsoundPatientSummary {
  readonly disease: string;
  readonly source: string;
}

export interface KauhPatientFields {
  readonly age: string;
  readonly sex: string;
  readonly diagnosis: string;
  readonly sound: string;
  readonly region: string;
}

export interface SprsoundPatientFields {
  readonly age: string;
  readonly gender: string;
  readonly location: string;
}

export const DIAGNOSIS_SOURCE: Readonly<Record<"kauh-v3" | "sprsound", string>>;

export function diagnosisToTurkish(datasetId: string, raw: string | null | undefined): string | null;
export function siteToTurkish(datasetId: string, raw: string | null | undefined): string | null;
export function ageYearsOf(raw: string | number | null | undefined): number | null;
export function sexOfKauh(raw: string | null | undefined): "F" | "M" | null;
export function sexOfSprsound(code: string | null | undefined): "F" | "M" | null;
export function kauhPatientInfo(entry: KauhPatientFields): RealPatientInfo;
export function sprsoundPatientInfo(
  fields: SprsoundPatientFields,
  finding: string,
  summary: SprsoundPatientSummary | null | undefined,
): RealPatientInfo;
export function normalizePatientNo(value: string | number | null | undefined): string;
export function parsePatientSummaryCsv(csvText: string): Map<string, string>;

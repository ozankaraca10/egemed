/** `tools/import-kauh.mjs` saf yardımcılarının tip bildirimi (testler .mjs'i doğrudan içe aktarır). */

export interface Pcm16Wav {
  readonly sampleRate: number;
  readonly channels: number;
  readonly samples: Int16Array;
}

export interface NormalizedPcm16 {
  readonly samples: Int16Array;
  readonly gainApplied: number;
  readonly rmsNormalized: number;
  readonly peakNormalized: number;
}

export interface KauhFileFields {
  readonly filter: string;
  readonly patientNo: string;
  readonly diagnosis: string;
  readonly sound: string;
  readonly region: string;
  readonly age: string;
  readonly sex: string;
}

export type KauhMapping = { readonly finding: string; readonly pointId: string } | { readonly skipped: string };

export const TARGET_RMS: number;
export const MAX_PEAK: number;
export const MAX_SECONDS: number;

export function decodePcm16Wav(bytes: Uint8Array): Pcm16Wav | null;
export function encodePcm16Wav(samples: Int16Array, sampleRate: number, channels: number): Uint8Array;
export function truncatePcm16(samples: Int16Array, sampleRate: number, channels: number, maxSeconds?: number): Int16Array;
export function normalizePcm16(samples: Int16Array, targetRms?: number, maxPeak?: number): NormalizedPcm16;
export function parseKauhFileName(fileName: string): KauhFileFields | null;
export function mapKauhEntry(entry: KauhFileFields): KauhMapping;
export function mappingNote(finding: string, entry: KauhFileFields): string;

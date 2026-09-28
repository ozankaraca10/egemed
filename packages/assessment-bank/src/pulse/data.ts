/**
 * Anahtarlı Pulse verisi (A3.1, ADR-009). Maddeler `packages/sim-pulse` runtime
 * kaynağından (`vendor/curriculum.js`) `tools/export-bank.mjs` ile dışa aktarılır;
 * banka sim paketine kod bağımlılığı almaz, yalnız üretilmiş JSON okur.
 */
import type { PulseEcgLead, PulseEcgMode } from "@egemed/contracts";
import itemsJson from "../../data/pulse/items.json" with { type: "json" };

/** Uygulama (`case`) ya da değerlendirme (`quiz`) maddesi. */
export type PulseSection = "case" | "quiz";

/** Kasıtlı metin çifti (müfredat `parseVitals` çıktısı; istemciye `{label, value}` gider). */
export interface PulseVital {
  readonly k: string;
  readonly v: string;
}

export interface PulseEcg {
  readonly mode: PulseEcgMode;
  readonly options: Readonly<Record<string, string | number | boolean>>;
  readonly leads: readonly PulseEcgLead[];
  readonly start: number;
  readonly seconds: number;
}

/** A3.1: anahtarlı madde (doğru cevap ve gerekçeler dahil) — istemciye ASLA gitmez. */
export interface PulseItem {
  readonly id: string;
  readonly section: PulseSection;
  readonly mode: PulseEcgMode;
  readonly stem: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanations: readonly string[];
  readonly feedback: string;
  readonly objectiveIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly vitals: readonly PulseVital[];
  readonly ecg: PulseEcg;
}

interface PulseBankFile {
  readonly version: number;
  readonly sessionSize: number;
  readonly count: number;
  readonly items: readonly PulseItem[];
}

const bank = itemsJson as unknown as PulseBankFile;
if (bank.items.length !== bank.count) throw new Error("pulse banka dosyası tutarsız: count");

export const ITEMS: readonly PulseItem[] = bank.items;
export const BANK_VERSION = bank.version;
export const SESSION_SIZE = bank.sessionSize;

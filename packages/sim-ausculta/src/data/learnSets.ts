import setsData from "./learn-sets.json";
import wavesData from "./learn-waves.json";
import type { SoundCategory, SoundRecord } from "../core/types";

/** T307 — öğrenme modu örnekleri (depo sahibi kararı, 2 Eki 2026):
 *  1. örnek her konuda ÇOK NOKTALI SENTETİK (HLS-CMDS kütüphanesi; yeni 4 konuda
 *  bölgesel model); 2–4. örnekler ses envanterinden, bulgunun duyulduğu uygulama
 *  noktası sayısı en çok olan gerçek hastalar (çoktan aza). Veri
 *  `egemed-tools/ausculta-learn/build_learn.py` ile deterministik üretilir. */

export interface WaveMark {
  readonly t: number;
  readonly e: number;
  readonly k: string;
}

interface Clip {
  readonly url: string;
  readonly durationSec: number;
  readonly marks: readonly WaveMark[];
  readonly env: readonly number[];
}

interface RawModel {
  readonly points: Readonly<Record<string, string>>;
  readonly source: string;
  readonly note: string;
}

interface RawReal {
  readonly id: string;
  readonly sex: "F" | "M" | null;
  readonly rows: readonly (readonly [string, string])[];
  readonly source: string;
  readonly sourceLabel: string;
  readonly noLevel: boolean;
  readonly points: Readonly<Record<string, string>>;
}

interface RawTopic {
  readonly model: RawModel | null;
  readonly real: readonly RawReal[];
}

interface RawSets {
  readonly topics: Readonly<Record<string, RawTopic>>;
  readonly clips: Readonly<Record<string, Clip>>;
}

const SETS = setsData as unknown as RawSets;
const WAVES = wavesData as unknown as Readonly<Record<string, readonly number[]>>;

/** Kütüphane çözücüsüyle (HLS-CMDS) çalan çok noktalı sentetik set. */
export interface LibrarySyntheticExample {
  readonly kind: "library";
}

/** Gerçek kayıttan bölgesel yayılım modeliyle üretilmiş çok noktalı sentetik set. */
export interface ModelSyntheticExample {
  readonly kind: "model";
  readonly points: Readonly<Record<string, string>>;
  readonly source: string;
  readonly note: string;
}

export interface RealExample {
  readonly kind: "real";
  readonly sex: "F" | "M" | null;
  readonly rows: readonly (readonly [string, string])[];
  readonly source: string;
  readonly sourceLabel: string;
  /** Kaynakta seviye (üst/orta/alt) yok; kayıt o açının orta noktasına yerleştirildi. */
  readonly noLevel: boolean;
  readonly points: Readonly<Record<string, string>>;
}

export type LearnExample = LibrarySyntheticExample | ModelSyntheticExample | RealExample;

/** Konunun örnekleri: önce sentetik, sonra gerçek hastalar (bölge sayısı çoktan aza). */
export function learnExamples(key: string): LearnExample[] {
  const topic = SETS.topics[key];
  const synthetic: LearnExample = topic?.model ? { kind: "model", ...topic.model } : { kind: "library" };
  return [synthetic, ...(topic?.real ?? []).map((real): RealExample => ({ kind: "real", ...real }))];
}

/** Örnekte noktaya bağlı klip kimliği; kütüphane sentetiği çözücüden geldiği için null. */
export function exampleClipFor(example: LearnExample, pointId: string): string | null {
  return example.kind === "library" ? null : (example.points[pointId] ?? null);
}

/** Klibi ses motorunun beklediği kayda çevirir (kaynak dosya adı gösterilmez). */
export function clipRecord(clipId: string, category: SoundCategory, finding: string, pointId: string): SoundRecord | null {
  const clip = SETS.clips[clipId];
  if (!clip) return null;
  return {
    id: `learn:${clipId}`,
    category,
    acousticFinding: finding,
    sourceDataset: "learn-set",
    sourceFile: clipId,
    durationSec: clip.durationSec,
    sampleRate: 4000,
    channels: 1,
    peak: 0.9,
    rms: 0,
    recordedLocation: pointId,
    anatomicalLocation: pointId,
    simulationLocation: pointId,
    nativeFilter: "unspecified",
    gender: "",
    runtimeUrl: clip.url,
    validationStatus: "validated",
    issues: [],
  };
}

export interface WaveView {
  readonly env: readonly number[];
  readonly marks: readonly WaveMark[];
  readonly durationSec: number;
}

/** Çalan kaydın dalga zarfı ve uzman işaretleri (yoksa null). */
export function waveForSound(sound: SoundRecord): WaveView | null {
  if (sound.id.startsWith("learn:")) {
    const clip = SETS.clips[sound.id.slice("learn:".length)];
    return clip ? { env: clip.env, marks: clip.marks, durationSec: clip.durationSec } : null;
  }
  const env = WAVES[sound.id];
  return env ? { env, marks: [], durationSec: Math.min(8, sound.durationSec || 8) } : null;
}

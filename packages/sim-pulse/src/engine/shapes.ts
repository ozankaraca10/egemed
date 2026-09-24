/* EGEMED PULSE — model temeli (S0c). Kaynak: EGEMED_PULSE/cardai/model.js:5-21
   (davranış birebir; IIFE ve global yazımı kaldırıldı, açık `export`).
   Birimler: saniye / mV. Tamamen deterministik: rastgelelik ve saat
   bağımlılığı yoktur; `hash` tamsayı karıştırmadır. */

export const MODES = [
  "normal", "af", "stemi", "pvc", "svt", "inferior", "vt",
  "vf", "pat", "flutter", "sintach", "lbbb", "rbbb",
] as const;

export type Mode = (typeof MODES)[number];

export const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

export type Lead = (typeof LEADS)[number];

/** P dalgası çizilmeyen modlar (kaynak `NO_P`). */
export const NO_P: readonly Mode[] = ["af", "svt", "vt", "vf", "flutter"];

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function bell(t: number, c: number, w: number, a: number): number {
  return Math.abs(t - c) > w ? 0 : (a * (1 + Math.cos((Math.PI * (t - c)) / w))) / 2;
}

export type WaveformPoint = readonly [number, number];

export function interpolate(t: number, pts: ReadonlyArray<WaveformPoint>): number {
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (t >= a[0] && t <= b[0]) {
      return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
    }
  }
  return 0;
}

/** Altı ekstremite (limb) türevi; göğüs lead'leri ayrıca eklenir. */
export interface Limb {
  I: number;
  II: number;
  III: number;
  aVR: number;
  aVL: number;
  aVF: number;
}

export function limb(i: number, ii: number): Limb {
  return { I: i, II: ii, III: ii - i, aVR: -(i + ii) / 2, aVL: i - ii / 2, aVF: ii - i / 2 };
}

export type LeadShape = Record<Lead, number>;

export const leadShape: LeadShape = { ...limb(0.72, 1), V1: -0.62, V2: -0.28, V3: 0.34, V4: 0.92, V5: 1.06, V6: 0.82 };
export const pShape: LeadShape = { ...limb(0.8, 1), V1: 0.55, V2: 0.75, V3: 0.78, V4: 0.7, V5: 0.62, V6: 0.55 };
export const tShape: LeadShape = { ...limb(0.72, 1), V1: -0.28, V2: 0.15, V3: 0.55, V4: 1, V5: 1.05, V6: 0.86 };
export const anteriorST: LeadShape = { ...limb(0.04, -0.04), V1: 0.12, V2: 0.24, V3: 0.32, V4: 0.24, V5: 0.08, V6: 0.03 };
export const inferiorST: LeadShape = { ...limb(-0.08, 0.2), V1: -0.04, V2: -0.03, V3: 0, V4: 0.02, V5: 0.04, V6: 0.04 };

export type ShapeKey =
  | "normal"
  | "pvc"
  | "vt"
  | "lRight"
  | "lLeft"
  | "lOther"
  | "rRight"
  | "rLeft"
  | "rOther";

/** QRS morfoloji destek noktaları (u ∈ [0,1] → genlik); kaynak `SHAPES` birebir. */
export const SHAPES: Record<ShapeKey, readonly WaveformPoint[]> = {
  normal: [[0, 0], [0.2, -0.13], [0.5, 1], [0.7, -0.25], [1, 0]],
  pvc: [[0, 0], [0.12, -0.18], [0.27, 0.25], [0.45, 1.08], [0.67, -0.58], [0.86, -0.12], [1, 0]],
  vt: [[0, 0], [0.13, -0.22], [0.3, 0.35], [0.46, 1.08], [0.65, 0.65], [0.83, -0.42], [1, 0]],
  lRight: [[0, 0], [0.15, 0.1], [0.4, -0.88], [0.65, -1.12], [0.9, -0.25], [1, 0]],
  lLeft: [[0, 0], [0.2, 0], [0.4, 0.72], [0.56, 0.48], [0.73, 1.02], [0.92, 0.22], [1, 0]],
  lOther: [[0, 0], [0.2, -0.12], [0.44, 0.72], [0.67, 0.48], [0.92, -0.18], [1, 0]],
  rRight: [[0, 0], [0.14, 0.28], [0.33, -0.34], [0.58, 0.92], [0.83, 0.42], [1, 0]],
  rLeft: [[0, 0], [0.2, -0.08], [0.36, 0.9], [0.55, 0.18], [0.83, -0.48], [1, 0]],
  rOther: [[0, 0], [0.18, -0.1], [0.35, 0.82], [0.56, 0.14], [0.85, -0.34], [1, 0]],
};

/** Tamsayı karıştırma: aynı girdi → aynı çıktı, [0,1) aralığında. */
export function hash(n: number): number {
  let x = (n + 173812) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Kalp döngüsü referans noktaları (saniye); çizilen desteği tanımlar. */
export interface Fiducials {
  qrsStart: number;
  qrsEnd: number;
  pStart: number | null;
  pEnd: number | null;
  pCenter: number | null;
  pr: number | null;
  qrs: number;
  qt: number;
  tStart: number;
  tEnd: number;
  tCenter: number;
  j: number;
  stMeasure: number;
}

const FAST_MODES: readonly Mode[] = ["svt", "pat", "flutter", "sintach", "vt"];

export function fiducials(mode: Mode, isPVC = false): Fiducials {
  const kind: Mode = isPVC ? "pvc" : mode === "pvc" ? "normal" : mode;
  const qrs =
    kind === "pvc" ? 0.14 : kind === "vt" ? 0.18 : kind === "lbbb" ? 0.16 : kind === "rbbb" ? 0.14 : 0.08;
  const qrsStart = ["pvc", "rbbb"].includes(kind) ? -0.06 : ["vt", "lbbb"].includes(kind) ? -0.07 : -0.04;
  const qrsEnd = qrsStart + qrs;
  const hasP = !NO_P.includes(mode) && !isPVC;
  const pr = mode === "pat" ? 0.14 : 0.175;
  const pStart = qrsStart - pr;
  const pEnd = pStart + 0.09;
  const fast = FAST_MODES.includes(mode);
  const tStart = qrsEnd + (fast ? 0.025 : 0.07);
  const tEnd = tStart + (fast ? 0.14 : 0.2);
  return {
    qrsStart,
    qrsEnd,
    pStart: hasP ? pStart : null,
    pEnd: hasP ? pEnd : null,
    pCenter: hasP ? (pStart + pEnd) / 2 : null,
    pr: hasP ? pr : null,
    qrs,
    qt: tEnd - qrsStart,
    tStart,
    tEnd,
    tCenter: (tStart + tEnd) / 2,
    j: qrsEnd,
    stMeasure: qrsEnd + 0.02,
  };
}

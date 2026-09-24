/* EGEMED PULSE — atım üretimi ve önbellek (S0d). Kaynak: EGEMED_PULSE/cardai/model.js:22-32
   (davranış birebir; IIFE, global yazımı ve DOM bağımlılığı yok). Birimler: saniye / mV.
   `BeatEngine`, kaynak `CardiacModel`'in atım dilimidir: RR/hız hesabı, seyrek checkpoint'lar
   ve atım önbelleği. S0e (`model.ts`) sinyal, snapshot ve metrikleri ekleyerek genişletir.
   Tamamen deterministik: rastgelelik ve saat bağımlılığı yoktur; tüm zamanlar dışarıdan gelir. */

import { MODES, SHAPES, clamp, fiducials, hash, interpolate, leadShape } from "./shapes";
import type { Fiducials, Lead, Mode } from "./shapes";

/** Önbellek kontrol noktası: `n` atım sayacı, `r` zaman (sn), `prefix` güç toplamı. */
export interface Checkpoint {
  n: number;
  r: number;
  prefix: number;
}

/** Üretilmiş atım: önbellek alanları ve `fiducials` çıktısı. */
export interface Beat extends Fiducials {
  n: number;
  r: number;
  rr: number;
  strength: number;
  isPVC: boolean;
  prefix: number;
}

/** AF RR profili (kaynak `afProfile`). */
export type AfProfile = "rapid" | "controlled";

export interface BeatOptions {
  afProfile?: string;
  rate?: number;
}

interface ResolvedOptions {
  afProfile: AfProfile;
  rate?: number;
}

/** Sabit hızın kabul edilmediği modlar (kaynak kurucu guard'ı). */
const RATE_EXCLUDED: readonly Mode[] = ["af", "pvc", "flutter", "vf"];

/** Mod başına sabit RR (sn); tabloda olmayan modlar 0,8 sn. */
const MODE_RR: Partial<Record<Mode, number>> = {
  svt: 0.36,
  vt: 0.38,
  vf: 0.28,
  pat: 0.4,
  flutter: 0.4,
  sintach: 0.5,
};

/** Mod başına atım gücü; tabloda olmayan modlar 1. */
const MODE_STRENGTH: Partial<Record<Mode, number>> = {
  svt: 0.76,
  vt: 0.48,
  pat: 0.74,
  flutter: 0.7,
  sintach: 0.84,
  lbbb: 0.9,
  rbbb: 0.9,
};

/** PVC beşli RR ve güç döngüsü (`n % 5`). */
const PVC_RR: readonly number[] = [0.8, 0.8, 0.48, 1.12, 0.8];
const PVC_STRENGTH: readonly number[] = [1, 1, 0.68, 1.06, 1];

/** QRS morfolojisinde özel lead grupları (kaynak `qrsSignal`). */
const ANTERIOR_LEADS: readonly Lead[] = ["V1", "V2", "V3"];
const LATERAL_LEADS: readonly Lead[] = ["V5", "V6", "I"];
const RIGHT_LEADS: readonly Lead[] = ["V1", "V2"];

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

export class BeatEngine {
  readonly mode: Mode;
  readonly afProfile: AfProfile;
  readonly options: ResolvedOptions;
  readonly checkpoints: Checkpoint[];
  beats: Beat[];
  cacheFrom: number;
  cacheTo: number;

  constructor(mode: string, options: BeatOptions = {}) {
    this.mode = isMode(mode) ? mode : "normal";
    this.afProfile = options.afProfile === "rapid" ? "rapid" : "controlled";
    this.options = { afProfile: this.afProfile };
    const rate = options.rate;
    if (
      typeof rate === "number" &&
      Number.isFinite(rate) &&
      rate >= 50 &&
      rate <= 220 &&
      !RATE_EXCLUDED.includes(this.mode)
    ) {
      this.options.rate = rate;
    }
    this.checkpoints = [{ n: 0, r: -8.8, prefix: 0 }];
    this.beats = [];
    this.cacheFrom = Number.POSITIVE_INFINITY;
    this.cacheTo = Number.NEGATIVE_INFINITY;
    this.ensure(2);
  }

  /** Atım `n` için RR (sn): AF hash profili, PVC döngüsü, sabit hız ya da mod tablosu. */
  rrAt(n: number): number {
    if (this.mode === "af") {
      return this.afProfile === "rapid"
        ? 0.34 + Math.pow(hash(n), 1.18) * 0.22
        : 0.6 + Math.pow(hash(n), 1.22) * 0.4;
    }
    if (this.mode === "pvc") {
      return PVC_RR[n % 5] ?? 0.8;
    }
    if (this.options.rate) {
      return 60 / this.options.rate;
    }
    return MODE_RR[this.mode] ?? 0.8;
  }

  /** Atım gücü: VF 0, AF RR'ye bağlı, PVC döngüsü ya da mod tablosu. */
  strengthAt(n: number, rr: number): number {
    if (this.mode === "vf") {
      return 0;
    }
    if (this.mode === "af") {
      return clamp(0.68 + (rr - (this.afProfile === "rapid" ? 0.34 : 0.6)) * 0.55, 0.68, 1.02);
    }
    if (this.mode === "pvc") {
      return PVC_STRENGTH[n % 5] ?? 1;
    }
    return MODE_STRENGTH[this.mode] ?? 1;
  }

  /** 128 atımda bir seyrek checkpoint; on saatlik aramada kayıt sayısı ~1.100 altında kalır. */
  ensureCheckpoints(time: number): void {
    const last = this.checkpoints[this.checkpoints.length - 1];
    if (last === undefined) {
      return;
    }
    let c = last;
    while (c.r < time + 8) {
      let r = c.r;
      let prefix = c.prefix;
      for (let j = c.n; j < c.n + 128; j += 1) {
        const rr = this.rrAt(j);
        r += rr;
        prefix += this.strengthAt(j, rr);
      }
      c = { n: c.n + 128, r, prefix };
      this.checkpoints.push(c);
    }
  }

  /** `time` çevresinde ±6 sn'lik atım penceresi; pencere önbellekteyse yeniden üretilmez. */
  ensure(time: number): void {
    const t = clamp(Number(time) || 0, -8, 36002);
    if (t >= this.cacheFrom && t <= this.cacheTo) {
      return;
    }
    this.ensureCheckpoints(t);
    const from = Math.max(-8.7, t - 6);
    const to = t + 6;
    let lo = 0;
    let hi = this.checkpoints.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const checkpoint = this.checkpoints[mid];
      if (checkpoint !== undefined && checkpoint.r <= from) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const c = this.checkpoints[lo];
    if (c === undefined) {
      return;
    }
    let r = c.r;
    let prefix = c.prefix;
    const beats: Beat[] = [];
    for (let n = c.n; r <= to; n += 1) {
      const rr = this.rrAt(n);
      const strength = this.strengthAt(n, rr);
      r += rr;
      prefix += strength;
      const isPVC = this.mode === "pvc" && n % 5 === 2;
      if (r >= from - 1.2) {
        beats.push({ n, r, rr, strength, isPVC, prefix, ...fiducials(this.mode, isPVC) });
      }
    }
    this.beats = beats;
    this.cacheFrom = from + 1.2;
    this.cacheTo = to - 1.2;
  }

  /** `r < time` olan ilk atımın indeksi (ikili arama). */
  lowerBound(time: number): number {
    let lo = 0;
    let hi = this.beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const beat = this.beats[mid];
      if (beat !== undefined && beat.r < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /** [a,b] aralığındaki atımlar; >20 sn aralık 8 sn'lik parçalara bölünür ve `n`'e göre tekilleşir. */
  between(a: number, b: number): Beat[] {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
      return [];
    }
    const from = clamp(a, -8, 36002);
    const to = clamp(b, -8, 36002);
    if (to < from) {
      return [];
    }
    if (to - from > 20) {
      const result: Beat[] = [];
      for (let t = from; t <= to; t += 8) {
        result.push(...this.between(t, Math.min(to, t + 8)));
      }
      return [...new Map(result.map((beat) => [beat.n, beat] as const)).values()];
    }
    this.ensure((from + to) / 2);
    if (from < this.cacheFrom - 1.2 || to > this.cacheTo + 1.2) {
      // Kaynaktan bilinçli sapma (hata düzeltmesi): kısa aralığı aynı girdilerle
      // yinelemek yerine taşan uçtan yenile; özyineleme böylece yalnız geniş aralığı böler.
      if (to - from <= 6) {
        this.ensure(to > this.cacheTo + 1.2 ? to : from);
        return this.beats.slice(this.lowerBound(from), this.lowerBound(to + 1e-10));
      }
      const result: Beat[] = [];
      for (let t = from; t < to; t += 6) {
        result.push(...this.between(t, Math.min(to, t + 6)));
      }
      return [...new Map(result.map((beat) => [beat.n, beat] as const)).values()];
    }
    return this.beats.slice(this.lowerBound(from), this.lowerBound(to + 1e-10));
  }

  /** `time` anındaki atım indeksi (en az 0). */
  indexAt(time: number): number {
    this.ensure(time);
    return Math.max(0, this.lowerBound(time + 1e-10) - 1);
  }

  /** Atımın QRS bileşeni: u ∈ [0,1]; PVC/VT, LBBB, RBBB ve normal morfoloji. */
  qrsSignal(d: number, lead: Lead, b: Beat): number {
    const u = (d - b.qrsStart) / b.qrs;
    if (u < 0 || u > 1) {
      return 0;
    }
    if (b.isPVC || this.mode === "vt") {
      return interpolate(u, SHAPES[b.isPVC ? "pvc" : "vt"]) * leadShape[lead];
    }
    if (this.mode === "lbbb") {
      if (ANTERIOR_LEADS.includes(lead)) {
        return interpolate(u, SHAPES.lRight);
      }
      if (LATERAL_LEADS.includes(lead)) {
        return interpolate(u, SHAPES.lLeft);
      }
      return interpolate(u, SHAPES.lOther) * leadShape[lead];
    }
    if (this.mode === "rbbb") {
      if (RIGHT_LEADS.includes(lead)) {
        return interpolate(u, SHAPES.rRight);
      }
      if (LATERAL_LEADS.includes(lead)) {
        return interpolate(u, SHAPES.rLeft);
      }
      return interpolate(u, SHAPES.rOther) * leadShape[lead];
    }
    return interpolate(u, SHAPES.normal) * leadShape[lead];
  }
}

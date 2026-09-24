/* EGEMED PULSE — sinyal, mekanik snapshot ve metrikler (S0e).
   Kaynak: EGEMED_PULSE/cardai/model.js:34-52. Zaman saniye, sinyal mV'dir.
   Tüm deterministik atım üretimi BeatEngine'den gelir; global, saat ve RNG yoktur. */

import { BeatEngine } from "./beats";
import type { AfProfile, Beat, BeatOptions } from "./beats";
import { LEADS, anteriorST, bell, clamp, inferiorST, interpolate, leadShape, limb, pShape, tShape } from "./shapes";
import type { Lead, Mode } from "./shapes";

const VF_TEXT = "VF örneğinde organize QRS, ejeksiyon ve ileri akım yoktur. Elektriksel hız ölçülemez. Arrest bağlamında acil resüsitasyon değerlendirmesi gerekir.";
const FAST_MECHANICAL: readonly Mode[] = ["svt", "pat", "flutter", "sintach"];

export interface MechanicalTimeline {
  start: number; ejectStart: number; ejectEnd: number; relaxEnd: number; contractEnd: number; cycle: number;
}

export interface CardiacSnapshot {
  time: number; beat: Beat; next: Beat; d: number; phase: string; electrical: string; mechanical: string; text: string;
  atrial: number; contract: number; cavity: number; eject: boolean; avOpen: boolean; rate: number | null;
  electricalRate: number | null; mechanicalPulse: number | null; pulseText: string; rr: number; qrs: number;
  flow: number; ischaemia: boolean; timeline?: MechanicalTimeline;
}

export interface CardiacMetrics {
  pr: number | null; qrs: number | null; qt: number | null; rr: number | null; j: number | null; st: number | null;
  fiducials?: Beat;
}

export class CardiacModel extends BeatEngine {
  constructor(mode: string, options: BeatOptions = {}) { super(mode, options); }

  /** BeatEngine'ın QRS bileşenini korur; mevcut tüketici ve kabul testleri için açık yüzey. */
  override qrsSignal(d: number, lead: Lead, beat: Beat): number { return super.qrsSignal(d, lead, beat); }

  /** VF hariç bağımsız lead dalga biçimi; ekstremite lead'leri sinyalden türetilir. */
  independentSignal(time: number, lead: Lead): number {
    if (this.mode === "vf") {
      const k = lead === "I" ? 1 : lead === "II" ? 2 : LEADS.indexOf(lead) + 1;
      return 0.22 * Math.sin(2 * Math.PI * (3.2 + 0.07 * k) * time)
        + 0.14 * Math.sin(2 * Math.PI * (5.7 + 0.03 * k) * time + 1.1)
        + 0.10 * Math.sin(2 * Math.PI * 8.9 * time + 0.37 * k)
        + 0.07 * Math.sin(2 * Math.PI * 1.7 * time * time + 0.1 * k);
    }
    this.ensure(time);
    const i = this.indexAt(time);
    let value = 0;
    if (this.mode === "af") value = (lead === "I" ? 0.8 : lead === "II" ? 1 : pShape[lead])
      * (0.020 * Math.sin(2 * Math.PI * 6.3 * time + 0.7 * Math.sin(2.1 * time)) + 0.013 * Math.sin(2 * Math.PI * 8.7 * time) + 0.009 * Math.sin(2 * Math.PI * 4.9 * time + 0.2));
    if (this.mode === "flutter") {
      const phase = ((time * 5) % 1 + 1) % 1;
      const scale = lead === "I" ? -0.025 : lead === "II" ? -0.085 : lead === "V1" ? 0.07 : 0.035;
      value += (2 * phase - 1) * scale;
    }
    for (let j = Math.max(0, i - 1); j <= Math.min(this.beats.length - 1, i + 2); j += 1) {
      const beat = this.beats[j];
      if (beat === undefined) continue;
      const d = time - beat.r;
      if (beat.pStart !== null) value += bell(d, beat.pCenter ?? 0, 0.045, (this.mode === "pat" ? -0.13 : 0.14) * pShape[lead]);
      value += this.qrsSignal(d, lead, beat);
      const ls = leadShape[lead];
      const secondary = beat.isPVC || this.mode === "vt" || this.mode === "lbbb" || this.mode === "rbbb";
      let ta = 0.28 * tShape[lead];
      if (secondary) {
        const side = this.mode === "rbbb" ? Math.sign(this.qrsSignal(beat.qrsStart + beat.qrs * 0.85, lead, beat))
          : this.mode === "lbbb" && ["V1", "V2", "V3"].includes(lead) ? -1 : Math.sign(ls);
        ta = -0.24 * side;
      }
      value += bell(d, beat.tCenter, (beat.tEnd - beat.tStart) / 2, ta);
      if (this.mode === "stemi" || this.mode === "inferior") {
        const st = (this.mode === "stemi" ? anteriorST : inferiorST)[lead];
        value += interpolate(d, [[beat.qrsEnd - 0.016, 0], [beat.qrsEnd, st], [beat.tStart, st], [beat.tCenter, st * 0.95], [beat.tEnd, 0]]);
      }
    }
    return value;
  }

  signal(time: number, lead: string = "II"): number {
    const selected: Lead = (LEADS as readonly string[]).includes(lead) ? lead as Lead : "II";
    if (["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"].includes(selected)) return this.independentSignal(time, selected);
    const i = this.independentSignal(time, "I");
    const ii = this.independentSignal(time, "II");
    return limb(i, ii)[selected as keyof ReturnType<typeof limb>];
  }

  mechanicalTimeline(beat: Beat, next: Beat | { r: number }): MechanicalTimeline {
    const cycle = next.r - beat.r;
    const fast = FAST_MECHANICAL.includes(this.mode) || this.mode === "af" && cycle < 0.60;
    const vt = this.mode === "vt";
    const relaxEnd = vt ? 0.32 : fast ? 0.27 : 0.43;
    const scale = Math.min(1, Math.max(0.25, (cycle - 0.04) / relaxEnd));
    return { start: (vt ? 0.04 : fast ? 0.025 : 0.035) * scale,
      ejectStart: (vt ? 0.10 : fast ? 0.06 : 0.09) * scale,
      ejectEnd: (vt ? 0.25 : fast ? 0.18 : 0.30) * scale,
      relaxEnd: relaxEnd * scale, contractEnd: (vt ? 0.30 : fast ? 0.25 : 0.38) * scale, cycle };
  }

  snapshot(time: number): CardiacSnapshot {
    this.ensure(time);
    const i = this.indexAt(time), beat = this.beats[i];
    if (beat === undefined) throw new Error("CardiacModel atım önbelleği boş");
    const next = this.beats[i + 1] ?? { ...beat, r: beat.r + beat.rr };
    const d = time - beat.r;
    if (this.mode === "vf") return { time, beat, next, d, phase: "chaotic", electrical: "Kaotik ventriküler elektriksel etkinlik",
      mechanical: "Etkili kasılma ve mekanik nabız yok", text: VF_TEXT, atrial: 0, contract: 0, cavity: 0, eject: false,
      avOpen: false, rate: null, electricalRate: null, mechanicalPulse: null, pulseText: "VF: etkili mekanik nabız yok", rr: 0, qrs: 0, flow: 0, ischaemia: false };
    const timeline = this.mechanicalTimeline(beat, next);
    const systolic = d >= timeline.start && d < timeline.contractEnd;
    const eject = d >= timeline.ejectStart && d < timeline.ejectEnd;
    const avOpen = d >= timeline.relaxEnd || d < timeline.start;
    const contract = systolic ? Math.sin(Math.PI * (d - timeline.start) / (timeline.contractEnd - timeline.start)) : 0;
    const cavity = d < timeline.ejectStart ? 0 : d < timeline.ejectEnd ? (d - timeline.ejectStart) / (timeline.ejectEnd - timeline.ejectStart)
      : d < timeline.relaxEnd ? 1 : 1 - clamp((d - timeline.relaxEnd) / Math.max(0.01, timeline.cycle - timeline.relaxEnd), 0, 1);
    const until = next.r - time;
    const atrial = next.pStart !== null ? bell(until, -(next.pCenter ?? 0) - 0.035, 0.045, 1) : 0;
    let phase = "fill", mechanical = "Ventriküler doluş", text = "AV kapaklar açık; şematik ventrikül hacmi doluş boyunca geri kazanılır.";
    if (d >= timeline.start && d < timeline.ejectStart) { phase = "qrs"; mechanical = "İzovolümetrik kasılma"; text = "Kasılma başlar; tüm kapaklar kapalıdır. Henüz ileri ejeksiyon yoktur."; }
    else if (eject) { phase = d >= beat.tStart ? "t" : "eject"; mechanical = "Ventriküler ejeksiyon"; text = "Çıkış kapakları açık; şematik ileri akım sürer."; }
    else if (d >= timeline.ejectEnd && d < timeline.relaxEnd) { phase = "t"; mechanical = "İzovolümetrik gevşeme"; text = "Ejeksiyon sona erdi; tüm kapaklar kısa süre kapalıdır."; }
    else if (atrial > 0) { phase = "atrial"; mechanical = "Doluş ve atriyal kasılma"; text = "Ayrık P etkinliğini şematik atriyal kasılma izler; AV kapaklar açıktır."; }
    let electrical = "İzoelektrik aralık";
    const nextD = time - next.r;
    if (next.pStart !== null && nextD >= next.pStart && nextD <= (next.pEnd ?? next.pStart)) electrical = this.mode === "pat" ? "Ektopik P · Atriyal depolarizasyon" : "P · Atriyal depolarizasyon";
    else if (d >= beat.qrsStart && d <= beat.qrsEnd || nextD >= next.qrsStart && nextD <= next.qrsEnd) electrical = "QRS · Ventriküler depolarizasyon";
    else if (d >= beat.tStart && d <= beat.tEnd) electrical = "T · Ventriküler repolarizasyon";
    else if (d > beat.qrsEnd && d < beat.tStart) electrical = "ST segmenti";
    if (this.mode === "af") electrical += " · sürekli f etkinliği";
    if (this.mode === "flutter") electrical += " · sürekli F etkinliği";
    const rate = Math.round(60 / beat.rr);
    return { time, beat, next, d, phase, electrical, mechanical, text, atrial, contract: Math.max(0, contract), cavity: clamp(cavity, 0, 1), eject, avOpen,
      rate, electricalRate: rate, mechanicalPulse: null, pulseText: "Mekanik nabız EKG’den belirlenemez", rr: Math.round(beat.rr * 1000), qrs: Math.round(beat.qrs * 1000),
      flow: beat.strength, ischaemia: ["stemi", "inferior"].includes(this.mode), timeline };
  }

  metrics(time: number, lead: string = "II"): CardiacMetrics {
    const snapshot = this.snapshot(time), beat = snapshot.beat;
    if (this.mode === "vf") return { pr: null, qrs: null, qt: null, rr: null, j: null, st: null };
    return { pr: beat.pr === null ? null : Math.round(beat.pr * 1000), qrs: Math.round(beat.qrs * 1000), qt: Math.round(beat.qt * 1000),
      rr: Math.round(beat.rr * 1000), j: beat.r + beat.j, st: this.signal(beat.r + beat.stMeasure, lead), fiducials: { ...beat } };
  }

  eventTimes(from: number, to: number): number[] {
    if (this.mode === "vf") return [from + 0.1].filter((time) => time <= to);
    return this.between(from - 0.6, to + 0.6).flatMap((beat) => {
      const timeline = this.mechanicalTimeline(beat, { r: beat.r + beat.rr });
      return [beat.pCenter, beat.qrsStart, timeline.ejectStart + 0.01, beat.tCenter, timeline.relaxEnd + 0.02]
        .filter((value): value is number => value !== null).map((offset) => beat.r + offset);
    }).filter((time) => time > from + 0.001 && time <= to).sort((a, b) => a - b);
  }

  nextEvent(time: number): number { return this.eventTimes(time, time + 2)[0] ?? time + 0.1; }

  phaseTime(time: number, phase: string): number {
    if (this.mode === "vf") return time + 0.1;
    for (const beat of this.between(time - 0.5, time + 2)) {
      const timeline = this.mechanicalTimeline(beat, { r: beat.r + beat.rr });
      const offsets: Record<string, number | null> = { atrial: beat.pCenter, qrs: beat.qrsStart + 0.01, eject: timeline.ejectStart + 0.02, t: beat.tCenter, fill: timeline.relaxEnd + 0.02 };
      const offset = offsets[phase];
      if (offset !== null && offset !== undefined && Number.isFinite(offset) && beat.r + offset > time + 0.015) return beat.r + offset;
    }
    return time + 0.1;
  }
}

export type { AfProfile, Beat, BeatOptions, Mode, Lead };

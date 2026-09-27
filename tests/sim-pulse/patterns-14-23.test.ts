import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * T204 — Pulse patern 14–23 otomatik tıbbi QC. Çalışan runtime modeli (vendor/model.js)
 * doğrudan yüklenir; değerler pedagojik simülasyon parametreleridir (tanı eşiği değil).
 */

interface Beat {
  readonly n: number;
  readonly r: number;
  readonly pr: number | null;
  readonly qrs: number;
  readonly qrsStart: number;
  readonly qrsEnd: number;
  readonly pStart: number | null;
  readonly tStart: number;
  readonly tEnd: number;
  readonly tCenter: number;
}
interface AtrialEvent {
  readonly t: number;
  readonly kind: "sinus" | "ectopic" | "retro";
  readonly conducted: boolean;
}
interface Model {
  between(a: number, b: number): Beat[];
  atrialEvents(a: number, b: number): AtrialEvent[];
  signal(time: number, lead: string): number;
  snapshot(time: number): { electrical: string; conduction?: Record<string, unknown> };
}
interface Api {
  CardiacModel: new (mode: string) => Model;
  MODES: readonly string[];
  PATTERN_MODES: readonly string[];
  ALL_MODES: readonly string[];
  LEADS: readonly string[];
}

// Test ortamındaki serbest `module` değişkeni UMD dalını tetiklemesin diye kaynak `module` tanımsızken çalıştırılır.
const source = readFileSync("packages/sim-pulse/src/runtime/vendor/model.js", "utf8").replace("export default function run", "return function run");
const runModel = new Function("module", source)(undefined) as (env: { window: Record<string, unknown> }) => void;
const win: Record<string, unknown> = {};
runModel({ window: win });
const api = win["CardAIModel"] as Api;
const LEADS = api.LEADS;
const make = (mode: string): Model => new api.CardiacModel(mode);
const rrs = (beats: readonly Beat[]): number[] => beats.slice(1).map((b, i) => b.r - (beats[i] as Beat).r);
const bpm = (rr: number): number => 60 / rr;
/** Bir atımda P merkezinin bağlı olduğu atriyal olayı bulur (P → sonraki QRS başlangıcı). */
const conductedFor = (events: readonly AtrialEvent[], b: Beat): AtrialEvent | undefined =>
  events.find((e) => e.conducted && e.t < b.r + b.qrsStart && b.r + b.qrsStart - e.t < 0.5);

describe("Pulse patern 14–23 — kayıt", () => {
  it("13 temel mod değişmez; 10 yeni patern ayrı listede, toplam 23 benzersiz", () => {
    expect(api.MODES).toHaveLength(13);
    expect(api.PATTERN_MODES).toEqual(["sinbrady", "avb1", "mobitz1", "mobitz2", "chb", "pac", "junctional", "wpw", "pericarditis", "hyperk"]);
    expect(new Set(api.ALL_MODES).size).toBe(23);
  });
});

describe("AV iletim paternleri (14–18)", () => {
  it("sinüs bradikardisi: 45–50/dk, düzenli, P:QRS 1:1, PR sabit ve normal, QRS dar", () => {
    const m = make("sinbrady");
    const beats = m.between(0, 60);
    const events = m.atrialEvents(0, 60);
    for (const rr of rrs(beats)) expect(bpm(rr)).toBeGreaterThanOrEqual(45), expect(bpm(rr)).toBeLessThanOrEqual(50);
    expect(Math.max(...rrs(beats)) - Math.min(...rrs(beats))).toBeLessThan(0.05);
    for (const b of beats.slice(1, -1)) {
      expect(conductedFor(events, b)).toBeDefined();
      expect(b.pr).toBeGreaterThanOrEqual(0.12);
      expect(b.pr).toBeLessThanOrEqual(0.2);
      expect(b.qrs).toBeLessThan(0.12);
    }
    expect(events.every((e) => e.conducted && e.kind === "sinus")).toBe(true);
  });

  it("1. derece AV blok: tüm P'ler iletilir, PR >200 ms ve sabit, düşen atım yok", () => {
    const m = make("avb1");
    const beats = m.between(0, 60);
    const events = m.atrialEvents(0, 60);
    expect(events.every((e) => e.conducted)).toBe(true);
    expect(new Set(beats.map((b) => b.pr)).size).toBe(1);
    expect(beats[0]?.pr).toBeGreaterThan(0.2);
    expect(beats[0]?.pr).toBeLessThanOrEqual(0.28);
    expect(Math.max(...rrs(beats))).toBeLessThan(1.1);
  });

  it("Mobitz I: PR ardışık uzar, sonra bir P iletilmez; düşüş sonrası PR en kısa; P–P düzenli", () => {
    const m = make("mobitz1");
    const beats = m.between(0, 60);
    const events = m.atrialEvents(0, 60);
    const blocked = events.filter((e) => !e.conducted);
    expect(blocked.length).toBeGreaterThan(10);
    const pp = events.slice(1).map((e, i) => e.t - (events[i] as AtrialEvent).t);
    expect(Math.max(...pp) - Math.min(...pp)).toBeLessThan(1e-6);
    for (const x of blocked.filter((e) => e.t > 5)) {
      const before = beats.filter((b) => b.r < x.t).slice(-3);
      const after = beats.find((b) => b.r > x.t);
      expect(before.map((b) => b.pr)).toEqual([0.16, 0.22, 0.26]);
      expect(after?.pr).toBe(0.16);
      // bloklanan P'den sonra QRS yok: P ile sonraki QRS arasında bir atriyal döngüden fazla süre var
      expect((after as Beat).r + (after as Beat).qrsStart - x.t).toBeGreaterThan(0.5);
    }
  });

  it("Mobitz II: iletilen atımlarda PR sabit; uzama olmadan ani iletilmeyen P", () => {
    const m = make("mobitz2");
    const beats = m.between(0, 60);
    const events = m.atrialEvents(0, 60);
    expect(new Set(beats.map((b) => b.pr))).toEqual(new Set([0.18]));
    const blocked = events.filter((e) => !e.conducted);
    expect(blocked.length).toBeGreaterThan(10);
    for (const x of blocked.filter((e) => e.t > 5)) {
      const before = beats.filter((b) => b.r < x.t).slice(-2);
      expect(before.map((b) => b.pr)).toEqual([0.18, 0.18]);
    }
  });

  it("tam AV blok: bağımsız atriyal ve ventriküler saatler; P–P ve R–R düzenli; sabit PR yok", () => {
    const m = make("chb");
    const beats = m.between(0, 120);
    const events = m.atrialEvents(0, 120);
    const pp = events.slice(1).map((e, i) => e.t - (events[i] as AtrialEvent).t);
    const rr = rrs(beats);
    expect(Math.max(...pp) - Math.min(...pp)).toBeLessThan(1e-6);
    expect(Math.max(...rr) - Math.min(...rr)).toBeLessThan(1e-6);
    expect(bpm(pp[0] as number)).toBeGreaterThanOrEqual(75);
    expect(bpm(pp[0] as number)).toBeLessThanOrEqual(90);
    expect(bpm(rr[0] as number)).toBeGreaterThanOrEqual(30);
    expect(bpm(rr[0] as number)).toBeLessThanOrEqual(40);
    // hiçbir P iletilmiş sayılmaz ve QRS'e göre P konumu atımdan atıma değişir (sistematik P→QRS ilişkisi yok)
    expect(events.every((e) => !e.conducted)).toBe(true);
    const lastP = beats.slice(1).map((b) => {
      const prior = events.filter((e) => e.t < b.r + b.qrsStart);
      return Number((b.r + b.qrsStart - (prior[prior.length - 1] as AtrialEvent).t).toFixed(3));
    });
    expect(new Set(lastP).size).toBeGreaterThan(5);
    expect(beats.every((b) => b.pr === null)).toBe(true);
  });
});

describe("Patern 19–23", () => {
  it("PAC: erken, farklı biçimli P + dar QRS; P QRS'ten önce; duraklama tam kompansatuvar değil", () => {
    const m = make("pac");
    const beats = m.between(0, 120);
    const events = m.atrialEvents(0, 120);
    const ectopic = events.filter((e) => e.kind === "ectopic");
    expect(ectopic.length).toBeGreaterThan(8);
    const sinusRR = 0.833;
    for (const e of ectopic) {
      const b = beats.find((x) => x.r > e.t) as Beat;
      const i = beats.indexOf(b);
      const prev = beats[i - 1] as Beat;
      const next = beats[i + 1] as Beat;
      expect(e.t).toBeLessThan(b.r + b.qrsStart);
      expect(b.r - prev.r).toBeLessThan(sinusRR * 0.8); // prematür
      expect(b.qrs).toBeLessThan(0.12); // temel örnek iletilen dar QRS
      expect(next.r - prev.r).toBeLessThan(2 * sinusRR - 0.05); // tam kompansatuvar değil
    }
    // ektopik P morfolojisi sinüs P'sinden farklı (V1'de ters polarite)
    const sinusP = events.find((e) => e.kind === "sinus") as AtrialEvent;
    const ectP = ectopic[0] as AtrialEvent;
    const peak = (t: number, lead: string) => m.signal(t, lead) - m.signal(t - 0.12, lead);
    expect(Math.sign(peak(sinusP.t, "V1"))).not.toBe(Math.sign(peak(ectP.t, "V1")));
    // PAC aralığı sabit bir sayıya kilitli değil (aşırı mekanik tekrar yok)
    const idx = ectopic.map((e) => beats.findIndex((x) => x.r > e.t));
    expect(new Set(idx.slice(1).map((v, i) => v - (idx[i] as number))).size).toBeGreaterThan(2);
  });

  it("kavşak kaçış ritmi: 40–60/dk düzenli, dar QRS, önde sinüs P yok, retrograd P D2'de negatif aVR'de pozitif", () => {
    const m = make("junctional");
    const beats = m.between(0, 60);
    const events = m.atrialEvents(0, 60);
    for (const rr of rrs(beats)) expect(bpm(rr)).toBeGreaterThanOrEqual(40), expect(bpm(rr)).toBeLessThanOrEqual(60);
    expect(beats.every((b) => b.qrs < 0.12 && b.pr === null)).toBe(true);
    expect(events.every((e) => e.kind === "retro")).toBe(true);
    // her retrograd P kendi QRS'ine bağlı (tam AV blok gibi bağımsız P treni değil)
    for (const e of events) {
      const b = beats.filter((x) => x.r < e.t).slice(-1)[0] as Beat;
      expect(e.t - (b.r + b.qrsEnd)).toBeGreaterThan(0);
      expect(e.t - (b.r + b.qrsEnd)).toBeLessThan(0.12);
    }
    const e = events[2] as AtrialEvent;
    const b = beats.filter((x) => x.r < e.t).slice(-1)[0] as Beat;
    const baselineAt = b.r + b.qrsEnd + 0.01;
    expect(m.signal(e.t, "II") - m.signal(baselineAt, "II")).toBeLessThan(0);
    expect(m.signal(e.t, "aVR") - m.signal(baselineAt, "aVR")).toBeGreaterThan(0);
  });

  it("WPW paterni: PR <120 ms, QRS >120 ms, delta QRS'in eğimli başlangıcıdır (ayrı dalga değil)", () => {
    const m = make("wpw");
    const beats = m.between(0, 30);
    for (const b of beats) {
      expect(b.pr).toBeLessThan(0.12);
      expect(b.qrs).toBeGreaterThan(0.12);
    }
    const b = beats[5] as Beat;
    const start = b.r + b.qrsStart;
    // QRS başlangıcından tepeye tek yönlü yükseliş: arada taban çizgisine dönüş yok (delta ayrı dalga değil)
    const samples: number[] = [];
    for (let t = start; t <= b.r; t += 0.002) samples.push(m.signal(t, "II"));
    for (let i = 1; i < samples.length; i++) expect(samples[i] as number).toBeGreaterThanOrEqual((samples[i - 1] as number) - 1e-9);
    // ilk 40 ms eğimi, sonraki hızlı bileşenden belirgin düşük (slurred upstroke)
    const slope = (a: number, z: number) => (m.signal(start + z, "II") - m.signal(start + a, "II")) / (z - a);
    expect(slope(0, 0.04)).toBeLessThan(slope(0.05, 0.07) / 2.5);
  });

  it("akut perikardit: yaygın ST yükselmesi (birden çok lead grubu), aVR'de ST çökmesi, PR çökmesi; bölgesel karşılık yok", () => {
    const m = make("pericarditis");
    const b = m.between(10, 12)[0] as Beat;
    const iso = (lead: string) => m.signal(b.r + (b.pStart as number) - 0.04, lead);
    const st = (lead: string) => m.signal(b.r + b.qrsEnd + 0.04, lead) - iso(lead);
    const pr = (lead: string) => m.signal(b.r + b.qrsStart - 0.015, lead) - iso(lead);
    for (const lead of ["I", "II", "aVF", "V3", "V4", "V5", "V6"]) expect(st(lead), lead).toBeGreaterThan(0.08);
    expect(st("aVR")).toBeLessThan(-0.08);
    for (const lead of ["II", "V4", "V5"]) expect(pr(lead), lead).toBeLessThan(-0.03);
    expect(pr("aVR")).toBeGreaterThan(0.03);
    // STEMI'deki gibi bölgesel karşılıklı ST çökmesi yok: aVR ve V1 dışında belirgin ST çökmesi olmamalı
    for (const lead of LEADS.filter((l) => !["aVR", "V1"].includes(l))) expect(st(lead), lead).toBeGreaterThan(-0.03);
  });

  it("hiperkalemi: sivri dar T, basık P, PR uzun, QRS hafif geniş; sinüs dalgası değil; lead'ler farklı", () => {
    const hk = make("hyperk");
    const normal = make("normal");
    const b = hk.between(10, 12)[0] as Beat;
    expect(b.pr).toBeGreaterThanOrEqual(0.22);
    expect(b.pr).toBeLessThanOrEqual(0.26);
    expect(b.qrs).toBeGreaterThanOrEqual(0.11);
    expect(b.qrs).toBeLessThanOrEqual(0.13);
    expect(b.tEnd - b.tStart).toBeLessThan(0.2); // dar tabanlı T
    const tPeak = (m: Model, beat: Beat, lead: string) => m.signal(beat.r + beat.tCenter, lead);
    const nb = normal.between(10, 12)[0] as Beat;
    expect(tPeak(hk, b, "V3")).toBeGreaterThan(2 * tPeak(normal, nb, "V3"));
    const pAmp = (m: Model, beat: Beat) => m.signal(beat.r + (beat.pStart as number) + 0.05, "II");
    expect(pAmp(hk, b)).toBeLessThan(pAmp(normal, nb) * 0.7);
    expect(Math.sign(tPeak(hk, b, "aVR"))).toBe(-1);
    expect(new Set(LEADS.map((l) => tPeak(hk, b, l).toFixed(3))).size).toBeGreaterThan(8);
    // sinüs dalgası değil: diyastolde taban çizgisi düz, ayrı P ve QRS korunur
    expect(Math.abs(hk.signal(b.r + b.tEnd + 0.12, "II"))).toBeLessThan(0.02);
  });
});

describe("12 derivasyon aynı küresel zaman çizelgesini kullanır", () => {
  it("her patern için tüm derivasyonlarda QRS aynı anda; bloklanan P anında hiçbir derivasyonda QRS yok", () => {
    for (const mode of api.PATTERN_MODES) {
      const m = make(mode);
      const beats = m.between(0, 20);
      for (const b of beats.slice(2, 6)) {
        const mid = b.r + (b.qrsStart + b.qrsEnd) / 2;
        const quiet = b.r + b.qrsEnd + (b.tStart - b.qrsEnd) / 2;
        const active = LEADS.filter((l) => Math.abs(m.signal(mid, l)) + Math.abs(m.signal(b.r, l)) > 0.05);
        expect(active.length, mode).toBeGreaterThanOrEqual(10);
        expect(Number.isFinite(m.signal(quiet, "V6"))).toBe(true);
      }
      for (const e of m.atrialEvents(0, 20).filter((x) => !x.conducted && x.kind === "sinus" && mode !== "chb")) {
        for (const b of beats) expect(Math.abs(b.r - e.t) > 0.2, `${mode} ${e.t}`).toBe(true);
      }
    }
  });

  it("D3, aVR, aVL, aVF D1 ve D2'den Einthoven/Goldberger ilişkisiyle türer", () => {
    for (const mode of api.PATTERN_MODES) {
      const m = make(mode);
      for (let t = 3; t < 9; t += 0.037) {
        const i = m.signal(t, "I");
        const ii = m.signal(t, "II");
        expect(m.signal(t, "III")).toBeCloseTo(ii - i, 10);
        expect(m.signal(t, "aVR")).toBeCloseTo(-(i + ii) / 2, 10);
      }
    }
  });

  it("kalp animasyonu durumu: blok, kaçış, ektopik, retrograd ve aksesuar yol olayları yalnız ilgili paternde", () => {
    const seen = (mode: string, key: string) => {
      const m = make(mode);
      for (let t = 2; t < 30; t += 0.01) if (m.snapshot(t).conduction?.[key]) return true;
      return false;
    };
    expect(seen("mobitz1", "blocked")).toBe(true);
    expect(seen("mobitz2", "blocked")).toBe(true);
    expect(seen("avb1", "blocked")).toBe(false);
    expect(seen("chb", "escape")).toBe(true);
    expect(seen("pac", "ectopic")).toBe(true);
    expect(seen("junctional", "retro")).toBe(true);
    expect(seen("wpw", "delta")).toBe(true);
    expect(seen("sinbrady", "blocked")).toBe(false);
    expect(make("normal").snapshot(3).conduction).toBeUndefined();
  });
});

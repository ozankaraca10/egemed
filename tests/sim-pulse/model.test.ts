import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CardiacModel, LEADS, MODES } from "../../packages/sim-pulse/src/index";

// Golden değerler kaynak cardai/model.js'ten node -e / require ile hesaplandı.
const SNAPSHOTS = [
  ["normal", "qrs", "ST segmenti", 75, 800, 80, 1, false, false],
  ["af", "t", "İzoelektrik aralık · sürekli f etkinliği", 97, 618, 80, 0.6898349632892252, false, false],
  ["stemi", "qrs", "ST segmenti", 75, 800, 80, 1, true, false],
  ["pvc", "qrs", "ST segmenti", 75, 800, 80, 1, false, false],
  ["svt", "t", "T · Ventriküler repolarizasyon", 167, 360, 80, 0.76, false, false],
  ["inferior", "qrs", "ST segmenti", 75, 800, 80, 1, true, false],
  ["vt", "t", "İzoelektrik aralık", 158, 380, 180, 0.48, false, false],
  ["vf", "chaotic", "Kaotik ventriküler elektriksel etkinlik", null, 0, 0, 0, false, false],
  ["pat", "t", "T · Ventriküler repolarizasyon", 150, 400, 80, 0.74, false, true],
  ["flutter", "t", "T · Ventriküler repolarizasyon · sürekli F etkinliği", 150, 400, 80, 0.7, false, true],
  ["sintach", "t", "T · Ventriküler repolarizasyon", 120, 500, 80, 0.84, false, true],
  ["lbbb", "qrs", "QRS · Ventriküler depolarizasyon", 75, 800, 160, 0.9, false, false],
  ["rbbb", "qrs", "QRS · Ventriküler depolarizasyon", 75, 800, 140, 0.9, false, false],
] as const;

describe("CardiacModel — S0e kaynak golden değerleri", () => {
  it("13 modun snapshot alanları ve VF akımı birebir", () => {
    expect(MODES).toHaveLength(13);
    for (const [mode, phase, electrical, rate, rr, qrs, flow, ischaemia, eject] of SNAPSHOTS) {
      const snapshot = new CardiacModel(mode).snapshot(3.271);
      expect([snapshot.phase, snapshot.electrical, snapshot.rate, snapshot.rr, snapshot.qrs, snapshot.flow, snapshot.ischaemia, snapshot.eject], mode)
        .toEqual([phase, electrical, rate, rr, qrs, flow, ischaemia, eject]);
      if (mode === "vf") {
        expect(snapshot.flow).toBe(0);
        expect(snapshot.eject).toBe(false);
        expect(snapshot.electricalRate).toBeNull();
      }
    }
  });

  it("12 derivasyon sinyal örneklerini ve ekstremite türetimini korur", () => {
    const expected = [0.2016, 0.28, 0.0784, -0.2408, 0.0616, 0.1792, -0.0784, 0.042, 0.154, 0.28, 0.294, 0.2408];
    const model = new CardiacModel("normal");
    LEADS.forEach((lead, i) => expect(model.signal(2.61, lead)).toBeCloseTo(expected[i] ?? 0, 12));
    const vfExpected = [-0.029820603650536397, -0.2451859900766668, -0.2153653864261304, 0.1375032968636016,
      0.092772391387797, -0.2302756882513986, -0.11091699847569993, -0.2018220608501942, -0.08870993252991775,
      0.19262025576562872, 0.4449350970404871, 0.48467920232427864];
    LEADS.forEach((lead, i) => expect(new CardiacModel("vf").signal(2.31, lead)).toBeCloseTo(vfExpected[i] ?? 0, 12));
  });

  it("metrikleri yuvarlar ve fiducial alanlarını taşır", () => {
    const expected: ReadonlyArray<readonly [string, number | null, number | null, number | null, number | null, number]> = [
      ["normal", 175, 80, 350, 800, 0], ["af", null, 80, 350, 618, -0.02607527625046814],
      ["stemi", 175, 80, 350, 800, 0.24], ["pvc", 175, 80, 350, 800, 0], ["svt", null, 80, 245, 360, 0],
      ["inferior", 175, 80, 350, 800, -0.03], ["vt", null, 180, 345, 380, 0], ["vf", null, null, null, null, 0],
      ["pat", 140, 80, 245, 400, 0], ["flutter", null, 80, 245, 400, -0.013999999999999206],
      ["sintach", 175, 80, 245, 500, 0], ["lbbb", 175, 160, 430, 800, 0], ["rbbb", 175, 140, 410, 800, 0],
    ];
    for (const [mode, pr, qrs, qt, rr, st] of expected) {
      const metrics = new CardiacModel(mode).metrics(3.271, "V2");
      expect([metrics.pr, metrics.qrs, metrics.qt, metrics.rr], mode).toEqual([pr, qrs, qt, rr]);
      expect(metrics.st, mode).toBeCloseTo(st, 12);
      if (mode !== "vf") expect(metrics.fiducials?.qrsStart).toBeDefined();
    }
  });

  it("mekanik timeline tablosu ve faz etiketleri kaynak sırasıyla", () => {
    const timelines = [["normal", 0.035, 0.09, 0.3, 0.43, 0.38], ["svt", 0.025, 0.06, 0.18, 0.27, 0.25],
      ["vt", 0.04, 0.1, 0.25, 0.32, 0.3]] as const;
    for (const [mode, start, ejectStart, ejectEnd, relaxEnd, contractEnd] of timelines) {
      const model = new CardiacModel(mode), beat = model.between(2, 3)[0];
      if (beat === undefined) throw new Error(`${mode}: kaynak atımı bulunamadı`);
      const timeline = model.mechanicalTimeline(beat, { r: beat.r + beat.rr });
      expect([timeline.start, timeline.ejectStart, timeline.ejectEnd, timeline.relaxEnd, timeline.contractEnd])
        .toEqual([start, ejectStart, ejectEnd, relaxEnd, contractEnd]);
    }
    const normal = new CardiacModel("normal");
    expect([0, 0.08, 0.15, 0.25, 0.6].map((time) => normal.snapshot(time).phase)).toEqual(["fill", "qrs", "t", "t", "fill"]);
    expect([0, 0.01, 0.08, 0.15].map((time) => new CardiacModel("vf").snapshot(time).phase)).toEqual(["chaotic", "chaotic", "chaotic", "chaotic"]);
  });
});

describe("CardiacModel kaynak hijyeni", () => {
  it("global, rastgelelik ve saat bağımlılığı içermez", () => {
    const content = readFileSync("packages/sim-pulse/src/engine/model.ts", "utf8");
    expect(content).not.toMatch(/Math\.random|window|globalThis|CardAIModel|module\.exports/);
    expect(content).not.toMatch(/\bDate\b/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BeatEngine, LEADS, MODES } from "../../packages/sim-pulse/src/index";
import type { Beat, Checkpoint, Lead, Mode } from "../../packages/sim-pulse/src/index";

/** Golden değerler kaynak `cardai/model.js`'ten `node -e` ile hesaplanıp sabitlendi;
 *  `toEqual` tam duyarlıkla karşılaştırır (JSON round-trip). `BeatRow` alan sırası:
 *  n, r, rr, strength, prefix, isPVC, qrsStart, qrsEnd, pStart, pEnd, pCenter, pr,
 *  qrs, qt, tStart, tEnd, tCenter, j, stMeasure. */

type BeatRow = readonly [
  number,
  number,
  number,
  number,
  number,
  boolean,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function project(beat: Beat): BeatRow {
  return [
    beat.n,
    beat.r,
    beat.rr,
    beat.strength,
    beat.prefix,
    beat.isPVC,
    beat.qrsStart,
    beat.qrsEnd,
    beat.pStart,
    beat.pEnd,
    beat.pCenter,
    beat.pr,
    beat.qrs,
    beat.qt,
    beat.tStart,
    beat.tEnd,
    beat.tCenter,
    beat.j,
    beat.stMeasure,
  ];
}

function firstBeat(model: BeatEngine, mode: Mode): Beat {
  const beat = model.between(1, 8).find((candidate) => mode !== "pvc" || candidate.isPVC);
  if (beat === undefined) {
    throw new Error(`${mode}: atım bulunamadı`);
  }
  return beat;
}

/** Kaynak `qa/independent_model.mjs` T08-QRS tablosu (vf hariç); çizilen destek genişliği. */
const DRAWN_QRS_GOLDEN: ReadonlyArray<readonly [Mode, number]> = [
  ["normal", 80.00000000000001],
  ["af", 80.00000000000001],
  ["stemi", 80.00000000000001],
  ["pvc", 140],
  ["svt", 80.00000000000001],
  ["inferior", 80.00000000000001],
  ["vt", 180.00000000000003],
  ["pat", 80.00000000000001],
  ["flutter", 80.00000000000001],
  ["sintach", 80.00000000000001],
  ["lbbb", 160],
  ["rbbb", 140],
];

/** Kaynak RATE tablosu; af ve pvc kaynak denetiminde kapsam dışıdır. */
const RATE_GOLDEN: ReadonlyArray<readonly [Mode, number]> = [
  ["normal", 75],
  ["stemi", 75],
  ["svt", 167],
  ["inferior", 75],
  ["vt", 158],
  ["pat", 150],
  ["flutter", 150],
  ["sintach", 120],
  ["lbbb", 75],
  ["rbbb", 75],
];

/** [mod, beat sayısı, checkpoint sayısı, erken indexAt(3.271), geç indexAt(3.271)] */
const MEMORY_GOLDEN: ReadonlyArray<readonly [Mode, number, number, number, number]> = [
  ["normal", 17, 353, 10, 8],
  ["af", 18, 362, 10, 9],
  ["stemi", 17, 353, 10, 8],
  ["pvc", 17, 353, 10, 8],
  ["svt", 38, 783, 23, 19],
  ["inferior", 17, 353, 10, 8],
  ["vt", 35, 742, 21, 18],
  ["vf", 48, 1006, 30, 25],
  ["pat", 34, 705, 21, 17],
  ["flutter", 34, 705, 21, 17],
  ["sintach", 27, 564, 16, 14],
  ["lbbb", 17, 353, 10, 8],
  ["rbbb", 17, 353, 10, 8],
];

const LAST_CHECKPOINT_GOLDEN: ReadonlyArray<readonly [Mode, Checkpoint]> = [
  ["normal", { n: 45056, r: 36035.99999999085, prefix: 45056 }],
  ["af", { n: 46208, r: 36023.17869730704, prefix: 35990.38828351909 }],
  ["vf", { n: 128640, r: 36010.39999993512, prefix: 0 }],
];

/** Mod başına sabit RR/güç; af, pvc ve hız seçenekleri ayrıca sınanır. */
const STATIC_RR_GOLDEN: ReadonlyArray<readonly [Mode, number, number]> = [
  ["normal", 0.8, 1],
  ["stemi", 0.8, 1],
  ["svt", 0.36, 0.76],
  ["inferior", 0.8, 1],
  ["vt", 0.38, 0.48],
  ["vf", 0.28, 0],
  ["pat", 0.4, 0.74],
  ["flutter", 0.4, 0.7],
  ["sintach", 0.5, 0.84],
  ["lbbb", 0.8, 0.9],
  ["rbbb", 0.8, 0.9],
];

const PVC_RR_GOLDEN: readonly number[] = [0.8, 0.8, 0.48, 1.12, 0.8];
const PVC_STRENGTH_GOLDEN: readonly number[] = [1, 1, 0.68, 1.06, 1];

const AF_RR_GOLDEN: readonly number[] = [
  0.634735731857313, 0.7099277170400993, 0.9986368234270844, 0.9863023794342707,
  0.8292267304529967, 0.8211724503423888, 0.8357570500058629, 0.7085999629619033,
];
const AF_STRENGTH_GOLDEN: readonly number[] = [
  0.6991046525215222, 0.7404602443720547, 0.8992502528848965, 0.8924663086888489,
  0.8060747017491483, 0.8016448476883139, 0.8096663775032247, 0.7397299796290469,
];
const AF_RAPID_RR_GOLDEN: readonly number[] = [
  0.36069833085238656, 0.4030756584327173, 0.5592747941964552, 0.5527091752967632,
  0.46839722735122546, 0.4640311396219247, 0.47193350278563784, 0.4023386359277664,
];
const AF_RAPID_STRENGTH_GOLDEN: readonly number[] = [
  0.6913840819688126, 0.7146916121379946, 0.8006011368080505, 0.7969900464132198,
  0.750618475043174, 0.7482171267920587, 0.7525634265321008, 0.7142862497602716,
];
const RATE_100_RR_GOLDEN: readonly number[] = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6];

const NORMAL_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [12, 1.599999999999999, 0.8, 1, 13, false, -0.04, 0.04, -0.215, -0.125, -0.16999999999999998, 0.175, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [13, 2.399999999999999, 0.8, 1, 14, false, -0.04, 0.04, -0.215, -0.125, -0.16999999999999998, 0.175, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
];
const PVC_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [12, 1.2799999999999991, 0.48, 0.68, 12.16, true, -0.06, 0.08000000000000002, null, null, null, null, 0.14, 0.41000000000000003, 0.15000000000000002, 0.35000000000000003, 0.25, 0.08000000000000002, 0.10000000000000002],
  [13, 2.3999999999999995, 1.12, 1.06, 13.22, false, -0.04, 0.04, -0.215, -0.125, -0.16999999999999998, 0.175, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
];
const AF_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [12, 1.5843853269510577, 0.8672489615636181, 0.82698692885999, 10.261411929823081, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [13, 2.2952022179420273, 0.7108168909909697, 0.7409492900450334, 11.002361219868115, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [14, 2.913083969376982, 0.6178817514349548, 0.6898349632892252, 11.69219618315734, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
];
const LBBB_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [12, 1.599999999999999, 0.8, 0.9, 11.700000000000003, false, -0.07, 0.09, -0.245, -0.155, -0.2, 0.175, 0.16, 0.43, 0.16, 0.36, 0.26, 0.09, 0.11],
  [13, 2.399999999999999, 0.8, 0.9, 12.600000000000003, false, -0.07, 0.09, -0.245, -0.155, -0.2, 0.175, 0.16, 0.43, 0.16, 0.36, 0.26, 0.09, 0.11],
];
const VF_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [34, 1.0000000000000038, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [35, 1.2800000000000038, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [36, 1.5600000000000038, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [37, 1.8400000000000039, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [38, 2.1200000000000037, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [39, 2.400000000000004, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [40, 2.680000000000004, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [41, 2.9600000000000044, 0.28, 0, 0, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
];
const AF_RAPID_BEATS_GOLDEN: ReadonlyArray<BeatRow> = [
  [21, 1.1202291892038563, 0.5114657350975, 0.774306154303625, 16.30212605406212, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [22, 1.4825153780231917, 0.3622861888193354, 0.6922574038506345, 16.994383457912758, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [23, 1.9096303813446451, 0.4271150033214536, 0.7279132518267996, 17.722296709739556, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
  [24, 2.459719038020828, 0.5500886566761831, 0.7955487611719008, 18.517845470911457, false, -0.04, 0.04, null, null, null, null, 0.08, 0.35000000000000003, 0.11000000000000001, 0.31000000000000005, 0.21000000000000002, 0.04, 0.06],
];

const QRS_SIGNAL_GOLDEN: ReadonlyArray<readonly [Mode, Lead, number, number]> = [
  ["normal", "I", 0.25, 0.04199999999999995],
  ["normal", "I", 0.5, 0.7199999999999999],
  ["normal", "I", 0.75, -0.15],
  ["normal", "II", 0.25, 0.058333333333333265],
  ["normal", "II", 0.5, 0.9999999999999999],
  ["normal", "II", 0.75, -0.20833333333333331],
  ["normal", "V1", 0.25, -0.036166666666666625],
  ["normal", "V1", 0.5, -0.6199999999999999],
  ["normal", "V1", 0.75, 0.12916666666666665],
  ["normal", "V5", 0.25, 0.06183333333333326],
  ["normal", "V5", 0.5, 1.0599999999999998],
  ["normal", "V5", 0.75, -0.22083333333333333],
  ["normal", "V6", 0.25, 0.047833333333333276],
  ["normal", "V6", 0.5, 0.8199999999999998],
  ["normal", "V6", 0.75, -0.1708333333333333],
  ["pvc", "I", 0.25, 0.13871999999999995],
  ["pvc", "I", 0.5, 0.5059636363636364],
  ["pvc", "I", 0.75, -0.27814736842105264],
  ["pvc", "II", 0.25, 0.1926666666666666],
  ["pvc", "II", 0.5, 0.7027272727272729],
  ["pvc", "II", 0.75, -0.3863157894736842],
  ["pvc", "V1", 0.25, -0.11945333333333329],
  ["pvc", "V1", 0.5, -0.4356909090909092],
  ["pvc", "V1", 0.75, 0.2395157894736842],
  ["pvc", "V5", 0.25, 0.2042266666666666],
  ["pvc", "V5", 0.5, 0.7448909090909093],
  ["pvc", "V5", 0.75, -0.4094947368421053],
  ["pvc", "V6", 0.25, 0.1579866666666666],
  ["pvc", "V6", 0.5, 0.5762363636363638],
  ["pvc", "V6", 0.75, -0.31677894736842105],
  ["vt", "I", 0.25, 0.1312941176470588],
  ["vt", "I", 0.5, 0.712421052631579],
  ["vt", "I", 0.75, 0.03999999999999946],
  ["vt", "II", 0.25, 0.18235294117647058],
  ["vt", "II", 0.5, 0.9894736842105264],
  ["vt", "II", 0.75, 0.0555555555555548],
  ["vt", "V1", 0.25, -0.11305882352941175],
  ["vt", "V1", 0.5, -0.6134736842105264],
  ["vt", "V1", 0.75, -0.03444444444444398],
  ["vt", "V5", 0.25, 0.1932941176470588],
  ["vt", "V5", 0.5, 1.048842105263158],
  ["vt", "V5", 0.75, 0.058888888888888095],
  ["vt", "V6", 0.25, 0.14952941176470586],
  ["vt", "V6", 0.5, 0.8113684210526316],
  ["vt", "V6", 0.75, 0.04555555555555493],
  ["lbbb", "I", 0.25, 0.17999999999999994],
  ["lbbb", "I", 0.5, 0.5700000000000001],
  ["lbbb", "I", 0.75, 0.9357894736842105],
  ["lbbb", "II", 0.25, 0.054999999999999966],
  ["lbbb", "II", 0.5, 0.6573913043478261],
  ["lbbb", "II", 0.75, 0.26880000000000015],
  ["lbbb", "V1", 0.25, -0.29200000000000004],
  ["lbbb", "V1", 0.5, -0.976],
  ["lbbb", "V1", 0.75, -0.7720000000000001],
  ["lbbb", "V5", 0.25, 0.17999999999999994],
  ["lbbb", "V5", 0.5, 0.5700000000000001],
  ["lbbb", "V5", 0.75, 0.9357894736842105],
  ["lbbb", "V6", 0.25, 0.17999999999999994],
  ["lbbb", "V6", 0.5, 0.5700000000000001],
  ["lbbb", "V6", 0.75, 0.9357894736842105],
  ["rbbb", "I", 0.25, 0.22624999999999995],
  ["rbbb", "I", 0.5, 0.3694736842105265],
  ["rbbb", "I", 0.75, -0.2914285714285714],
  ["rbbb", "II", 0.25, 0.2788235294117647],
  ["rbbb", "II", 0.5, 0.33428571428571435],
  ["rbbb", "II", 0.75, -0.17448275862068963],
  ["rbbb", "V1", 0.25, -0.0789473684210526],
  ["rbbb", "V1", 0.5, 0.5168000000000001],
  ["rbbb", "V1", 0.75, 0.58],
  ["rbbb", "V5", 0.25, 0.22624999999999995],
  ["rbbb", "V5", 0.5, 0.3694736842105265],
  ["rbbb", "V5", 0.75, -0.2914285714285714],
  ["rbbb", "V6", 0.25, 0.22624999999999995],
  ["rbbb", "V6", 0.5, 0.3694736842105265],
  ["rbbb", "V6", 0.75, -0.2914285714285714],
];

describe("BeatEngine — QRS genişliği ve hız (kaynak davranışı)", () => {
  it("mod başına çizilen QRS genişliği ve bildirilen süre kaynak tablosuyla aynı (T08-QRS)", () => {
    for (const [mode, expectedMs] of DRAWN_QRS_GOLDEN) {
      const model = new BeatEngine(mode);
      const beat = firstBeat(model, mode);
      let drawnMs = 0;
      for (const lead of LEADS) {
        let first: number | null = null;
        let last: number | null = null;
        for (let n = -1200; n <= 1800; n += 1) {
          const d = n * 0.0001;
          if (Math.abs(model.qrsSignal(d, lead, beat)) > 1e-5) {
            if (first === null) {
              first = d;
            }
            last = d;
          }
        }
        if (first !== null && last !== null) {
          drawnMs = Math.max(drawnMs, (last - first + 0.0002) * 1000);
        }
      }
      expect(Math.abs(drawnMs - expectedMs), mode).toBeLessThanOrEqual(2);
      expect(beat.qrs * 1000, mode).toBeCloseTo(expectedMs, 9);
    }
  });

  it("ölçülen hız kaynak bağımsız tablosuyla uyumlu (RATE)", () => {
    for (const [mode, expectedRate] of RATE_GOLDEN) {
      const beats = new BeatEngine(mode).between(1, 8);
      const first = beats[0];
      const last = beats.at(-1);
      if (first === undefined || last === undefined) {
        throw new Error(`${mode}: atım bulunamadı`);
      }
      const rate = 60 / ((last.r - first.r) / (beats.length - 1));
      expect(Math.abs(rate - expectedRate), mode).toBeLessThanOrEqual(1);
    }
  });

  it("AF RR aralıkları hash profiliyle düzensiz (AF-IRREGULAR)", () => {
    const rr = new BeatEngine("af").between(0, 10).map((beat) => beat.rr);
    expect(new Set(rr.map((value) => value.toFixed(3))).size).toBeGreaterThan(8);
    expect(Math.min(...rr)).toBe(0.60869729693002);
    expect(Math.max(...rr)).toBe(0.972340170910043);
  });

  it("PVC kompansatuar duraklama ve ektopik QRS (PVC-COMPENSATION)", () => {
    const beats = new BeatEngine("pvc").between(0, 10);
    const index = beats.findIndex((beat) => beat.isPVC);
    expect(index).toBeGreaterThanOrEqual(0);
    const ectopic = beats[index];
    const pause = beats[index + 1];
    expect(ectopic?.rr).toBe(0.48);
    expect(ectopic?.qrs).toBe(0.14);
    expect(pause?.rr).toBe(1.12);
    expect((ectopic?.rr ?? 0) + (pause?.rr ?? 0)).toBeCloseTo(1.6, 12);
    expect(beats.find((beat) => !beat.isPVC)?.qrs).toBe(0.08);
  });
});

describe("BeatEngine — mod, hız ve normalizasyon", () => {
  it("rrAt/strengthAt mod döngüleri golden değerlerle birebir", () => {
    for (const [mode, expectedRr, expectedStrength] of STATIC_RR_GOLDEN) {
      const model = new BeatEngine(mode);
      for (let n = 0; n < 8; n += 1) {
        const rr = model.rrAt(n);
        expect(rr, `${mode} rr[${n}]`).toBe(expectedRr);
        expect(model.strengthAt(n, rr), `${mode} strength[${n}]`).toBe(expectedStrength);
      }
    }
    const pvc = new BeatEngine("pvc");
    for (let n = 0; n < 8; n += 1) {
      const rr = pvc.rrAt(n);
      expect(rr, `pvc rr[${n}]`).toBe(PVC_RR_GOLDEN[n % 5]);
      expect(pvc.strengthAt(n, rr), `pvc strength[${n}]`).toBe(PVC_STRENGTH_GOLDEN[n % 5]);
    }
    const af = new BeatEngine("af");
    for (const [n, rr] of AF_RR_GOLDEN.entries()) {
      expect(af.rrAt(n), `af rr[${n}]`).toBe(rr);
      expect(af.strengthAt(n, rr), `af strength[${n}]`).toBe(AF_STRENGTH_GOLDEN[n]);
    }
    const rapid = new BeatEngine("af", { afProfile: "rapid" });
    for (const [n, rr] of AF_RAPID_RR_GOLDEN.entries()) {
      expect(rapid.rrAt(n), `af rapid rr[${n}]`).toBe(rr);
      expect(rapid.strengthAt(n, rr), `af rapid strength[${n}]`).toBe(AF_RAPID_STRENGTH_GOLDEN[n]);
    }
    const fixed = new BeatEngine("normal", { rate: 100 });
    for (const [n, expected] of RATE_100_RR_GOLDEN.entries()) {
      expect(fixed.rrAt(n), `rate 100 rr[${n}]`).toBe(expected);
    }
  });

  it("hız guard'ı: 50–220 dışı, AF/PVC/flutter/VF ve sayı olmayan hız reddedilir", () => {
    const accepted = new BeatEngine("normal", { rate: 100 });
    expect(accepted.rrAt(0)).toBe(0.6);
    expect(accepted.options).toEqual({ afProfile: "controlled", rate: 100 });
    expect(new BeatEngine("normal", { rate: 50 }).rrAt(0)).toBe(1.2);
    expect(new BeatEngine("normal", { rate: 220 }).rrAt(0)).toBe(60 / 220);
    expect(new BeatEngine("normal", { rate: 49 }).rrAt(0)).toBe(0.8);
    expect(new BeatEngine("normal", { rate: 221 }).rrAt(0)).toBe(0.8);
    expect(new BeatEngine("normal", { rate: Number.NaN }).rrAt(0)).toBe(0.8);
    expect(new BeatEngine("normal", { rate: "100" as unknown as number }).rrAt(0)).toBe(0.8);
    const excluded: ReadonlyArray<readonly [Mode, number]> = [
      ["af", 0.9986368234270844],
      ["pvc", 0.48],
      ["flutter", 0.4],
      ["vf", 0.28],
    ];
    for (const [mode, expectedRr] of excluded) {
      const model = new BeatEngine(mode, { rate: 100 });
      expect(model.options).toEqual({ afProfile: "controlled" });
      expect(model.rrAt(2), mode).toBe(expectedRr);
    }
  });

  it("mod ve afProfile normalizasyonu kaynakla aynı", () => {
    expect(new BeatEngine("bogus").mode).toBe("normal");
    expect(new BeatEngine("bogus").rrAt(0)).toBe(0.8);
    expect(new BeatEngine("af", { afProfile: "weird" }).afProfile).toBe("controlled");
    expect(new BeatEngine("af", { afProfile: "rapid" }).afProfile).toBe("rapid");
    for (const mode of MODES) {
      expect(new BeatEngine(mode).mode, mode).toBe(mode);
    }
  });
});

describe("BeatEngine — checkpoint ve atım önbelleği", () => {
  it("kurucu checkpoint'ları golden ile aynı", () => {
    expect(new BeatEngine("normal").checkpoints).toEqual([
      { n: 0, r: -8.8, prefix: 0 },
      { n: 128, r: 93.5999999999998, prefix: 128 },
    ]);
    expect(new BeatEngine("vf").checkpoints).toEqual([
      { n: 0, r: -8.8, prefix: 0 },
      { n: 128, r: 27.040000000000035, prefix: 0 },
    ]);
    expect(new BeatEngine("af", { afProfile: "rapid" }).checkpoints).toEqual([
      { n: 0, r: -8.8, prefix: 0 },
      { n: 128, r: 48.06242366909824, prefix: 94.37833301800403 },
    ]);
  });

  it("36000 sn aramada beat < 200, checkpoint < 1500 ve sayılar golden (T18 bellek)", () => {
    for (const [mode, expectedBeats, expectedCheckpoints] of MEMORY_GOLDEN) {
      const model = new BeatEngine(mode);
      model.ensure(36000);
      expect(model.beats.length, `${mode} beat`).toBeLessThan(200);
      expect(model.checkpoints.length, `${mode} checkpoint`).toBeLessThan(1500);
      expect(model.beats.length, `${mode} beat golden`).toBe(expectedBeats);
      expect(model.checkpoints.length, `${mode} checkpoint golden`).toBe(expectedCheckpoints);
    }
    for (const [mode, expected] of LAST_CHECKPOINT_GOLDEN) {
      const model = new BeatEngine(mode);
      model.ensure(36000);
      expect(model.checkpoints.at(-1), mode).toEqual(expected);
    }
  });

  it("seek determinizmi: 36000 sn sonrası aynı aralık aynı atımları verir", () => {
    for (const [mode, , , earlyIndex, lateIndex] of MEMORY_GOLDEN) {
      const model = new BeatEngine(mode);
      const early = model.between(3.2, 3.4).map(project);
      expect(model.indexAt(3.271), `${mode} erken indeks`).toBe(earlyIndex);
      model.ensure(36000);
      const late = model.between(3.2, 3.4).map(project);
      expect(late, mode).toEqual(early);
      expect(model.indexAt(3.271), `${mode} geç indeks`).toBe(lateIndex);
    }
  });

  it("iki bağımsız örnek aynı atım serisini üretir (durum paylaşımı yok)", () => {
    const first = new BeatEngine("pvc").between(0, 25).map(project);
    const second = new BeatEngine("pvc").between(0, 25).map(project);
    expect(second).toEqual(first);
    expect(new BeatEngine("af").between(0, 25).map(project)).toEqual(
      new BeatEngine("af").between(0, 25).map(project),
    );
  });

  it("between: boş/sırasız aralıklar, kırpma ve geniş aralık tekilleştirmesi", () => {
    const model = new BeatEngine("normal");
    expect(model.between(Number.NaN, 2)).toEqual([]);
    expect(model.between(1, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(model.between(2, 1)).toEqual([]);
    expect(model.between(-100, -50).map((beat) => [beat.n, beat.r])).toEqual([[0, -8]]);
    expect(model.between(40000, 50000)).toEqual([]);
    const wide = model.between(-5, 40).map((beat) => beat.n);
    expect(wide.length).toBe(57);
    expect(wide[0]).toBe(4);
    expect(wide.at(-1)).toBe(60);
    expect(new Set(wide).size).toBe(wide.length);
    expect(model.indexAt(-8)).toBe(0);
    expect(model.indexAt(0)).toBe(9);
    expect(model.lowerBound(0)).toBe(10);
    expect(model.lowerBound(-100)).toBe(0);
  });

  it("between(1,3) atım projeksiyonları golden ile birebir", () => {
    expect(new BeatEngine("normal").between(1, 3).map(project)).toEqual(NORMAL_BEATS_GOLDEN);
    expect(new BeatEngine("pvc").between(1, 3).map(project)).toEqual(PVC_BEATS_GOLDEN);
    expect(new BeatEngine("af").between(1, 3).map(project)).toEqual(AF_BEATS_GOLDEN);
    expect(new BeatEngine("lbbb").between(1, 3).map(project)).toEqual(LBBB_BEATS_GOLDEN);
    expect(new BeatEngine("vf").between(1, 3).map(project)).toEqual(VF_BEATS_GOLDEN);
    expect(new BeatEngine("af", { afProfile: "rapid" }).between(1, 3).map(project)).toEqual(
      AF_RAPID_BEATS_GOLDEN,
    );
  });
});

describe("BeatEngine — QRS bileşeni (qrsSignal)", () => {
  it("golden örneklerle birebir (normal, PVC, VT, LBBB, RBBB)", () => {
    const models = new Map<Mode, BeatEngine>();
    for (const [mode, lead, u, expected] of QRS_SIGNAL_GOLDEN) {
      const model = models.get(mode) ?? new BeatEngine(mode);
      models.set(mode, model);
      const beat = firstBeat(model, mode);
      expect(model.qrsSignal(beat.qrsStart + beat.qrs * u, lead, beat), `${mode} ${lead} u=${u}`).toBe(
        expected,
      );
    }
  });

  it("destek dışında 0; destek uçları ve genişletilmiş lead grupları kaynakla aynı", () => {
    const model = new BeatEngine("normal");
    const beat = firstBeat(model, "normal");
    expect(model.qrsSignal(beat.qrsStart - 0.001, "II", beat)).toBe(0);
    expect(model.qrsSignal(beat.qrsEnd + 0.001, "II", beat)).toBe(0);
    expect(model.qrsSignal(beat.qrsStart, "II", beat)).toBe(0);
    expect(model.qrsSignal(beat.qrsStart + beat.qrs, "II", beat)).toBe(0);
    const lbbb = new BeatEngine("lbbb");
    const lbbbBeat = firstBeat(lbbb, "lbbb");
    const u = lbbbBeat.qrsStart + lbbbBeat.qrs * 0.5;
    expect(lbbb.qrsSignal(u, "V5", lbbbBeat)).toBe(lbbb.qrsSignal(u, "I", lbbbBeat));
    expect(lbbb.qrsSignal(u, "V6", lbbbBeat)).toBe(lbbb.qrsSignal(u, "I", lbbbBeat));
    const rbbb = new BeatEngine("rbbb");
    const rbbbBeat = firstBeat(rbbb, "rbbb");
    const ru = rbbbBeat.qrsStart + rbbbBeat.qrs * 0.5;
    expect(rbbb.qrsSignal(ru, "V5", rbbbBeat)).toBe(rbbb.qrsSignal(ru, "I", rbbbBeat));
    expect(rbbb.qrsSignal(ru, "V1", rbbbBeat)).not.toBe(rbbb.qrsSignal(ru, "V5", rbbbBeat));
  });
});

describe("kaynak hijyeni (beats)", () => {
  const file = "packages/sim-pulse/src/engine/beats.ts";

  it("global yazımı, rastgelelik ve saat bağımlılığı yoktur", () => {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(/Math\.random|window|globalThis|CardAIModel|module\.exports|\(function/);
    expect(content).not.toMatch(/\bDate\b/);
  });
});

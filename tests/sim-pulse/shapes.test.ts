import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEADS,
  MODES,
  NO_P,
  SHAPES,
  anteriorST,
  bell,
  clamp,
  fiducials,
  hash,
  inferiorST,
  interpolate,
  leadShape,
  limb,
  pShape,
  tShape,
} from "../../packages/sim-pulse/src/index";
import type { Fiducials, LeadShape, Mode, ShapeKey, WaveformPoint } from "../../packages/sim-pulse/src/index";

/** Golden değerler kaynak `cardai/model.js`'ten `node -e` ile hesaplanıp
 *  sabitlendi; `toEqual` tam duyarlıkla karşılaştırır (JSON round-trip). */

const LEAD_SHAPE_GOLDEN: LeadShape = {
  I: 0.72, II: 1, III: 0.28, aVR: -0.86, aVL: 0.21999999999999997, aVF: 0.64,
  V1: -0.62, V2: -0.28, V3: 0.34, V4: 0.92, V5: 1.06, V6: 0.82,
};

const P_SHAPE_GOLDEN: LeadShape = {
  I: 0.8, II: 1, III: 0.19999999999999996, aVR: -0.9, aVL: 0.30000000000000004, aVF: 0.6,
  V1: 0.55, V2: 0.75, V3: 0.78, V4: 0.7, V5: 0.62, V6: 0.55,
};

const T_SHAPE_GOLDEN: LeadShape = {
  I: 0.72, II: 1, III: 0.28, aVR: -0.86, aVL: 0.21999999999999997, aVF: 0.64,
  V1: -0.28, V2: 0.15, V3: 0.55, V4: 1, V5: 1.05, V6: 0.86,
};

const ANTERIOR_ST_GOLDEN: LeadShape = {
  I: 0.04, II: -0.04, III: -0.08, aVR: -0, aVL: 0.06, aVF: -0.06,
  V1: 0.12, V2: 0.24, V3: 0.32, V4: 0.24, V5: 0.08, V6: 0.03,
};

const INFERIOR_ST_GOLDEN: LeadShape = {
  I: -0.08, II: 0.2, III: 0.28, aVR: -0.060000000000000005, aVL: -0.18, aVF: 0.24000000000000002,
  V1: -0.04, V2: -0.03, V3: 0, V4: 0.02, V5: 0.04, V6: 0.04,
};

const SHAPES_GOLDEN: Record<ShapeKey, ReadonlyArray<WaveformPoint>> = {
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

const NORMAL_FIDUCIALS: Fiducials = {
  qrsStart: -0.04, qrsEnd: 0.04, pStart: -0.215, pEnd: -0.125, pCenter: -0.16999999999999998,
  pr: 0.175, qrs: 0.08, qt: 0.35000000000000003, tStart: 0.11000000000000001,
  tEnd: 0.31000000000000005, tCenter: 0.21000000000000002, j: 0.04, stMeasure: 0.06,
};

/** NO_P modlarında P yok; gerisi normal atışla aynı. */
const NO_P_FIDUCIALS: Fiducials = { ...NORMAL_FIDUCIALS, pStart: null, pEnd: null, pCenter: null, pr: null };

/** pvc + isPVC: geniş QRS, P yok; tüm alanlar ektopik morfolojiden. */
const ECTOPIC_FIDUCIALS: Fiducials = {
  qrsStart: -0.06, qrsEnd: 0.08000000000000002, pStart: null, pEnd: null, pCenter: null, pr: null,
  qrs: 0.14, qt: 0.41000000000000003, tStart: 0.15000000000000002, tEnd: 0.35000000000000003,
  tCenter: 0.25, j: 0.08000000000000002, stMeasure: 0.10000000000000002,
};

const FIDUCIAL_GOLDEN: ReadonlyArray<{ mode: Mode; isPVC?: boolean; expected: Fiducials }> = [
  { mode: "normal", expected: NORMAL_FIDUCIALS },
  { mode: "af", expected: NO_P_FIDUCIALS },
  { mode: "pvc", expected: NORMAL_FIDUCIALS },
  { mode: "pvc", isPVC: true, expected: ECTOPIC_FIDUCIALS },
  { mode: "svt", expected: { ...NO_P_FIDUCIALS, qt: 0.24500000000000002, tStart: 0.065, tEnd: 0.20500000000000002, tCenter: 0.135 } },
  { mode: "rbbb", expected: { ...ECTOPIC_FIDUCIALS, pStart: -0.235, pEnd: -0.145, pCenter: -0.19, pr: 0.175 } },
  { mode: "pat", expected: {
      ...NO_P_FIDUCIALS, pStart: -0.18000000000000002, pEnd: -0.09000000000000002, pCenter: -0.135,
      pr: 0.14, qt: 0.24500000000000002, tStart: 0.065, tEnd: 0.20500000000000002, tCenter: 0.135,
    } },
  { mode: "vt", expected: {
      qrsStart: -0.07, qrsEnd: 0.10999999999999999, pStart: null, pEnd: null, pCenter: null, pr: null,
      qrs: 0.18, qt: 0.34500000000000003, tStart: 0.13499999999999998, tEnd: 0.275,
      tCenter: 0.20500000000000002, j: 0.10999999999999999, stMeasure: 0.12999999999999998,
    } },
  { mode: "lbbb", expected: {
      qrsStart: -0.07, qrsEnd: 0.09, pStart: -0.245, pEnd: -0.155, pCenter: -0.2, pr: 0.175,
      qrs: 0.16, qt: 0.43, tStart: 0.16, tEnd: 0.36, tCenter: 0.26, j: 0.09, stMeasure: 0.11,
    } },
];

/** Kaynak `qa/independent_model.mjs` T08-QRS tablosu (vf hariç 12 mod). */
const EXPECTED_QRS_MS: ReadonlyArray<readonly [Mode, boolean, number]> = [
  ["normal", false, 80], ["af", false, 80], ["stemi", false, 80], ["pvc", true, 140],
  ["svt", false, 80], ["inferior", false, 80], ["vt", false, 180], ["pat", false, 80],
  ["flutter", false, 80], ["sintach", false, 80], ["lbbb", false, 160], ["rbbb", false, 140],
];

const HASH_GOLDEN: ReadonlyArray<readonly [number, number]> = [
  [0, 0.13492594263516366], [1, 0.3468986719381064], [2, 0.9972057458944619],
  [3, 0.9718432505615056], [10, 0.7258520778268576], [42, 0.6098889790009707],
  [77, 0.5649187497328967], [1000, 0.5358542795293033], [123456, 0.36252940772101283],
  [4294967295, 0.09084955765865743],
];

describe("model sabitleri (kaynak davranışı)", () => {
  it("mod, lead ve P'siz mod listeleri kaynak sırasıyla aynıdır", () => {
    expect(MODES).toEqual([
      "normal", "af", "stemi", "pvc", "svt", "inferior", "vt", "vf",
      "pat", "flutter", "sintach", "lbbb", "rbbb",
    ]);
    expect(LEADS).toEqual(["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]);
    expect(NO_P).toEqual(["af", "svt", "vt", "vf", "flutter"]);
    for (const mode of NO_P) {
      expect(MODES).toContain(mode);
    }
  });

  it("ekstremite kimlikleri: III = II − I, aVR = −(I+II)/2, aVL = I − II/2, aVF = II − I/2", () => {
    const pairs: ReadonlyArray<readonly [number, number]> = [
      [0, 0], [1, 1], [0.72, 1], [0.8, 1], [0.04, -0.04], [-0.08, 0.2],
    ];
    for (const [i, ii] of pairs) {
      const derived = limb(i, ii);
      expect(derived.I).toBe(i);
      expect(derived.II).toBe(ii);
      expect(derived.III).toBe(ii - i);
      expect(derived.aVR).toBe(-(i + ii) / 2);
      expect(derived.aVL).toBe(i - ii / 2);
      expect(derived.aVF).toBe(ii - i / 2);
    }
  });

  it("lead/P/T ve ST haritaları golden değerlerle birebir", () => {
    expect(leadShape).toEqual(LEAD_SHAPE_GOLDEN);
    expect(pShape).toEqual(P_SHAPE_GOLDEN);
    expect(tShape).toEqual(T_SHAPE_GOLDEN);
    expect(anteriorST).toEqual(ANTERIOR_ST_GOLDEN);
    expect(inferiorST).toEqual(INFERIOR_ST_GOLDEN);
    for (const map of [leadShape, pShape, tShape, anteriorST, inferiorST]) {
      expect(Object.keys(map).sort()).toEqual([...LEADS].sort());
    }
  });

  it("QRS morfolojileri destek noktalarıyla birebir; u ekseni artan, uçlar [0,0] ve [1,0]", () => {
    expect(SHAPES).toEqual(SHAPES_GOLDEN);
    for (const key of Object.keys(SHAPES) as ShapeKey[]) {
      const points = SHAPES[key];
      expect(points[0], key).toEqual([0, 0]);
      expect(points.at(-1), key).toEqual([1, 0]);
      for (let i = 1; i < points.length; i += 1) {
        expect(points[i]?.[0], `${key}[${i}]`).toBeGreaterThan(points[i - 1]?.[0] ?? Number.NaN);
      }
    }
  });
});

describe("fiducials (kalp döngüsü referansları)", () => {
  it("golden modlar birebir", () => {
    for (const { mode, isPVC, expected } of FIDUCIAL_GOLDEN) {
      expect(fiducials(mode, isPVC ?? false), isPVC === true ? `${mode} (ektopik)` : mode).toEqual(expected);
    }
  });

  it("QRS genişlikleri kaynak bağımsız kontrol tablosuyla uyumlu (T08-QRS)", () => {
    for (const [mode, isPVC, ms] of EXPECTED_QRS_MS) {
      expect(fiducials(mode, isPVC).qrs * 1000, mode).toBeCloseTo(ms, 9);
    }
  });

  it("P dalgası yalnız NO_P dışı modlarda ve non-ektopik atışlarda bulunur", () => {
    for (const mode of MODES) {
      const beat = fiducials(mode);
      const hasP = !NO_P.includes(mode);
      expect(beat.pStart === null, mode).toBe(!hasP);
      expect(beat.pEnd === null, mode).toBe(!hasP);
      expect(beat.pCenter === null, mode).toBe(!hasP);
      expect(beat.pr === null, mode).toBe(!hasP);
    }
    const ectopic = fiducials("pvc", true);
    expect([ectopic.pStart, ectopic.pEnd, ectopic.pCenter, ectopic.pr]).toEqual([null, null, null, null]);
  });

  it("fast/slow T penceresi ve türev noktalar kaynak aritmetiğiyle aynı", () => {
    const fastModes: readonly Mode[] = ["svt", "pat", "flutter", "sintach", "vt"];
    for (const mode of MODES) {
      const beat = fiducials(mode);
      const fast = fastModes.includes(mode);
      expect(beat.tStart - beat.qrsEnd, mode).toBeCloseTo(fast ? 0.025 : 0.07, 12);
      expect(beat.tEnd - beat.tStart, mode).toBeCloseTo(fast ? 0.14 : 0.2, 12);
      expect(beat.j).toBe(beat.qrsEnd);
      expect(beat.stMeasure).toBe(beat.qrsEnd + 0.02);
      expect(beat.qt).toBe(beat.tEnd - beat.qrsStart);
      expect(beat.tCenter).toBe((beat.tStart + beat.tEnd) / 2);
    }
  });
});

describe("hash (tamsayı karıştırma)", () => {
  it("bilinen girdiler için golden değerler ve tekrarlanabilirlik", () => {
    for (const [n, value] of HASH_GOLDEN) {
      expect(hash(n), `hash(${n})`).toBe(value);
      expect(hash(n), `hash(${n}) tekrar`).toBe(hash(n));
    }
  });

  it("aynı girdi → aynı çıktı, [0,1) aralığında", () => {
    for (let n = 0; n < 500; n += 1) {
      const first = hash(n);
      expect(first).toBe(hash(n));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(1);
    }
    // 2^32 sarması: kaynak `(n+173812)>>>0` davranışı korunur.
    expect(hash(-1)).toBe(hash(4294967295));
    expect(hash(-173812)).toBe(hash(4294967296 - 173812));
  });
});

describe("yardımcı şekil fonksiyonları", () => {
  it("clamp sınırları uygular (a > b ise a kazanır)", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(5, 3, 1)).toBe(3);
  });

  it("bell kosinüs penceresi: merkezde a, pencere dışında 0", () => {
    expect(bell(0, 0, 0.1, 1)).toBe(1);
    expect(bell(0.1, 0, 0.1, 1)).toBe(0);
    expect(bell(-0.1, 0, 0.1, 1)).toBe(0);
    expect(bell(0.05, 0, 0.1, 1)).toBe(0.5);
    expect(bell(0.025, 0, 0.1, 2)).toBe(1.7071067811865475);
    expect(bell(0.2, 0, 0.1, 1)).toBe(0);
  });

  it("interpolate: ilk eşleşen segment kazanır, aralık dışında 0", () => {
    const pts = [[0, 0], [1, 1], [2, 5]] as const;
    expect(interpolate(0, pts)).toBe(0);
    expect(interpolate(0.5, pts)).toBe(0.5);
    expect(interpolate(1, pts)).toBe(1);
    expect(interpolate(2, pts)).toBe(5);
    expect(interpolate(-1, pts)).toBe(0);
    expect(interpolate(3, pts)).toBe(0);
    expect(interpolate(1, [[0, 0], [1, 2], [1, 5]])).toBe(2);
    expect(interpolate(0.5, [])).toBe(0);
  });
});

describe("kaynak hijyeni (global yok, determinizm)", () => {
  const files = ["packages/sim-pulse/src/index.ts", "packages/sim-pulse/src/engine/shapes.ts"];

  it("IIFE/global yazımı ve rastgelelik-saat bağımlılığı yoktur", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/Math\.random|window|globalThis|CardAIModel|module\.exports|\(function/);
      expect(content, file).not.toMatch(/\bDate\b/);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  aggregateResults,
  encodeMark,
  practiceAdjusted,
  scoreCase,
} from "../../../packages/sim-opaca/src/index";
import type { CaseDef, ImageRecord, Question, ReadingZone, Telemetry, ZoneVisit } from "../../../packages/sim-opaca/src/index";

/** Skor grubu — kaynak egemed-opaca tests/core.test.ts `describe('skor')` portu (8 test).
 *  Bölge fixture'ı küçük sentetiktir; REQUIRED kimlikleri ABCDE adımlarıyla eşlenir,
 *  `scoreCase` yalnız id→adım haritasını kullanır. `initialTelemetry` kaynak
 *  store.tsx:50 ile birebir aynı boş telemetriyi üretir. */

const img = (over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: "img_t",
  sourceDataset: "nih-cxr14",
  sourceFile: "t.png",
  viewPosition: "PA",
  ageYears: 50,
  sex: "F",
  population: "yetiskin",
  width: 1000,
  height: 1000,
  originalWidth: 1000,
  originalHeight: 1000,
  findings: { pneumothorax: "expert_bbox" },
  negatives: { fracture: "expert_panel" },
  annotations: [{ finding: "pneumothorax", source: "expert_bbox", x: 0.6, y: 0.1, w: 0.2, h: 0.3 }],
  quality: null,
  runtimeUrl: "assets/xray/runtime/img_t.webp",
  bytes: 1,
  validationStatus: "validated",
  clinicalReview: "beklemede",
  issues: [],
  ...over,
});

const qChoice: Question = {
  id: "q1",
  type: "finding_identify",
  domain: "recognition",
  prompt: "p",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qMark: Question = {
  id: "q2",
  type: "localization",
  domain: "localization",
  prompt: "p",
  options: [],
  correct: [],
  targetFinding: "pneumothorax",
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qQuality: Question = {
  id: "q3",
  type: "film_quality",
  domain: "quality",
  prompt: "p",
  options: [
    { id: "a", label: "PA" },
    { id: "b", label: "AP" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const REQUIRED = ["a_trachea", "b_r_upper", "c_heart", "d_r_diaphragm", "e_bones"];

const mkCase = (over: Partial<CaseDef> = {}): CaseDef => ({
  id: "case_t",
  title: "T",
  modes: ["practice", "assessment"],
  population: "yetiskin",
  patient: { age: 50, sex: "kadın" },
  chiefComplaint: "",
  history: "",
  vitalSigns: {},
  objectives: [],
  imageId: "img_t",
  primaryFinding: "pneumothorax",
  clinicalDiagnosis: null,
  mappingValidation: "validated",
  technique: { requiredZones: REQUIRED, minDwellMs: 500, systematicOrder: true },
  questions: [qChoice, qMark, qQuality],
  feedback: { summary: "" },
  references: [],
  scoringWeights: { ...DEFAULT_WEIGHTS, diagnosis: 0, interpretation: 0, recognition: 50 },
  ...over,
});

const tele = (order: string[], dwell = 1000): Telemetry => ({
  visits: Object.fromEntries(
    order.map((id, i): [string, ZoneVisit] => [id, { dwellMs: dwell, visits: 1, firstOrder: i }])
  ),
  order,
  toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 },
});

const initialTelemetry = (): Telemetry => ({
  visits: {},
  order: [],
  toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 },
});

const ZONES: ReadingZone[] = [
  { id: "a_trachea", step: "A", label: "Trakea", fullLabel: "A — Trakea", detail: "", rects: [] },
  { id: "b_r_upper", step: "B", label: "Sağ üst zon", fullLabel: "B — Sağ üst zon", detail: "", rects: [] },
  { id: "c_heart", step: "C", label: "Kalp", fullLabel: "C — Kalp", detail: "", rects: [] },
  { id: "d_r_diaphragm", step: "D", label: "Sağ diyafram", fullLabel: "D — Sağ diyafram", detail: "", rects: [] },
  { id: "e_bones", step: "E", label: "Kemik ve yumuşak doku", fullLabel: "E — Kemik ve yumuşak doku", detail: "", rects: [] },
];

describe("skor (kaynak davranışı)", () => {
  const c = mkCase();
  const allRight = { q1: ["a"], q2: [encodeMark({ x: 0.7, y: 0.2 })], q3: ["a"] };

  it("tam puan: doğru yanıt + ABCDE sırasıyla tüm bölgeler", () => {
    const r = scoreCase(c, allRight, tele(REQUIRED), 0, img(), ZONES);
    expect(r.total).toBe(100);
    expect(r.mastery).toBe(true);
    expect(r.domains.systematic.earned).toBe(5);
  });

  it("sıra bozuksa sistematik puanın yarısı", () => {
    const r = scoreCase(c, allRight, tele(["c_heart", ...REQUIRED.filter((z) => z !== "c_heart")]), 0, img(), ZONES);
    expect(r.domains.systematic.earned).toBe(2.5);
    expect(r.domains.technique.earned).toBe(10);
  });

  it("yetersiz inceleme süresi teknik puanı düşürür, sistematik puan verilmez", () => {
    const t = tele(REQUIRED, 100);
    t.visits.a_trachea = { dwellMs: 900, visits: 1, firstOrder: 0 };
    const r = scoreCase(c, allRight, t, 0, img(), ZONES);
    expect(r.domains.technique.earned).toBeCloseTo(2);
    expect(r.domains.systematic.earned).toBe(0);
  });

  it("lokalizasyon ıskası yalnız kendi alanını etkiler (çifte ceza yok)", () => {
    const r = scoreCase(c, { ...allRight, q2: [encodeMark({ x: 0.1, y: 0.9 })] }, tele(REQUIRED), 0, img(), ZONES);
    expect(r.domains.localization.earned).toBe(0);
    expect(r.domains.recognition.earned).toBe(50);
    expect(r.total).toBe(75);
  });

  it("sorusu olmayan alan ulaşılamaz puan üretmez (K2)", () => {
    const caseNoWeights = mkCase({ questions: [qChoice] });
    delete caseNoWeights.scoringWeights;
    const r = scoreCase(caseNoWeights, { q1: ["a"] }, tele(REQUIRED), 0, img(), ZONES);
    expect(r.domains.localization.max).toBe(0);
    expect(r.domains.interpretation.max).toBe(0);
    expect(r.total).toBe(100);
  });

  it("bölge şartı olmayan vakada teknik alanı devre dışı", () => {
    const r = scoreCase(mkCase({ technique: { requiredZones: [], minDwellMs: 0 } }), allRight, initialTelemetry(), 0, img(), ZONES);
    expect(r.domains.technique.max).toBe(0);
    expect(r.domains.systematic.max).toBe(0);
    expect(r.total).toBe(100);
  });

  it("ipucu cezası yalnız uygulamada", () => {
    expect(practiceAdjusted(80, 2)).toBe(70);
    expect(practiceAdjusted(3, 2)).toBe(0);
  });

  it("toplam: alan ağırlıklarıyla birleşir", () => {
    const a = scoreCase(c, allRight, tele(REQUIRED), 0, img(), ZONES);
    const b = scoreCase(c, {}, initialTelemetry(), 0, img(), ZONES);
    const agg = aggregateResults([a, b]);
    expect(agg.total).toBe(50);
    expect(agg.mastery).toBe(false);
    expect(aggregateResults([]).total).toBe(0);
  });
});

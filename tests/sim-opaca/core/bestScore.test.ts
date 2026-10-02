import { describe, expect, it } from "vitest";
import {
  BEST_SCORE_KEY,
  DEFAULT_WEIGHTS,
  encodeMark,
  initialState,
  initialTelemetry,
  loadBestScore,
  saveBestScore,
} from "../../../packages/sim-opaca/src/index";
import { finishWithServerResults, scoredResult } from "../score-fixture";
import type {
  AppState,
  CaseDef,
  ImageRecord,
  Question,
  ReadingZone,
  StoragePort,
  Telemetry,
  ZoneVisit,
} from "../../../packages/sim-opaca/src/index";

/** En iyi puan grubu — kaynak egemed-opaca tests/core.test.ts `describe('en iyi puan (bestScore)')`
 *  portu (3 test; beklentiler birebir). Ek olarak port kararı gereği (E2 §7.2, K-P3) localStorage
 *  erişimi `StoragePort` arkasındadır; bellek uygulaması bu testtedir. */

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

const ZONES: ReadingZone[] = [
  { id: "a_trachea", step: "A", label: "Trakea", fullLabel: "A — Trakea", detail: "", rects: [] },
  { id: "b_r_upper", step: "B", label: "Sağ üst zon", fullLabel: "B — Sağ üst zon", detail: "", rects: [] },
  { id: "c_heart", step: "C", label: "Kalp", fullLabel: "C — Kalp", detail: "", rects: [] },
  { id: "d_r_diaphragm", step: "D", label: "Sağ diyafram", fullLabel: "D — Sağ diyafram", detail: "", rects: [] },
  { id: "e_bones", step: "E", label: "Kemik ve yumuşak doku", fullLabel: "E — Kemik ve yumuşak doku", detail: "", rects: [] },
];

describe("en iyi puan (bestScore) (kaynak davranışı)", () => {
  const c = mkCase();
  const allRight = { q1: ["a"], q2: [encodeMark({ x: 0.7, y: 0.2 })], q3: ["a"] };
  const high = scoredResult(c, allRight, tele(REQUIRED), 0, img(), ZONES); // total 100
  const low = scoredResult(c, {}, initialTelemetry(), 0, img(), ZONES); // total 0

  it("sunucu oturum sonucu mod başına en iyi puanı yalnız daha yüksekse günceller", () => {
    let s = finishWithServerResults(initialState, "practice", [high]);
    expect(s.bestScore.practice).toBe(100);
    // daha düşük bir sonraki deneme en iyi puanı düşürmez
    s = finishWithServerResults(s, "practice", [low]);
    expect(s.bestScore.practice).toBe(100);
  });

  it("mod başına ayrı tutulur (practice/assessment birbirini etkilemez)", () => {
    let s: AppState = finishWithServerResults(initialState, "practice", [high]);
    s = finishWithServerResults(s, "assessment", [low]);
    expect(s.bestScore.practice).toBe(100);
    expect(s.bestScore.assessment).toBe(0);
  });

  it("başlangıç değeri sıfırdır", () => {
    expect(initialState.bestScore).toEqual({ practice: 0, assessment: 0 });
  });
});

/* ---------------- depolama portu (E2 §7.2, K-P3) ---------------- */
/** Bellek içi depolama: `StoragePort` sözleşmesinin test uygulaması. */
class MemoryStorage implements StoragePort {
  readonly entries = new Map<string, string>();
  get(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

describe("en iyi puan deposu (StoragePort)", () => {
  it("kaydedilen puan opaca.bestScore anahtarından aynen okunur", () => {
    const storage = new MemoryStorage();
    saveBestScore(storage, { practice: 80, assessment: 55 });
    expect(storage.entries.get(BEST_SCORE_KEY)).toBe('{"practice":80,"assessment":55}');
    expect(BEST_SCORE_KEY).toBe("opaca.bestScore");
    expect(loadBestScore(storage)).toEqual({ practice: 80, assessment: 55 });
  });

  it("boş ya da bozuk kayıt sıfırlara düşer", () => {
    expect(loadBestScore(new MemoryStorage())).toEqual({ practice: 0, assessment: 0 });
    const corrupt = new MemoryStorage();
    corrupt.set(BEST_SCORE_KEY, "{bozuk");
    expect(loadBestScore(corrupt)).toEqual({ practice: 0, assessment: 0 });
    const partial = new MemoryStorage();
    partial.set(BEST_SCORE_KEY, '{"practice":"x"}');
    expect(loadBestScore(partial)).toEqual({ practice: 0, assessment: 0 });
  });

  it("erişim engelinde (get/set fırlatır) sessizce yutulur", () => {
    const broken: StoragePort = {
      get() {
        throw new Error("erişim engelli");
      },
      set() {
        throw new Error("erişim engelli");
      },
    };
    expect(loadBestScore(broken)).toEqual({ practice: 0, assessment: 0 });
    expect(() => saveBestScore(broken, { practice: 10, assessment: 10 })).not.toThrow();
  });
});

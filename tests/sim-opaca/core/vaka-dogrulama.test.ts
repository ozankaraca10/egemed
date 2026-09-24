import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, FINDINGS, ZONE_IDS, validateCase } from "../../../packages/sim-opaca/src/index";
import type { CaseDef, ImageRecord, Question } from "../../../packages/sim-opaca/src/index";

/** Vaka doğrulama grubu — kaynak egemed-opaca tests/core.test.ts `describe('vaka doğrulama')` portu (7 test).
 *  Fixture'lar kaynak testin img()/mkCase() yardımcılarıyla birebir aynıdır; `validateCase` bu dilimde
 *  tüm kurallarıyla taşındı. */

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

const findingIds = new Set(Object.keys(FINDINGS));
const images = new Map([["img_t", img()]]);
const getTestImage = (id: string) => images.get(id);

describe("vaka doğrulama (kaynak davranışı)", () => {
  const errors = (c: CaseDef, get = getTestImage) =>
    validateCase(c, ZONE_IDS, get, findingIds).filter((i) => i.severity === "error");

  it("geçerli vaka hata üretmez", () => {
    expect(errors(mkCase())).toEqual([]);
  });

  it("NLP etiketli ana bulgu değerlendirmeye giremez", () => {
    const nlpImg = img({ findings: { pneumothorax: "report_nlp" }, annotations: [] });
    const e = errors(mkCase({ questions: [qChoice, qQuality] }), () => nlpImg);
    expect(e.some((x) => x.message.includes("uzman kaynaklı değil"))).toBe(true);
  });

  it("uzman kutusu olmadan lokalizasyon sorusu reddedilir", () => {
    const noBox = img({ findings: { pneumothorax: "expert_panel" }, annotations: [] });
    expect(errors(mkCase(), () => noBox).some((x) => x.message.includes("uzman kutusu yok"))).toBe(true);
  });

  it("pediatrik film değerlendirmeye giremez", () => {
    const ped = img({ population: "pediatrik" });
    expect(errors(mkCase(), () => ped).some((x) => x.message.includes("yetişkin"))).toBe(true);
  });

  it("doğrulanmamış tanı sorusu reddedilir", () => {
    const qd: Question = { ...qChoice, id: "qd", type: "diagnosis", domain: "diagnosis" };
    const e = errors(mkCase({ modes: ["practice"], mappingValidation: "educational_mapping", questions: [qd] }));
    expect(e.map((x) => x.message)).toEqual(
      expect.arrayContaining(["Tanı sorusu var ama clinicalDiagnosis tanımlı değil", "Doğrulanmamış tanı eşlemesi tanı sorusu üretemez"])
    );
  });

  it("bilinmeyen bölge, görüntü ve bulgu", () => {
    const e = errors(mkCase({ imageId: "yok", primaryFinding: "uydurma", technique: { requiredZones: ["z"], minDwellMs: 1 } }));
    expect(e.length).toBeGreaterThanOrEqual(3);
  });

  it("doğru yanıt seçeneklerde olmalı", () => {
    const e = errors(mkCase({ questions: [{ ...qChoice, correct: ["x"] }] }));
    expect(e.some((x) => x.message.includes("seçeneklerde yok"))).toBe(true);
  });
});

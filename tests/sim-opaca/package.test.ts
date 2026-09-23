import { describe, expect, it } from "vitest";
import { SIMULATOR_IDS, isSimulatorId } from "../../packages/sim-host/src/index";
import type { SimulatorId } from "../../packages/sim-host/src/index";
import { DEFAULT_WEIGHTS, EXPERT_SOURCES, SIM_ID, isAnswerCorrect } from "../../packages/sim-opaca/src/index";
import type { ImageRecord, Question } from "../../packages/sim-opaca/src/index";

const MARK_IN = "pt:0.7000,0.3000";
const MARK_OUT = "pt:0.1000,0.3000";

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

const qMulti: Question = { ...qChoice, id: "q2", type: "multi_choice", correct: ["a", "b"] };

const qMark: Question = {
  id: "q3",
  type: "localization",
  domain: "localization",
  prompt: "p",
  options: [],
  correct: [],
  targetFinding: "pneumothorax",
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

describe("sim-opaca paket sözleşmesi", () => {
  it("modül kimliği host kapalı birlik tipiyle uyumludur", () => {
    const id: SimulatorId = SIM_ID;
    expect(id).toBe("opaca");
    expect(SIMULATOR_IDS).toContain(SIM_ID);
    expect(isSimulatorId(SIM_ID)).toBe(true);
  });

  it("çekirdek değerleri dışa aktarır", () => {
    expect(EXPERT_SOURCES).toEqual([
      "expert_panel",
      "expert_bbox",
      "expert_mask",
      "expert_reading",
      "ct_confirmed",
    ]);
    expect(DEFAULT_WEIGHTS).toEqual({
      technique: 10,
      systematic: 5,
      quality: 10,
      localization: 25,
      recognition: 25,
      interpretation: 15,
      diagnosis: 10,
    });
  });
});

describe("yanıt doğruluğu (kaynak davranışı)", () => {
  it("seçmeli: tam eşleşme, sıra bağımsız", () => {
    expect(isAnswerCorrect(qChoice, ["a"], undefined)).toBe(true);
    expect(isAnswerCorrect(qChoice, ["a", "b"], undefined)).toBe(false);
    expect(isAnswerCorrect(qChoice, ["b"], undefined)).toBe(false);
    expect(isAnswerCorrect(qChoice, [], undefined)).toBe(false);
    expect(isAnswerCorrect(qMulti, ["b", "a"], undefined)).toBe(true);
    expect(isAnswerCorrect(qMulti, ["a"], undefined)).toBe(false);
  });

  it("doğru seçeneği olmayan soru asla doğru sayılmaz", () => {
    expect(isAnswerCorrect({ ...qChoice, correct: [] }, ["a"], undefined)).toBe(false);
  });

  it("lokalizasyon: işaret uzman kutusuna düşerse doğru", () => {
    expect(isAnswerCorrect(qMark, [MARK_IN], img())).toBe(true);
    expect(isAnswerCorrect(qMark, [MARK_OUT], img())).toBe(false);
    expect(isAnswerCorrect(qMark, [MARK_IN], undefined)).toBe(false);
    expect(isAnswerCorrect(qMark, [], img())).toBe(false);
    expect(isAnswerCorrect(qMark, ["a"], img())).toBe(false);
    expect(isAnswerCorrect(qMark, ["pt:1.2,0.5"], img())).toBe(false);
  });

  it("lokalizasyonda hedef bulgu yoksa doğru sayılmaz", () => {
    const qNoTarget: Question = { ...qMark };
    delete qNoTarget.targetFinding;
    expect(isAnswerCorrect(qNoTarget, [MARK_IN], img())).toBe(false);
  });

  it("report_nlp kaynaklı kutu isabet sayılmaz", () => {
    const nlp = img({ annotations: [{ finding: "pneumothorax", source: "report_nlp", x: 0, y: 0, w: 1, h: 1 }] });
    expect(isAnswerCorrect(qMark, ["pt:0.5000,0.5000"], nlp)).toBe(false);
  });
});

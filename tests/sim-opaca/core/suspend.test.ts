import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  SUSPEND_LIMIT_12,
  ZONES,
  deserializeSuspend,
  serializeSuspend,
} from "../../../packages/sim-opaca/src/index";
import { scoredResult } from "../score-fixture";
import type { CaseDef, ImageRecord, Question, SuspendPayload, Telemetry, ZoneVisit } from "../../../packages/sim-opaca/src/index";

/** Suspend grubu — kaynak egemed-opaca tests/core.test.ts `describe('suspend')` portu (3 test).
 *  Bölge listesi gerçek paketlenen veridir (`ZONES`); fixture'lar kaynak testin img()/mkCase()
 *  yardımcılarıyla birebir aynıdır. Zaman/rastgelelik kullanılmaz. */

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

describe("suspend (kaynak davranışı)", () => {
  const scored = scoredResult(mkCase(), { q1: ["a"] }, tele(REQUIRED), 0, img(), ZONES);
  const base: SuspendPayload = {
    v: 1,
    mode: "assessment",
    caseIndex: 3,
    step: 1,
    answers: { q2: ["pt:0.1000,0.2000"] },
    hintsUsed: 0,
    caseResults: [scored],
    tutorialDone: true,
    visits: tele(REQUIRED, 1234).visits,
    order: REQUIRED,
    attempts: 2,
    sessionIds: ["a", "b"],
    sessionSeed: 42,
  };

  it("gidiş-dönüş", () => {
    const back = deserializeSuspend(serializeSuspend(base))!;
    expect(back.mode).toBe("assessment");
    expect(back.answers).toEqual(base.answers);
    expect(back.visits.b_r_upper!.dwellMs).toBe(1234);
    expect(back.caseResults[0]!.domains.recognition.max).toBe(50);
    expect(back.sessionIds).toEqual(["a", "b"]);
  });

  it("1.2 limitinde kademeli küçülür, ilerleme korunur", () => {
    const big = {
      ...base,
      caseResults: Array.from({ length: 60 }, (_, i) => ({ ...scored, caseId: `auto_rsna_${i}_xxxxxxxxxxxxxxxx` })),
    };
    const s = serializeSuspend(big, SUSPEND_LIMIT_12);
    expect(s.length).toBeLessThanOrEqual(SUSPEND_LIMIT_12);
    const back = deserializeSuspend(s)!;
    expect(back.caseIndex).toBe(3);
    expect(back.sessionSeed).toBe(42);
  });

  it("bozuk veri null döner", () => {
    expect(deserializeSuspend("{")).toBeNull();
    expect(deserializeSuspend("")).toBeNull();
    expect(deserializeSuspend("null")).toBeNull();
  });
});

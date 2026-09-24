import { describe, expect, it } from "vitest";
import { MASTERY_THRESHOLD, aggregateResults, practiceAdjusted, scoreCase } from "../../packages/sim-ausculta/src/index";
import type { CaseDef, Question, QuestionDomain, ScoringWeights, Telemetry } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:236-315 (8 test). Vaka JSON ve pool S3a/S2b'de;
 *  havuz, değerlendirme havuzundaki her skor şeklinden bir temsilcidir. */

type Q = [id: string, domain: QuestionDomain, correct: string[]];
type Row = [id: string, questions: Q[], points: string[], systematic: boolean, weights: number[] | null, dwell: number, listen: number];

function toCase([id, questions, points, systematicOrder, weights, minDwellMs, minListenMsPerPoint]: Row): CaseDef {
  const qs: Question[] = questions.map(([qid, domain, correct]) => ({
    id: qid,
    type: "single_choice",
    domain,
    prompt: "",
    options: correct.map((optionId) => ({ id: optionId, label: optionId })),
    correct,
    feedbackCorrect: "",
    feedbackIncorrect: "",
  }));
  const scoringWeights: ScoringWeights | undefined = weights
    ? {
        technique: weights[0] ?? 0,
        localization: weights[1] ?? 0,
        recognition: weights[2] ?? 0,
        interpretation: weights[3] ?? 0,
        diagnosis: weights[4] ?? 0,
        systematic: weights[5] ?? 0,
      }
    : undefined;
  return {
    id,
    title: id,
    modes: ["practice", "assessment"],
    patient: { age: 40, sex: "kadın" },
    chiefComplaint: "",
    history: "",
    vitalSigns: {},
    objectives: [],
    tasks: [],
    views: ["front"],
    allowedHeads: ["diaphragm"],
    soundAssignments: [],
    primaryAcousticFinding: "",
    clinicalDiagnosis: null,
    mappingValidation: "validated",
    technique: {
      requiredPoints: points,
      minPointsVisited: points.length,
      minDwellMs,
      minListenMsPerPoint,
      systematicOrder,
    },
    questions: qs,
    feedback: { summary: "" },
    references: [],
    masteryThreshold: 80,
    ...(scoringWeights ? { scoringWeights } : {}),
  };
}

const CARDIAC = ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"];
const LUNG4 = [
  "lung_right_upper_anterior",
  "lung_left_upper_anterior",
  "lung_right_lower_anterior",
  "lung_left_lower_anterior",
];

const assessmentPool: CaseDef[] = (
  [
    ["case_normal_heart", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q4", "interpretation", ["b"]]], CARDIAC, true, [20, 0, 40, 35, 0, 5], 1800, 2500],
    ["auto_heart_tachycardia_mitral", [["q1", "recognition", ["a"]], ["q3", "interpretation", ["a"]], ["q4", "interpretation", ["b"]], ["q5", "diagnosis", ["a"]]], ["cardiac_mitral", "cardiac_pulmonary"], true, [20, 0, 45, 20, 10, 5], 1500, 2000],
    ["auto_heart_atrial_fibrillation_mitral", [["q1", "recognition", ["a"]], ["q3", "interpretation", ["a"]], ["q4", "interpretation", ["b"]], ["q5", "diagnosis", ["a"]]], ["cardiac_mitral", "cardiac_pulmonary", "cardiac_aortic"], true, [20, 0, 45, 20, 10, 5], 1500, 2000],
    ["case_atrial_fibrillation", [["q1", "recognition", ["b"]], ["q2", "diagnosis", ["a"]], ["q3", "localization", ["a"]]], ["cardiac_mitral", "cardiac_pulmonary", "cardiac_aortic"], true, null, 1800, 3000],
    ["case_s3", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q3", "localization", ["d"]], ["q4", "interpretation", ["a"]]], ["cardiac_mitral", "cardiac_tricuspid", "cardiac_pulmonary"], true, [20, 20, 30, 25, 0, 5], 1800, 2500],
    ["case_pediatric_wheezing", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]]], LUNG4, true, [20, 25, 40, 15, 0, 0], 1200, 1800],
    ["auto_heart_s4_pulmonary", [["q1", "recognition", ["a"]], ["q3", "interpretation", ["a"]], ["q4", "interpretation", ["a"]]], ["cardiac_pulmonary"], false, [20, 0, 50, 30, 0, 0], 1500, 2000],
    ["case_coarse_crackles", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]]], ["lung_right_lower_anterior", "lung_left_lower_anterior", "lung_left_middle_anterior"], false, [20, 20, 35, 20, 0, 5], 1500, 2000],
    ["case_fine_crackles", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q3", "interpretation", ["a", "b", "c"]]], ["lung_left_upper_anterior", "lung_right_lower_anterior", "lung_right_upper_anterior"], false, [20, 20, 30, 25, 0, 5], 1500, 2000],
    ["auto_heart_normal_aortic", [["q1", "recognition", ["a"]], ["q3", "interpretation", ["a"]], ["q4", "interpretation", ["b"]]], ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid"], true, [20, 0, 50, 30, 0, 0], 1500, 2000],
    ["case_pediatric_normal_heart", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q3", "interpretation", ["a", "b", "d"]]], CARDIAC, true, [20, 25, 40, 15, 0, 0], 1500, 2000],
    ["case_pediatric_innocent_murmur", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q4", "interpretation", ["b"]]], CARDIAC, true, [20, 0, 55, 25, 0, 0], 1500, 2000],
    ["case_wheezing", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q3", "interpretation", ["a"]]], LUNG4, true, [20, 20, 30, 25, 0, 5], 1500, 2000],
    ["case_normal_lung", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]], ["q3", "interpretation", ["a"]]], ["lung_right_upper_anterior", "lung_right_middle_anterior", "lung_right_lower_anterior", "lung_left_upper_anterior", "lung_left_middle_anterior", "lung_left_lower_anterior"], true, [20, 20, 30, 25, 0, 5], 1500, 2000],
    ["case_s4", [["q1", "recognition", ["b"]], ["q2", "interpretation", ["a"]], ["q4", "interpretation", ["a"]]], ["cardiac_pulmonary"], false, [20, 0, 40, 35, 0, 5], 1800, 3000],
    ["case_tachycardia", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]]], ["cardiac_mitral", "cardiac_pulmonary"], false, [20, 20, 35, 20, 0, 5], 1800, 3000],
    ["case_av_block", [["q1", "recognition", ["a"]], ["q2", "interpretation", ["a"]]], ["cardiac_tricuspid", "cardiac_mitral"], false, [20, 20, 35, 20, 5, 0], 1800, 3000],
    ["case_late_diastolic_murmur", [["q1", "recognition", ["c"]], ["q2", "interpretation", ["a"]], ["q4", "interpretation", ["a"]]], ["cardiac_mitral", "cardiac_pulmonary", "cardiac_tricuspid"], false, [20, 0, 40, 35, 0, 5], 1800, 3000],
  ] satisfies Row[]
).map(toCase);

/* ---------------- skor (§24) ---------------- */
describe("skor hesaplama", () => {
  const c = assessmentPool.find((x) => x.id === "case_normal_heart")!;
  const baseTelemetry: Telemetry = {
    visits: {
      cardiac_aortic: { dwellMs: 4000, listenMs: 4000, visits: 1, firstOrder: 0 },
      cardiac_pulmonary: { dwellMs: 4000, listenMs: 3500, visits: 1, firstOrder: 1 },
      cardiac_tricuspid: { dwellMs: 4000, listenMs: 3000, visits: 1, firstOrder: 2 },
      cardiac_mitral: { dwellMs: 5000, listenMs: 4000, visits: 1, firstOrder: 3 },
    },
    order: ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"],
    headChanges: 1,
    headUse: { bell: 0, diaphragm: 1 },
    replayCount: 0,
  };
  const allCorrect = Object.fromEntries(c.questions.map((q) => [q.id, q.correct]));

  it("tam doğru + eksiksiz teknik → 100", () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0);
    expect(r.total).toBe(100);
    expect(r.mastery).toBe(true);
  });

  it("yanlış tanıma → ses tanımlama 0, toplam < 80", () => {
    const r = scoreCase(c, { ...allCorrect, q1: ["b"] }, baseTelemetry, 0);
    expect(r.domains.recognition.earned).toBe(0);
    expect(r.total).toBeLessThan(80);
    expect(r.mastery).toBe(false);
  });

  it("teknik eşiğini tutmayan nokta teknik puanı düşürür", () => {
    const t: Telemetry = {
      ...baseTelemetry,
      visits: { ...baseTelemetry.visits, cardiac_mitral: { dwellMs: 100, listenMs: 100, visits: 1, firstOrder: 3 } },
    };
    const r = scoreCase(c, allCorrect, t, 0);
    expect(r.domains.technique.earned).toBeLessThan(20);
  });

  it("yanlış sıra → sistematik puan yarım (çifte ceza yok)", () => {
    const t: Telemetry = { ...baseTelemetry, order: [...baseTelemetry.order].reverse() };
    const r = scoreCase(c, allCorrect, t, 0);
    expect(r.domains.systematic.earned).toBe(2.5);
  });

  it("ipucu cezası deterministiktir (Uygulama modu)", () => {
    expect(practiceAdjusted(90, 0)).toBe(90);
    expect(practiceAdjusted(90, 2)).toBe(80);
    expect(practiceAdjusted(8, 2)).toBe(0);
  });

  it("hakimiyet eşiği 80 (§24)", () => {
    expect(MASTERY_THRESHOLD).toBe(80);
  });

  it("çoklu vaka toplamı alan bazlı birleşir", () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0);
    const agg = aggregateResults([r, r]);
    expect(agg.total).toBe(100);
    expect(agg.domains.technique.max).toBe(40);
  });

  it("ulaşılamayan ağırlık yok (K2): değerlendirme havuzundaki her vakada kusursuz performans 100 puan verir", () => {
    for (const cc of assessmentPool) {
      const answers = Object.fromEntries(cc.questions.map((q) => [q.id, q.correct]));
      const telemetry: Telemetry = {
        visits: Object.fromEntries(
          cc.technique.requiredPoints.map((p, i) => [p, { dwellMs: 99999, listenMs: 99999, visits: 1, firstOrder: i }]),
        ),
        order: [...cc.technique.requiredPoints],
        headChanges: 0,
        headUse: { bell: 0, diaphragm: 0 },
        replayCount: 0,
      };
      const r = scoreCase(cc, answers, telemetry, 0);
      expect(r.total, `${cc.id} kusursuz performansta 100 vermeli`).toBe(100);
      expect(r.mastery, cc.id).toBe(true);
    }
  });
});

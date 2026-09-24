import { describe, expect, it } from "vitest";
import { filterAssessmentPool, validateCase } from "../../packages/sim-ausculta/src/index";
import type { CaseDef, Question } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:317-366 (5 test → 5 test).
 *  Vaka JSON bu dilimde yok; sentetik fixture. S3a sonrası tam veri. */

const pointIds = ["cardiac_aortic", "cardiac_mitral"];
const soundKeys = new Set(["heart.normal"]);

const question: Question = {
  id: "q1",
  type: "single_choice",
  domain: "recognition",
  prompt: "?",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const baseCase: CaseDef = {
  id: "case_synthetic",
  title: "Sentetik vaka",
  modes: ["practice", "assessment"],
  patient: { age: 40, sex: "kadın" },
  chiefComplaint: "",
  history: "",
  vitalSigns: {},
  objectives: [],
  tasks: [],
  views: ["front"],
  allowedHeads: ["diaphragm"],
  soundAssignments: [{ pointId: "cardiac_aortic", category: "heart", acousticFinding: "normal" }],
  primaryAcousticFinding: "normal",
  clinicalDiagnosis: null,
  mappingValidation: "validated",
  technique: {
    requiredPoints: ["cardiac_aortic"],
    minPointsVisited: 1,
    minDwellMs: 1500,
    minListenMsPerPoint: 2000,
  },
  questions: [question],
  feedback: { summary: "" },
  references: [],
};

const cases: CaseDef[] = [baseCase];

/* ---------------- vaka şeması (§19, §36) ---------------- */
describe("vaka şeması doğrulaması", () => {
  it("mevcut tüm vakalar hatasızdır", () => {
    for (const c of cases) {
      const errors = validateCase(c, pointIds, soundKeys).filter((i) => i.severity === "error");
      expect(errors, `${c.id} hata içermemeli`).toEqual([]);
    }
  });

  it("bilinmeyen oskültasyon noktası hatadır", () => {
    const c = cases[0];
    if (!c) throw new Error("sentetik vaka yok");
    const bad = { ...c, technique: { ...c.technique, requiredPoints: ["yok_olmayan_nokta"] } };
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes("yok_olmayan_nokta"))).toBe(true);
  });

  it("doğrulanmamış eşleme + tanı sorusu → değerlendirmeye giremez (§6, §19)", () => {
    const c = cases[0];
    if (!c) throw new Error("sentetik vaka yok");
    const withDiag: CaseDef = {
      ...c,
      clinicalDiagnosis: null,
      mappingValidation: "educational_mapping",
      questions: [
        {
          id: "qdiag",
          type: "diagnosis",
          domain: "diagnosis",
          prompt: "?",
          options: [{ id: "a", label: "X" }],
          correct: ["a"],
          feedbackCorrect: "",
          feedbackIncorrect: "",
        },
      ],
    };
    const issues = validateCase(withDiag, pointIds, soundKeys);
    expect(issues.some((i) => i.severity === "error" && /tanı|clinicalDiagnosis/i.test(i.message))).toBe(true);
  });

  it("soru doğru yanıtı seçenekler arasında olmalıdır", () => {
    const c = cases[0];
    if (!c) throw new Error("sentetik vaka yok");
    const first = c.questions[0];
    if (!first) throw new Error("sentetik soru yok");
    const bad: CaseDef = {
      ...c,
      questions: [{ ...first, correct: ["yok"] }],
    };
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes("seçeneklerde yok"))).toBe(true);
  });

  it("filtre havuzu hatalı vakayı dışlar (§19)", () => {
    const c = cases[0];
    if (!c) throw new Error("sentetik vaka yok");
    const broken: CaseDef = { ...c, id: "broken_case", questions: [] };
    const pool = filterAssessmentPool(
      [c, broken],
      [{ caseId: "broken_case", severity: "error", message: "Soru yok" }],
    );
    expect(pool.some((x) => x.id === "broken_case")).toBe(false);
    expect(pool.some((x) => x.id === c.id)).toBe(true);
  });
});

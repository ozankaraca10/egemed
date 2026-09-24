import { describe, expect, it } from "vitest";
import type { CaseDef, Question, SoundAssignment } from "../../packages/sim-ausculta/src/index";

const question = {
  id: "q1",
  type: "single_choice",
  domain: "recognition",
  prompt: "Hangi ses?",
  options: [{ id: "a", label: "Normal" }],
  correct: ["a"],
  feedbackCorrect: "doğru",
  feedbackIncorrect: "yanlış",
} satisfies Question;

const assignment = {
  pointId: "aortic",
  category: "heart",
  acousticFinding: "normal",
} satisfies SoundAssignment;

const caseDef = {
  id: "case-synthetic",
  title: "Sentetik vaka",
  modes: ["learn"],
  patient: { age: 40, sex: "kadın" },
  chiefComplaint: "göğüs ağrısı",
  history: "sentetik öykü",
  vitalSigns: { hr: 80 },
  objectives: ["oskültasyon"],
  tasks: ["dinle"],
  views: ["front"],
  allowedHeads: ["diaphragm"],
  soundAssignments: [assignment],
  primaryAcousticFinding: "normal",
  clinicalDiagnosis: null,
  mappingValidation: "educational_mapping",
  technique: {
    requiredPoints: ["aortic"],
    minPointsVisited: 1,
    minDwellMs: 1000,
    minListenMsPerPoint: 2000,
  },
  questions: [question],
  feedback: { summary: "özet" },
  references: ["sentetik"],
} satisfies CaseDef;

describe("çekirdek tip şeması", () => {
  it("sentetik vaka CaseDef ile derlenir", () => {
    expect(caseDef.id).toBe("case-synthetic");
    expect(caseDef.clinicalDiagnosis).toBeNull();
    expect(caseDef.questions[0]?.type).toBe("single_choice");
    expect(caseDef.soundAssignments[0]?.pointId).toBe("aortic");
  });
});

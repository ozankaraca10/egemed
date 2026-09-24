import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORE_CASES, filterAssessmentPool, validateCase } from "../../packages/sim-ausculta/src/index";
import type { CaseDef } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:317-366 (5 test → 5 test). Tam çekirdek havuz: cases.json. */

const DATA = "packages/sim-ausculta/src/data";
const pointIds = (JSON.parse(readFileSync(`${DATA}/auscultation-points.json`, "utf8")) as { points: { id: string }[] }).points.map(
  (p) => p.id,
);
const soundKeys = new Set<string>();
const cases: CaseDef[] = CORE_CASES;

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
    if (!c) throw new Error("vaka yok");
    const bad = { ...c, technique: { ...c.technique, requiredPoints: ["yok_olmayan_nokta"] } };
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes("yok_olmayan_nokta"))).toBe(true);
  });

  it("doğrulanmamış eşleme + tanı sorusu → değerlendirmeye giremez (§6, §19)", () => {
    const c = cases[0];
    if (!c) throw new Error("vaka yok");
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
    if (!c) throw new Error("vaka yok");
    const first = c.questions[0];
    if (!first) throw new Error("soru yok");
    const bad: CaseDef = {
      ...c,
      questions: [{ ...first, correct: ["yok"] }],
    };
    expect(validateCase(bad, pointIds, soundKeys).some((i) => i.message.includes("seçeneklerde yok"))).toBe(true);
  });

  it("filtre havuzu hatalı vakayı dışlar (§19)", () => {
    const c = cases[0];
    if (!c) throw new Error("vaka yok");
    const broken: CaseDef = { ...c, id: "broken_case", questions: [] };
    const pool = filterAssessmentPool(
      [c, broken],
      [{ caseId: "broken_case", severity: "error", message: "Soru yok" }],
    );
    expect(pool.some((x) => x.id === "broken_case")).toBe(false);
    expect(pool.some((x) => x.id === c.id)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { curriculum } from "../../packages/sim-pulse/src/data/curriculum";
import { LEADS, MODES } from "../../packages/sim-pulse/src/engine/shapes";

declare const process: {
  getBuiltinModule(id: "node:crypto"): {
    createHash(algorithm: "sha256"): { update(value: string): { digest(encoding: "hex"): string } };
  };
};

const { createHash } = process.getBuiltinModule("node:crypto");

const SOURCE_SHA256 = "7547ab0ac10352e0d85462f729cf0f65099ae94b665406cf0b85f46d76451046";
const REQUIRED_ITEM_KEYS = [
  "id", "mode", "title", "ariaLabel", "stem", "question", "text", "vitals", "options", "correct",
  "explanations", "feedback", "objectiveIds", "sourceIds", "decisionId", "note", "ecg",
] as const;

describe("Pulse müfredat verisi", () => {
  it("200 vaka ve 200 soruyu eksiksiz kimlik dizileriyle taşır", () => {
    expect(curriculum.version).toBe(8);
    expect(curriculum.sessionSize).toBe(10);
    expect(curriculum.cases).toHaveLength(200);
    expect(curriculum.questions).toHaveLength(200);
    expect(Object.keys(curriculum.byId)).toHaveLength(400);
    expect(curriculum.cases.map(({ id }) => id)).toEqual(
      Array.from({ length: 200 }, (_, index) => `C${String(index + 1).padStart(3, "0")}`),
    );
    expect(curriculum.questions.map(({ id }) => id)).toEqual(
      Array.from({ length: 200 }, (_, index) => `Q${String(index + 1).padStart(3, "0")}`),
    );
  });

  it("her vaka ve sorunun zorunlu klinik içerik alanlarını doğrular", () => {
    for (const item of [...curriculum.cases, ...curriculum.questions]) {
      expect(Object.keys(item), item.id).toEqual(REQUIRED_ITEM_KEYS);
      expect(item.id, item.id).toMatch(/^[CQ]\d{3}$/);
      expect(MODES, item.id).toContain(item.mode);
      for (const value of [item.title, item.ariaLabel, item.stem, item.question, item.text, item.feedback, item.decisionId]) {
        expect(value.trim().length, item.id).toBeGreaterThan(0);
      }
      expect(item.vitals.length, item.id).toBeGreaterThan(0);
      expect(item.vitals.every(({ k, v }) => k.length > 0 && v.length > 0), item.id).toBe(true);
      expect(item.options, item.id).toHaveLength(5);
      expect(item.options.every((option) => option.trim().length > 0), item.id).toBe(true);
      expect(item.explanations, item.id).toHaveLength(5);
      expect(item.explanations.every((explanation) => explanation.trim().length > 0), item.id).toBe(true);
      expect(Number.isInteger(item.correct) && item.correct >= 0 && item.correct < 5, item.id).toBe(true);
      expect(item.objectiveIds.length > 0 && item.objectiveIds.every((id) => /^O[1-6]$/.test(id)), item.id).toBe(true);
      expect(item.sourceIds.length > 0 && item.sourceIds.every((id) => id.length > 0), item.id).toBe(true);
      expect(item.ecg.mode, item.id).toBe(item.mode);
      expect(item.ecg.leads, item.id).toHaveLength(3);
      expect(item.ecg.leads.every((lead) => LEADS.includes(lead)), item.id).toBe(true);
      expect(Number.isFinite(item.ecg.start) && item.ecg.start >= 0, item.id).toBe(true);
      expect(Number.isFinite(item.ecg.seconds) && item.ecg.seconds > 0, item.id).toBe(true);
      expect(curriculum.byId[item.id], item.id).toBe(item);
    }
  });

  it("kaynak PulseCurriculum nesnesinin sabit SHA-256 özetini korur", () => {
    const actual = createHash("sha256").update(JSON.stringify(curriculum)).digest("hex");
    expect(actual).toBe(SOURCE_SHA256);
  });
});

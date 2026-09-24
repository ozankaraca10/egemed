import { describe, expect, it } from "vitest";
import { blank, createCryptoRandomInt, createSeededRandomInt, decode, encode, sample } from "../../packages/sim-pulse/src/index";
import type { CurriculumItem, PulseCurriculum, RandomInt, StateContext } from "../../packages/sim-pulse/src/index";

const cases = Array.from({ length: 200 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
const questions = Array.from({ length: 200 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
const byId: Record<string, CurriculumItem | undefined> = {};
for (const id of [...cases, ...questions]) byId[id] = { correct: 0, ecg: { leads: ["I", "aVR", "V1"] } };
const curriculum: PulseCurriculum = { version: "sample-1", cases, questions, byId };

function referenceSample(section: "case" | "quiz", randomInt: RandomInt) {
  const pool = [...(section === "case" ? cases : questions)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const ids = pool.slice(0, 10);
  const id = Array.from({ length: 3 }, () => randomInt(0x1_0000_0000).toString(36)).join("_").slice(0, 32);
  return { id, ids };
}

describe("Pulse örneklem ve RNG", () => {
  it("tohumlu RNG 1000 farklı 32-bit çekiliş üretir", () => {
    const randomInt = createSeededRandomInt(18_092_026);
    const draws = Array.from({ length: 1000 }, () => randomInt(0x1_0000_0000));
    expect(new Set(draws).size).toBe(1000);
    expect(draws.every((n) => Number.isInteger(n) && n >= 0 && n < 0x1_0000_0000)).toBe(true);
  });

  it("kripto adaptörü modulo yanlılığını reddetme örneklemesiyle önler", () => {
    const values = [0xffff_ffff, 9, 12];
    let calls = 0;
    const randomInt = createCryptoRandomInt({ getRandomValues: (array) => { array[0] = values[calls++]!; return array; } });
    expect(randomInt(10)).toBe(9);
    expect(calls).toBe(2);
  });

  it("Fisher–Yates örneklemi 10 benzersiz havuz kimliği ve kaynakla aynı RNG dizisini kullanır", () => {
    const section = "case";
    const actual = sample(section, curriculum, createSeededRandomInt(7812));
    const reference = referenceSample(section, createSeededRandomInt(7812));
    expect({ id: actual.id, ids: actual.ids }).toEqual(reference);
    expect(actual.ids).toHaveLength(10);
    expect(new Set(actual.ids).size).toBe(10);
    expect(actual.ids.every((id) => cases.includes(id))).toBe(true);
    expect(actual.answers).toEqual(Array(10).fill(null));
    expect(actual.submitted).toEqual(Array(10).fill(false));
    expect(actual.leadSelections).toEqual(Array(10).fill(["I", "aVR", "V1"]));
    expect(actual.interactionIndices).toEqual(Array(10).fill(null));
  });

  it("üretilen oturum kimliği ve seçilmiş maddeler durum encode/decode gidiş-dönüşünde korunur", () => {
    const context: StateContext = { curriculum, randomInt: createSeededRandomInt(42) };
    const initial = blank(context);
    const restored = decode(encode(initial, context), { curriculum, randomInt: createSeededRandomInt(99) });
    expect(restored.caseSession.id).toBe(initial.caseSession.id);
    expect(restored.caseSession.ids).toEqual(initial.caseSession.ids);
    expect(restored.quizSession.id).toBe(initial.quizSession.id);
    expect(restored.quizSession.ids).toEqual(initial.quizSession.ids);
  });
});

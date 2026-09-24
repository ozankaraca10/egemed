import { describe, expect, it } from "vitest";
import { blank, createSeededRandomInt, decode, derive, encode, MAX_STATE_BYTES, MODES } from "../../packages/sim-pulse/src/index";
import type { PulseCurriculum, StateContext } from "../../packages/sim-pulse/src/index";

const byId: Record<string, { correct: number; ecg: { leads: readonly ["I", "aVR", "V1"] } }> = {};
const cases = Array.from({ length: 200 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
const questions = Array.from({ length: 200 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
for (let i = 0; i < 200; i += 1) {
  byId[cases[i]!] = { correct: i % 5, ecg: { leads: ["I", "aVR", "V1"] } };
  byId[questions[i]!] = { correct: i % 5, ecg: { leads: ["I", "aVR", "V1"] } };
}
const curriculum: PulseCurriculum = { version: "fixture-1", cases, questions, byId };
const context: StateContext = { curriculum, randomInt: createSeededRandomInt(20260924) };

describe("Pulse v6 durum şeması", () => {
  it("boş durum encode/decode gidiş-dönüşünü korur", () => {
    const initial = blank(context), encoded = encode(initial, context), restored = decode(encoded, context);
    expect(restored.version).toBe(6);
    expect(restored.mode).toBe("normal");
    expect(restored.caseSession.ids).toEqual(initial.caseSession.ids);
    expect(restored.quizSession.ids).toEqual(initial.quizSession.ids);
    expect(restored.activeView).toBe("modes");
  });

  it("v1–v5 ayarları taşır, eski cevap ve puanları taşımadan v6 golden'a gider", () => {
    for (let version = 1; version <= 5; version += 1) {
      const migrated = decode({ version, mode: "af", time: 7, viewed: { normal: 16, af: 99, pvc: -5 },
        afProfile: "rapid", answers: Array(50).fill(0), score: 100, passed: true }, context);
      expect([migrated.mode, migrated.time, migrated.viewed.normal, migrated.viewed.af, migrated.viewed.pvc, migrated.afProfile])
        .toEqual(["af", 7, 16, 16, 0, "rapid"]);
      expect(migrated.quizSession.answers.every((answer) => answer === null)).toBe(true);
      expect([migrated.bestScore, migrated.passed]).toEqual([null, false]);
    }
    const v6 = encode(blank(context), context);
    expect([v6.version, v6.cv, v6.m, v6.t, v6.p, v6.u]).toEqual([6, "fixture-1", 0, 2, 1, 4]);
    expect([decode({ ...v6, u: 3 }, context).activeView, decode({ ...v6, u: 4 }, context).activeView,
      decode({ ...v6, u: 7 }, context).activeView]).toEqual(["sim", "modes", "tutorial"]);
  });

  it("beş independent_state kontrolünü eşler: bozuk kayıt, göç, türetim, maksimum roundtrip ve deterministik serialize", () => {
    const bad = decode({ version: 6, m: 999, j: 0.5, k: -4, u: 2, score: 100, passed: true,
      c: { i: "<img src=x onerror=alert(1)>", n: Array(10).fill(1), a: Array(10).fill(4), s: 1023 },
      d: ["<script>", "I", {}], g: ["x", Infinity, -999, 999], checklist: { "<svg>": true } }, context);
    expect([MODES.includes(bad.mode), bad.currentCase, bad.quizPage, bad.bestScore, bad.passed]).toEqual([true, 0, 0, null, false]);
    expect(JSON.stringify(encode(bad, context))).not.toContain("<");

    const complete = blank(context);
    complete.viewed = Object.fromEntries(MODES.map((mode) => [mode, 16])) as typeof complete.viewed;
    complete.caseSession.submitted.fill(true);
    complete.quizSession.submitted.fill(true);
    complete.caseSession.answers = complete.caseSession.ids.map((id) => curriculum.byId[id]!.correct);
    complete.quizSession.answers = complete.quizSession.ids.map((id) => curriculum.byId[id]!.correct);
    expect(derive(complete, context).passed).toBe(true);
    const maxBack = decode(encode(complete, context), context);
    expect([maxBack.bestScore, maxBack.passed, Object.keys(maxBack.viewed).length]).toEqual([100, true, 13]);

    const deterministicContext = (): StateContext => ({ curriculum, randomInt: createSeededRandomInt(20260924) });
    const aContext = deterministicContext(), bContext = deterministicContext();
    const a = encode(blank(aContext), aContext), b = encode(blank(bContext), bContext);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("4096 bayt üstündeki JSON'u reddeder ve encoded kaydı sınırlı tutar", () => {
    expect(decode(`{"version":6,"padding":"${"x".repeat(MAX_STATE_BYTES)}"}`, context).mode).toBe("normal");
    const state = blank(context);
    state.caseSession.id = "x".repeat(4096);
    expect(() => encode(state, context)).toThrow(/4096/);
    const valid = JSON.stringify(encode(blank(context), context));
    expect(valid.length).toBeLessThanOrEqual(MAX_STATE_BYTES);
  });
});

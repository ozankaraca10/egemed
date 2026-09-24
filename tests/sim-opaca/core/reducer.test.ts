import { describe, expect, it } from "vitest";
import { ALL_CASES, buildSuspend, computeCaseResult, initialState, initialTelemetry, reducer } from "../../../packages/sim-opaca/src/index";
import type { AppState } from "../../../packages/sim-opaca/src/index";

/** Reducer grubu — kaynak egemed-opaca tests/core.test.ts `describe('reducer')` portu (7 test).
 *  Beklentiler kaynakla birebir aynıdır; `restore` testinin yükü kaynak gibi `buildSuspend` ile
 *  üretilir (S7 ile geldi). */

describe("reducer (kaynak davranışı)", () => {
  const s0: AppState = { ...initialState };

  it("startMode eski sonuçları ve sayaçları sıfırlar (K4)", () => {
    const dirty: AppState = { ...s0, caseResults: [{} as never], assessmentTimer: 5000, caseElapsed: 4000, caseIndex: 4 };
    const s = reducer(dirty, { type: "startMode", mode: "assessment" });
    expect(s.caseResults).toEqual([]);
    expect(s.assessmentTimer).toBe(0);
    expect(s.caseElapsed).toBe(0);
    expect(s.caseIndex).toBe(0);
    expect(s.attempts).toBe(1);
  });

  it("bölge girişi sırayı bir kez kaydeder, süre birikir", () => {
    let s = reducer(s0, { type: "zoneEnter", zoneIds: ["a_trachea"] });
    s = reducer(s, { type: "zoneEnter", zoneIds: ["a_trachea", "c_heart"] });
    s = reducer(s, { type: "zoneDwell", zoneIds: ["a_trachea"], dwellMs: 250 });
    s = reducer(s, { type: "zoneDwell", zoneIds: ["a_trachea", "e_bones"], dwellMs: 250 });
    expect(s.telemetry.order).toEqual(["a_trachea", "c_heart", "e_bones"]);
    expect(s.telemetry.visits.a_trachea).toEqual({ dwellMs: 500, visits: 2, firstOrder: 0 });
    expect(s.telemetry.visits.e_bones?.firstOrder).toBe(2);
    expect(reducer(s, { type: "zoneDwell", zoneIds: [], dwellMs: 250 })).toBe(s);
  });

  it("araç kullanımı sayılır", () => {
    const s = reducer(reducer(s0, { type: "toolUsed", tool: "zoom" }), { type: "toolUsed", tool: "zoom" });
    expect(s.telemetry.toolUse.zoom).toBe(2);
  });

  it("restore yalnız aktif modun listesine yazar (K3)", () => {
    const start: AppState = { ...s0, session: { practiceIds: ["p1"], assessmentIds: ["a1"], seed: 1 } };
    const payload = buildSuspend({
      ...start,
      mode: "assessment",
      session: { practiceIds: ["x"], assessmentIds: ["a9", "a8"], seed: 7 },
    });
    const s = reducer(start, { type: "restore", payload });
    expect(s.session).toEqual({ practiceIds: ["p1"], assessmentIds: ["a9", "a8"], seed: 7 });
    expect(s.screen).toBe("simulation");
    expect(s.tutorialSeen).toBe(true);
  });

  it("finishCase bekleyen özet varken tekrar sonuç eklemez; nextCase sıfırlar", () => {
    const def = ALL_CASES[0];
    expect(def).toBeDefined();
    if (!def) return;
    let s = reducer({ ...s0, mode: "practice" }, { type: "caseMount", caseDef: def });
    s = reducer(s, { type: "timer", deltaMs: 3000 });
    s = reducer(s, { type: "finishCase" });
    s = reducer(s, { type: "finishCase" });
    expect(s.caseResults).toHaveLength(1);
    expect(s.pendingSummary).not.toBeNull();
    s = reducer(s, { type: "nextCase" });
    expect(s.pendingSummary).toBeNull();
    expect(s.caseIndex).toBe(1);
    expect(s.caseElapsed).toBe(0);
    expect(s.telemetry.order).toEqual([]);
  });

  it("advance son soruda ilerlemez", () => {
    const def = ALL_CASES[0];
    expect(def).toBeDefined();
    if (!def) return;
    let s = reducer(s0, { type: "caseMount", caseDef: def });
    for (let i = 0; i < def.questions.length + 2; i++) s = reducer(s, { type: "advance" });
    expect(s.step).toBe(def.questions.length - 1);
  });

  it("uygulamada ipucu cezası vaka sonucuna yansır", () => {
    const def = ALL_CASES[0];
    expect(def).toBeDefined();
    if (!def) return;
    const correct = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]));
    const full = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 0, mode: "practice" });
    const hinted = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: "practice" });
    const assess = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: "assessment" });
    expect(hinted.total).toBe(Math.max(0, full.total - 5));
    expect(assess.total).toBe(full.total);
  });
});

import { describe, expect, it } from "vitest";
import {
  ACTIVE_VIEWS, MODE_CARDS, MODES, applyMode, blank, createPulseEventEmitter,
  createSeededRandomInt, selectLead, showView,
} from "../../packages/sim-pulse/src/index";
import type { Mode, PulseController, StateContext } from "../../packages/sim-pulse/src/index";

function fixture() {
  const cases = Array.from({ length: 10 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
  const questions = Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
  const byId = Object.fromEntries([...cases, ...questions].map((id) => [id, { correct: 0, ecg: { leads: ["II", "aVF", "V3"] as const } }]));
  const context: StateContext = { curriculum: { version: 1, cases, questions, byId }, randomInt: createSeededRandomInt(42) };
  const state = blank(context), events = createPulseEventEmitter();
  const received: Array<{ name: string; payload: unknown }> = [];
  events.on("cardai:mode", (payload) => received.push({ name: "mode", payload }));
  events.on("cardai:view", (payload) => received.push({ name: "view", payload }));
  const calls: string[] = [];
  const controller: PulseController = {
    start() {}, pause() { calls.push("pause"); }, resume() {}, setSpeed() {},
    observeMode(mode) { calls.push(`observe:${mode ?? "none"}`); }, startExamClock() { return () => undefined; }, dispose() {},
  };
  return { state, events, received, calls, action: { events, controller } };
}

describe("Pulse mode, lead and view actions", () => {
  it("applies every supported mode's default leads and emits the mode host event", () => {
    const f = fixture();
    for (const mode of MODES) {
      f.state.time = 44;
      expect(applyMode(f.state, mode, f.action)).toBe(true);
      expect(f.state.mode).toBe(mode);
      expect(f.state.time).toBe(2);
      expect(f.state.lead).toBe(f.state.leads[0]);
      expect(f.state.activeLead).toBe(0);
    }
    expect(f.received).toHaveLength(MODES.length);
    expect(f.received.at(-1)).toEqual({ name: "mode", payload: { mode: MODES.at(-1) } });
  });

  it("preserves time and leads when reset is disabled; invalid modes have no effects", () => {
    const f = fixture(), leads = [...f.state.leads];
    f.state.time = 19;
    expect(applyMode(f.state, "af", f.action, false)).toBe(true);
    expect([f.state.time, f.state.leads]).toEqual([19, leads]);
    expect(applyMode(f.state, "educator" as Mode, f.action)).toBe(false);
    expect(f.received).toHaveLength(1);
  });

  it("selects a lead by column or lead name and rejects mismatched groups", () => {
    const f = fixture();
    expect(selectLead(f.state, 0, "aVR", f.action)).toBe(false);
    expect(selectLead(f.state, 2, "V6", f.action)).toBe(true);
    expect([f.state.leads[2], f.state.activeLead, f.state.lead]).toEqual(["V6", 2, "V6"]);
    expect(selectLead(f.state, "III", f.action)).toBe(true);
    expect([f.state.leads[0], f.state.activeLead, f.state.lead]).toEqual(["III", 0, "III"]);
    expect(f.received).toHaveLength(2);
  });

  it("routes only the seven supported views and synchronizes pause and observation", () => {
    const f = fixture();
    for (const view of ACTIVE_VIEWS) expect(showView(f.state, f.action, view)).toBe(view);
    expect(showView(f.state, f.action, "educator")).toBe("sim");
    expect(f.state.activeView).toBe("sim");
    expect(f.calls.filter((call) => call === "pause")).toHaveLength(ACTIVE_VIEWS.length + 1);
    expect(f.calls.at(-1)).toBe("observe:normal");
    expect(f.received.filter((event) => event.name === "view")).toHaveLength(ACTIVE_VIEWS.length + 1);
  });

  it("exposes the three entry-card data models for the T20 renderer", () => {
    expect(MODE_CARDS.map(({ id, view }) => [id, view])).toEqual([
      ["learn", "sim"], ["practice", "case"], ["assessment", "quiz"],
    ]);
    expect(MODE_CARDS.every((card) => card.features.length > 0 && card.description.length > 0)).toBe(true);
  });
});

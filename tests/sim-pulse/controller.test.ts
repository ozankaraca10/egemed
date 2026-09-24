import { describe, expect, it } from "vitest";
import { createPulseController, CardiacModel, createSeededRandomInt, blank } from "../../packages/sim-pulse/src/index";
import type { FrameCallback, StateContext } from "../../packages/sim-pulse/src/index";

function fixture(onFrame?: () => void) {
  const cases = Array.from({ length: 10 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
  const questions = Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
  const byId = Object.fromEntries([...cases, ...questions].map((id) => [id, { correct: 0, ecg: { leads: ["II", "aVF", "V3"] as const } }]));
  const context: StateContext = { curriculum: { version: 1, cases, questions, byId }, randomInt: createSeededRandomInt(42) };
  const state = blank(context);
  let now = 0, nextFrame = 1, nextInterval = 1;
  let hidden = false;
  const frames = new Map<number, FrameCallback>();
  const cancelledFrames: number[] = [];
  const intervals = new Map<number, () => void>();
  const clearedIntervals: number[] = [];
  const controller = createPulseController({ state, model: new CardiacModel(state.mode), ...(onFrame ? { onFrame } : {}), scheduler: {
    requestFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelFrame(id) { cancelledFrames.push(id); frames.delete(id); },
    now: () => now,
    setInterval(callback) { const id = nextInterval++; intervals.set(id, callback); return id; },
    clearInterval(id) { clearedIntervals.push(id); intervals.delete(id); },
    isHidden: () => hidden,
  } });
  return {
    state, controller, frames, intervals, cancelledFrames, clearedIntervals,
    setHidden(value: boolean) { hidden = value; },
    step(milliseconds = 100) {
      now += milliseconds;
      const [id, callback] = frames.entries().next().value ?? [];
      if (typeof id === "number" && callback) { frames.delete(id); callback(); }
    },
  };
}

describe("Pulse controller ve scheduler", () => {
  it("16 saniyelik gözlemi hızdan bağımsız tamamlar ve simülasyon hızını uygular", () => {
    const f = fixture();
    f.controller.observeMode("normal");
    f.controller.setSpeed(2);
    f.controller.start();
    for (let i = 0; i < 161; i += 1) f.step();
    expect(f.state.viewed.normal).toBe(16);
    expect(f.state.time).toBeCloseTo(34, 5);
    expect(f.state.viewed.af).toBe(0);
    f.controller.dispose();
  });

  it("gizli sekmede ilerlemeyi keser ve görünür olduğunda sıçrama yapmaz", () => {
    const f = fixture();
    f.controller.observeMode("normal");
    f.controller.start();
    f.step(); f.step();
    const before = [f.state.time, f.state.viewed.normal];
    f.setHidden(true);
    f.step(5000);
    expect([f.state.time, f.state.viewed.normal]).toEqual(before);
    f.setHidden(false);
    f.step(1000);
    expect([f.state.time, f.state.viewed.normal]).toEqual(before);
    f.step();
    expect(f.state.time).toBeCloseTo((before[0] ?? 0) + 0.1, 5);
    f.controller.dispose();
  });

  it("duraklat/devam ve sınav interval'ını dispose ile temizler; sonrasında tick üretmez", () => {
    let rendered = 0, examTicks = 0;
    const f = fixture(() => { rendered += 1; });
    const removeExamClock = f.controller.startExamClock(() => { examTicks += 1; });
    const examCallback = f.intervals.values().next().value;
    f.controller.start();
    f.step(); f.step();
    f.controller.pause();
    expect(f.frames.size).toBe(0);
    f.controller.resume();
    f.step();
    expect(f.state.time).toBeCloseTo(2.1, 5);
    examCallback?.();
    expect(examTicks).toBe(1);
    const beforeDispose = rendered;
    f.controller.dispose();
    removeExamClock();
    examCallback?.();
    f.step();
    expect(rendered).toBe(beforeDispose);
    expect([f.frames.size, f.intervals.size, f.clearedIntervals.length]).toEqual([0, 0, 1]);
    expect(f.cancelledFrames.length).toBeGreaterThan(0);
  });
});

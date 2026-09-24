import { describe, expect, it } from "vitest";
import { createPulseLifecycle, type AbortControllerLike, type ListenerTarget } from "../../packages/sim-pulse/src/host/lifecycle";
import {
  bindCaliperDrag, caliperPointFromPointer, nudgeCaliper,
  type CaliperPointerEvent, type CaliperState,
} from "../../packages/sim-pulse/src/ui/case/caliper";
import { scheduleChallengeCompletion, validateChallenge } from "../../packages/sim-pulse/src/ui/case/challenge";
import { guideStepAt, guideSteps } from "../../packages/sim-pulse/src/ui/case/guide";

class Target implements ListenerTarget {
  readonly listeners = new Map<string, Set<(...args: never[]) => void>>();
  adds = 0;
  removes = 0;
  addEventListener(type: string, listener: (...args: never[]) => void): void {
    this.adds += 1;
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }
  removeEventListener(type: string, listener: (...args: never[]) => void): void {
    this.removes += 1;
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event: CaliperPointerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
  emitKey(key: string, shiftKey = false): void {
    const event = { key, shiftKey, preventDefault: () => undefined };
    for (const listener of this.listeners.get("keydown") ?? []) listener(event as never);
  }
}

function lifecycle() {
  const controller: AbortControllerLike = { signal: {}, abort: () => undefined };
  return createPulseLifecycle(controller);
}
function pointer(pointerId: number, clientX: number, clientY: number) {
  let prevented = 0, stopped = 0;
  return {
    event: { pointerId, clientX, clientY, preventDefault: () => { prevented += 1; }, stopPropagation: () => { stopped += 1; } },
    prevented: () => prevented, stopped: () => stopped,
  };
}

describe("Pulse vaka kaliperi", () => {
  it("pointer koordinatlarını normalize eder, sınırlar ve sıfır boyutta güvenli kalır", () => {
    expect(caliperPointFromPointer(60, 80, { left: 10, top: 20, width: 100, height: 100 })).toEqual({ x: 0.5, y: 0.6 });
    expect(caliperPointFromPointer(-100, 400, { left: 0, top: 0, width: 10, height: 10 })).toEqual({ x: 0.02, y: 0.96 });
    expect(caliperPointFromPointer(1, 1, { left: 0, top: 0, width: 0, height: 10 })).toEqual({ x: 0.02, y: 0.04 });
  });

  it("pointer sürüklemesini ve klavye nudges'ını uygular; dispose listener'ları söker", () => {
    const life = lifecycle(), pointerTarget = new Target(), a = new Target(), b = new Target();
    const state: CaliperState = { a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.7 } };
    let captures = 0, changes = 0;
    const handleA = Object.assign(a, { setPointerCapture: (_id: number) => { captures += 1; } });
    bindCaliperDrag({ lifecycle: life, pointerTarget, state,
      handles: [{ handle: "a", target: handleA }, { handle: "b", target: b }],
      rect: () => ({ left: 0, top: 0, width: 100, height: 100 }), changed: () => { changes += 1; } });
    const down = pointer(7, 0, 0); a.emit("pointerdown", down.event);
    pointerTarget.emit("pointermove", pointer(8, 90, 90).event);
    expect(state.a).toEqual({ x: 0.1, y: 0.2 });
    pointerTarget.emit("pointermove", pointer(7, 50, 60).event);
    expect(state.a).toEqual({ x: 0.5, y: 0.6 });
    expect([captures, down.prevented(), down.stopped(), changes]).toEqual([1, 1, 1, 1]);
    a.emitKey("ArrowRight");
    a.emitKey("ArrowUp", true);
    expect(state.a).toEqual({ x: 0.505, y: 0.58 });
    expect(nudgeCaliper(state, "a", "ArrowLeft")).toBe(true);
    expect(state.a.x).toBe(0.5);
    expect(nudgeCaliper(state, "a", "ArrowUp", true)).toBe(true);
    expect(state.a.y).toBe(0.56);
    expect(nudgeCaliper(state, "a", "Tab")).toBe(false);
    life.dispose();
    expect([pointerTarget.removes, a.removes, b.removes]).toEqual([3, 2, 2]);
    pointerTarget.emit("pointermove", pointer(7, 0, 0).event);
    expect(state.a).toEqual({ x: 0.5, y: 0.56 });
  });

  it("görevleri ST zaman penceresi ve en uzun R–R aralığının ortasıyla doğrular", () => {
    const beats = [{ r: 1 }, { r: 2 }, { r: 3.5 }];
    expect(validateChallenge("st", 1.04, beats[0]!, beats, { leftTime: 0 }, 4)).toBe(true);
    expect(validateChallenge("st", 1.201, beats[0]!, beats, { leftTime: 0 }, 4)).toBe(false);
    expect(validateChallenge("rr", 2.75, beats[1]!, beats, { leftTime: 0 }, 4)).toBe(true);
    expect(validateChallenge("rr", 1.5, beats[0]!, beats, { leftTime: 0 }, 4)).toBe(false);
    expect(validateChallenge("rr", Number.NaN, beats[0]!, beats, { leftTime: 0 }, 4)).toBe(false);
  });

  it("rehber adımlarını VF, P dalgasız ve dairesel gezinme için uyarlar", () => {
    expect(guideSteps("normal")).toHaveLength(5);
    expect(guideSteps("vf").map((step) => step.phase)).toEqual(["qrs", "fill"]);
    expect(guideSteps("pat")[0]?.title).toBe("Ektopik P ve atriyum");
    expect(guideSteps("af", ["af"]).some((step) => step.phase === "atrial")).toBe(false);
    const steps = guideSteps("normal");
    expect(guideStepAt(steps, -1)).toEqual(steps[4]);
    expect(guideStepAt([], 0)).toBeNull();
  });

  it("gecikmeli görev tamamlamasını lifecycle dispose ile iptal eder", () => {
    const life = lifecycle();
    let callback: (() => void) | undefined, cleared: unknown;
    const timers = { setTimeout: (handler: () => void) => { callback = handler; return 17; }, clearTimeout: (handle: unknown) => { cleared = handle; } };
    let completed = 0;
    scheduleChallengeCompletion(life, timers, () => { completed += 1; });
    life.dispose();
    callback?.();
    expect(cleared).toBe(17);
    expect(completed).toBe(0);
  });
});

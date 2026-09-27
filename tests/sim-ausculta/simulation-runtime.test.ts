import { describe, expect, it, vi } from "vitest";
import { armTimer, bindDismissListeners, rememberQuestionShown } from "../../packages/sim-ausculta/src/index";
import type { SimulationClock, SimulationListenerEnv } from "../../packages/sim-ausculta/src/index";

/** S15c — dinleyici/zamanlayıcı temizliği ve soru damgası. DOM yok. */

function listenerEnv(): {
  env: SimulationListenerEnv;
  fire(type: "mousedown" | "keydown", event: { key?: string; target: unknown }): void;
  added: string[];
  removed: string[];
} {
  const handlers = new Map<string, (event: { key?: string; target: unknown }) => void>();
  const added: string[] = [];
  const removed: string[] = [];
  return {
    added,
    removed,
    env: {
      addEventListener(type, handler) {
        added.push(type);
        handlers.set(type, handler);
      },
      removeEventListener(type, handler) {
        expect(handlers.get(type)).toBe(handler);
        removed.push(type);
        handlers.delete(type);
      },
      containsNode: () => false,
    },
    fire(type, event) {
      handlers.get(type)?.(event);
    },
  };
}

function clock(): { clock: SimulationClock; fire(): void; cleared: number[] } {
  let pending: (() => void) | null = null;
  const cleared: number[] = [];
  return {
    cleared,
    clock: {
      setTimeout(handler) {
        pending = handler;
        return 7;
      },
      clearTimeout(handle) {
        cleared.push(handle);
        pending = null;
      },
    },
    fire() {
      const run = pending;
      pending = null;
      run?.();
    },
  };
}

describe("simulation-runtime", () => {
  it("dinleyiciyi kaldırır ve kesilen zamanlayıcıyı çalıştırmaz", () => {
    const listeners = listenerEnv();
    const dismiss = vi.fn();
    const stopListen = bindDismissListeners(listeners.env, () => false, dismiss);
    listeners.fire("mousedown", { target: {} });
    listeners.fire("keydown", { key: "Escape", target: {} });
    listeners.fire("keydown", { key: "Enter", target: {} });
    expect(dismiss).toHaveBeenCalledTimes(2);
    stopListen();
    stopListen();
    expect(listeners.removed).toEqual(["mousedown", "keydown"]);
    listeners.fire("mousedown", { target: {} });
    expect(dismiss).toHaveBeenCalledTimes(2);

    const timers = clock();
    const fire = vi.fn();
    const stopTimer = armTimer(timers.clock, 600, fire);
    stopTimer();
    timers.fire();
    expect(timers.cleared).toEqual([7]);
    expect(fire).not.toHaveBeenCalled();
  });

  it("soru damgasını bir kez yazar", () => {
    const first = rememberQuestionShown({}, "q1", 10);
    expect(rememberQuestionShown(first, "q1", 99)).toEqual({ q1: 10 });
    expect(rememberQuestionShown(first, "q2", 20)).toEqual({ q1: 10, q2: 20 });
  });
});

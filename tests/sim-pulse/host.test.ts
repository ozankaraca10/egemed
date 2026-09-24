import { describe, expect, it } from "vitest";
import { getRootFlag, query, setRootFlag, type PulseRoot } from "../../packages/sim-pulse/src/host/dom";
import { createPulseEventEmitter } from "../../packages/sim-pulse/src/host/events";
import {
  createPulseLifecycle,
  type AbortControllerLike,
  type EventListenerLike,
  type ListenerTarget,
} from "../../packages/sim-pulse/src/host/lifecycle";

function makeRoot(label: string): PulseRoot & { readonly nodes: Map<string, unknown> } {
  const nodes = new Map<string, unknown>([[".instance", label]]);
  return { dataset: {}, nodes, querySelector: (selector) => nodes.get(selector) ?? null };
}

function makeController(): AbortControllerLike & { aborted: boolean } {
  return {
    signal: {},
    aborted: false,
    abort() { this.aborted = true; },
  };
}

class FakeTarget implements ListenerTarget {
  readonly listeners = new Map<string, Set<EventListenerLike>>();

  addEventListener(type: string, listener: EventListenerLike): void {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  removeEventListener(type: string, listener: EventListenerLike): void {
    this.listeners.get(type)?.delete(listener);
  }

  get count(): number {
    return [...this.listeners.values()].reduce((total, bucket) => total + bucket.size, 0);
  }
}

describe("Pulse host yardımcıları", () => {
  it("DOM aramasını ve dataset bayraklarını her kök içinde izole eder", () => {
    const first = makeRoot("first"), second = makeRoot("second");
    expect(query<string>(first, ".instance")).toBe("first");
    expect(query<string>(second, ".instance")).toBe("second");
    setRootFlag(first, "mode", "af");
    setRootFlag(second, "landingOpen", true);
    expect([getRootFlag(first, "mode"), getRootFlag(second, "mode"), getRootFlag(second, "landingOpen")])
      .toEqual(["af", undefined, "true"]);
    setRootFlag(first, "mode", null);
    expect(getRootFlag(first, "mode")).toBeUndefined();
  });

  it("tipli olayları örnekler arasında yalıtır ve aboneliği çözer", () => {
    const first = createPulseEventEmitter(), second = createPulseEventEmitter();
    const received: unknown[] = [];
    const unsubscribe = first.on("cardai:mode", (payload) => received.push(payload));
    first.emit("cardai:mode", { mode: "af" });
    second.emit("cardai:mode", { mode: "pvc" });
    unsubscribe();
    first.emit("cardai:mode", { mode: "normal" });
    expect(received).toEqual([{ mode: "af" }]);
    first.clear();
    second.clear();
  });

  it("tek abort sinyaliyle listener, timer, RAF ve observer kayıtlarını sıfırlar", () => {
    const controller = makeController();
    const lifecycle = createPulseLifecycle(controller);
    const target = new FakeTarget();
    const activeTimers = new Set([1, 2]);
    const activeFrames = new Set([3]);
    const observer = { disconnect: () => { activeObservers.delete(observer); } };
    const activeObservers = new Set([observer]);
    lifecycle.listen(target, "keydown", () => undefined);
    lifecycle.listen(target, "pagehide", () => undefined);
    lifecycle.timer(1, (handle) => { activeTimers.delete(handle as number); });
    lifecycle.timer(2, (handle) => { activeTimers.delete(handle as number); });
    lifecycle.frame(3, (handle) => { activeFrames.delete(handle as number); });
    lifecycle.observe(observer);
    expect([target.count, lifecycle.signal]).toEqual([2, controller.signal]);

    lifecycle.dispose();
    expect([controller.aborted, target.count, activeTimers.size, activeFrames.size, activeObservers.size])
      .toEqual([true, 0, 0, 0, 0]);
    lifecycle.dispose();
    expect([target.count, activeTimers.size, activeFrames.size, activeObservers.size]).toEqual([0, 0, 0, 0]);
  });

  it("dispose sonrasında eklenen kaynakları hemen temizler", () => {
    const lifecycle = createPulseLifecycle(makeController());
    const target = new FakeTarget();
    let cleared = 0;
    lifecycle.dispose();
    lifecycle.listen(target, "click", () => undefined);
    lifecycle.timer(1, () => { cleared += 1; });
    expect([target.count, cleared]).toEqual([0, 1]);
  });
});

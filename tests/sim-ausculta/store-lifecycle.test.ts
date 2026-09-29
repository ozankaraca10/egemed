import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BEST_SCORE_KEY, StoreProvider, createFlushHandlers, createLifecycle, createMemoryRuntimeAdapter, useStore } from "../../packages/sim-ausculta/src/index";
import type { LifecycleHandlers, StoragePort, StoreContextValue, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Yaşam döngüsü DOM'suz: sahte pencere dinleyici ve zamanlayıcı sayar.
 *  React effect'leri statik render'da koşmaz; provider yalnız kurulumu gösterir. */

function createFakeEnv() {
  let nextTimer = 1;
  let removeCalls = 0;
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, () => void>();
  return {
    visibilityState: "visible" as "hidden" | "visible",
    get removeCalls(): number {
      return removeCalls;
    },
    addEventListener(type: string, handler: () => void): void {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(handler);
      listeners.set(type, set);
    },
    removeEventListener(type: string, handler: () => void): void {
      removeCalls += 1;
      listeners.get(type)?.delete(handler);
    },
    setTimeout(handler: () => void): number {
      const handle = nextTimer++;
      timers.set(handle, handler);
      return handle;
    },
    clearTimeout(handle: number): void {
      timers.delete(handle);
    },
    fire(type: string): void {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    runTimers(): number {
      const pending = [...timers.values()];
      timers.clear();
      for (const handler of pending) handler();
      return pending.length;
    },
    listenerCount(): number {
      let count = 0;
      for (const set of listeners.values()) count += set.size;
      return count;
    },
    timerCount(): number {
      return timers.size;
    },
  };
}

type FakeEnv = ReturnType<typeof createFakeEnv>;

function memoryStorage(seed: Record<string, string> = {}): StoragePort {
  const entries = new Map(Object.entries(seed));
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

const flushHandlers = (): LifecycleHandlers => ({ flush: vi.fn(), pageHide: vi.fn() });

describe("yaşam döngüsü (createLifecycle)", () => {

  it("pagehide çalışma zamanını yazar", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    const runtime = { flushNow: vi.fn() };
    lifecycle.attach(createFlushHandlers(runtime));
    env.fire("pagehide");
    env.fire("beforeunload");
    env.visibilityState = "hidden";
    env.fire("visibilitychange");
    expect(runtime.flushNow).toHaveBeenCalledTimes(3);
    lifecycle.detach();
  });

  it("ticker durunca yeniden kurulmaz", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    lifecycle.attach(flushHandlers());
    const onTick = vi.fn();
    const stop = lifecycle.startTicker(1000, onTick);
    expect(env.runTimers()).toBe(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(env.timerCount()).toBe(1);
    stop();
    expect(env.timerCount()).toBe(0);
    env.runTimers();
    expect(onTick).toHaveBeenCalledTimes(1);
    lifecycle.detach();
  });
});

describe("StoreProvider (DOM'suz statik render)", () => {

  it("iki provider birbirinin veri yoluna ve puanına sızmaz", () => {
    const seen: StoreContextValue[] = [];
    function Capture() {
      const ctx = useStore();
      seen.push(ctx);
      return createElement("span", null, "ausculta");
    }
    const render = (now: number, storage: StoragePort, env: WindowLike): string =>
      renderToStaticMarkup(
        createElement(StoreProvider, {
          children: createElement(Capture),
          env,
          now: () => now,
          runtime: createMemoryRuntimeAdapter(),
          storage,
        }),
      );

    expect(render(100, memoryStorage({ [BEST_SCORE_KEY]: JSON.stringify({ practice: 42 }) }), createFakeEnv())).toContain(
      "ausculta",
    );
    expect(render(200, memoryStorage(), createFakeEnv())).toContain("ausculta");

    const [a, b] = seen;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;

    expect(a.bus).not.toBe(b.bus);
    expect(a.runtime).not.toBe(b.runtime);
    expect(a.now()).toBe(100);
    expect(b.now()).toBe(200);
    expect(a.state.bestScore).toEqual({ practice: 42, assessment: 0 });
    expect(b.state.bestScore).toEqual({ practice: 0, assessment: 0 });

    a.bus.emit({ type: "hint_used", caseId: "c1" });
    expect(a.bus.getLog()).toHaveLength(1);
    expect(b.bus.getLog()).toHaveLength(0);
  });
});

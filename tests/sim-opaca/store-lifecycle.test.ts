import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BEST_SCORE_KEY,
  StoreProvider,
  buildSuspend,
  createFlushHandlers,
  createLifecycle,
  createMemoryRuntimeAdapter,
  initialState,
  initialTelemetry,
  useStore,
} from "../../packages/sim-opaca/src/index";
import type {
  AppState,
  LifecycleHandlers,
  StoragePort,
  StoreContextValue,
  WindowLike,
} from "../../packages/sim-opaca/src/index";

/** Store yaşam döngüsü grubu — E2 §7.5 kabulü (S7), DOM'suz. React effect'leri statik render'da
 *  koşmadığı için yaşam döngüsü mantığı saf `createLifecycle` biriminde test edilir; provider
 *  yalnız çağırır. Sahte pencere kayıtlı dinleyici/timer'ları sayar; zaman elle tetiklenir. */

/** Sahte pencere/belge sınırı: dinleyici kaydı, zamanlayıcı ve görünürlük yüzeyi. */
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
    /** Kayıtlı dinleyicileri tip adıyla tetikler. */
    fire(type: string): void {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    /** Bekleyen tüm zamanlayıcıları bir kez çalıştırır; sayısını döndürür. */
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

/** Bellek içi depo; en iyi puan K-P3 kararına kadar port arkasında (§7.2). */
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
  it("attach→detach sonrası dinleyici ve zamanlayıcı kalmaz; çift detach no-op", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    const handlers = flushHandlers();

    lifecycle.attach(handlers);
    lifecycle.attach(handlers);
    expect(env.listenerCount()).toBe(3);

    const stop = lifecycle.startTicker(1000, vi.fn());
    expect(env.timerCount()).toBe(1);

    lifecycle.detach();
    expect(env.listenerCount()).toBe(0);
    expect(env.timerCount()).toBe(0);
    expect(env.removeCalls).toBe(3);

    lifecycle.detach();
    expect(env.removeCalls).toBe(3);
    stop();

    env.fire("pagehide");
    expect(handlers.pageHide).not.toHaveBeenCalled();
  });

  it("gizli görünürlükte ve beforeunload'da flush, pagehide'da pageHide çağrılır", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    const handlers = flushHandlers();
    lifecycle.attach(handlers);

    env.fire("visibilitychange");
    expect(handlers.flush).not.toHaveBeenCalled();

    env.visibilityState = "hidden";
    env.fire("visibilitychange");
    expect(handlers.flush).toHaveBeenCalledTimes(1);

    env.fire("beforeunload");
    expect(handlers.flush).toHaveBeenCalledTimes(2);

    env.fire("pagehide");
    expect(handlers.pageHide).toHaveBeenCalledTimes(1);
    lifecycle.detach();
  });

  it("pagehide çalışma zamanını yazar (auto-flush köprüsü)", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    const runtime = { flushNow: vi.fn() };
    lifecycle.attach(createFlushHandlers(runtime));

    env.fire("pagehide");
    expect(runtime.flushNow).toHaveBeenCalledTimes(1);

    env.fire("beforeunload");
    env.visibilityState = "hidden";
    env.fire("visibilitychange");
    expect(runtime.flushNow).toHaveBeenCalledTimes(3);
    lifecycle.detach();
  });

  it("ticker setTimeout zinciriyle işler; durdurunca yeniden kurulmaz", () => {
    const env: FakeEnv = createFakeEnv();
    const lifecycle = createLifecycle(env);
    lifecycle.attach(flushHandlers());
    const onTick = vi.fn();

    const stop = lifecycle.startTicker(1000, onTick);
    expect(env.timerCount()).toBe(1);
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
  it("çocukları render eder", () => {
    const html = renderToStaticMarkup(
      createElement(StoreProvider, {
        children: createElement("p", null, "Opaca içerik"),
        env: createFakeEnv(),
        now: () => 0,
        runtime: createMemoryRuntimeAdapter(),
        storage: memoryStorage(),
      })
    );
    expect(html).toContain("<p>Opaca içerik</p>");
  });

  it("iki provider örneği birbirinin veri yolu ve durumuna sızmaz", () => {
    const seen: StoreContextValue[] = [];
    function Capture() {
      const ctx = useStore();
      seen.push(ctx);
      return createElement("span", null, "opaca");
    }
    const render = (now: number, storage: StoragePort, env: WindowLike): string =>
      renderToStaticMarkup(
        createElement(StoreProvider, {
          children: createElement(Capture),
          env,
          now: () => now,
          runtime: createMemoryRuntimeAdapter(),
          storage,
        })
      );

    expect(render(100, memoryStorage({ [BEST_SCORE_KEY]: JSON.stringify({ practice: 42 }) }), createFakeEnv())).toContain("opaca");
    expect(render(200, memoryStorage(), createFakeEnv())).toContain("opaca");

    const [a, b] = seen;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;

    expect(a.bus).not.toBe(b.bus);
    expect(a.runtime).not.toBe(b.runtime);
    expect(a.state).not.toBe(b.state);
    expect(a.now()).toBe(100);
    expect(b.now()).toBe(200);
    expect(a.state.bestScore).toEqual({ practice: 42, assessment: 0 });
    expect(b.state.bestScore).toEqual({ practice: 0, assessment: 0 });

    a.bus.emit({ type: "hint_used", caseId: "c1" });
    expect(a.bus.getLog()).toHaveLength(1);
    expect(b.bus.getLog()).toHaveLength(0);
  });
});

describe("buildSuspend (S7)", () => {
  it("alanları taşır ve yalnız aktif modun oturum listesini yazar (K3)", () => {
    const base: AppState = {
      ...initialState,
      caseIndex: 2,
      step: 1,
      hintsUsed: 1,
      attempts: 3,
      tutorialDone: true,
      telemetry: {
        ...initialTelemetry(),
        visits: { a_trachea: { dwellMs: 500, visits: 1, firstOrder: 0 } },
        order: ["a_trachea"],
      },
      session: { practiceIds: ["p1"], assessmentIds: ["a1", "a2"], seed: 9 },
    };

    expect(buildSuspend({ ...base, mode: "assessment" })).toEqual({
      v: 1,
      mode: "assessment",
      caseIndex: 2,
      step: 1,
      answers: {},
      hintsUsed: 1,
      caseResults: [],
      tutorialDone: true,
      visits: { a_trachea: { dwellMs: 500, visits: 1, firstOrder: 0 } },
      order: ["a_trachea"],
      attempts: 3,
      sessionIds: ["a1", "a2"],
      sessionSeed: 9,
    });
    expect(buildSuspend({ ...base, mode: "practice" }).sessionIds).toEqual(["p1"]);
  });
});

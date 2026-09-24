import { describe, expect, it } from "vitest";
import type { SimMountContext, SimMountTarget } from "../../packages/sim-host/src/SimHost";
import {
  DEFAULT_PULSE_ASSET_BASE,
  createPulseModule,
  pulseModule,
  type EventListenerLike,
  type PulseModuleEnv,
  type PulseMountElement,
} from "../../packages/sim-pulse/src/index";
import { PULSE_GAMI_STORAGE_KEY } from "../../packages/sim-pulse/src/gamification/repo";

const CONTEXT: SimMountContext = { simId: "pulse", now: () => 1_728_000_000_000 };

interface FakeTarget extends SimMountTarget { children: FakeElement[] }

class FakeElement implements PulseMountElement {
  className = "";
  innerHTML = "";
  readonly dataset: Record<string, string | undefined> = {};
  readonly listeners = new Map<string, Set<EventListenerLike>>();
  readonly canvas = { width: 0, height: 0, clientWidth: 640, clientHeight: 240, getContext: () => null };
  parent: FakeTarget | null = null;
  removed = false;

  addEventListener(type: string, listener: EventListenerLike): void {
    const bucket = this.listeners.get(type) ?? new Set<EventListenerLike>();
    bucket.add(listener); this.listeners.set(type, bucket);
  }
  removeEventListener(type: string, listener: EventListenerLike): void { this.listeners.get(type)?.delete(listener); }
  querySelector(selector: string): unknown { return selector === "[data-pulse-ecg]" && this.innerHTML.includes("data-pulse-ecg") ? this.canvas : null; }
  remove(): void {
    if (this.removed) return;
    this.removed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
  get listenerCount(): number {
    return [...this.listeners.values()].reduce((count, bucket) => count + bucket.size, 0);
  }
}

class FakeEnv implements PulseModuleEnv {
  readonly elements: FakeElement[] = [];
  readonly frames = new Map<number, () => void>();
  readonly intervals = new Map<number, () => void>();
  readonly observers = new Set<object>();
  readonly aborts: Array<{ aborted: boolean }> = [];
  readonly storageValues = new Map<string, string>();
  private nextHandle = 1;
  readonly storage = {
    getItem: (key: string) => this.storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => { this.storageValues.set(key, value); },
    removeItem: (key: string) => { this.storageValues.delete(key); },
  };

  createElement(): FakeElement { const element = new FakeElement(); this.elements.push(element); return element; }
  createAbortController() {
    const entry = { aborted: false }; this.aborts.push(entry);
    return { signal: {}, abort: () => { entry.aborted = true; } };
  }
  createResizeObserver() {
    const observer = {
      observe: () => { this.observers.add(observer); },
      disconnect: () => { this.observers.delete(observer); },
    };
    return observer;
  }
  requestFrame(callback: () => void): number { const handle = this.nextHandle++; this.frames.set(handle, callback); return handle; }
  cancelFrame(handle: number): void { this.frames.delete(handle); }
  now(): number { return 1000; }
  setInterval(callback: () => void): number { const handle = this.nextHandle++; this.intervals.set(handle, callback); return handle; }
  clearInterval(handle: number): void { this.intervals.delete(handle); }
  isHidden(): boolean { return false; }
  get registrationCount(): number {
    return this.elements.reduce((count, element) => count + element.listenerCount, 0)
      + this.frames.size + this.intervals.size + this.observers.size;
  }
}

function fakeTarget(): FakeTarget {
  const target: FakeTarget = {
    children: [],
    appendChild(node) {
      const child = node as FakeElement; child.parent = target; target.children.push(child); return child;
    },
  };
  return target;
}

const click = (dataset: Record<string, string>) => ({ target: { dataset }, preventDefault: () => undefined });

const flush = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe("createPulseModule (SimHost adaptörü)", () => {
  it("pulse kimliğini ve varsayılan assetBase değerini dışa aktarır", () => {
    expect(createPulseModule().id).toBe("pulse");
    expect(pulseModule.id).toBe("pulse");
    expect(DEFAULT_PULSE_ASSET_BASE).toBe("/sims/pulse/");
  });

  it("mount → dispose → remount akışında embedded landing'i atlar", () => {
    const env = new FakeEnv();
    const module = createPulseModule({ env });
    const target = fakeTarget();
    const disposeFirst = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]).toMatchObject({ className: "eg-sim-pulse" });
    expect(target.children[0]?.innerHTML).toContain("Çalışma Modunu Seçin");
    expect(target.children[0]?.innerHTML).not.toContain("Simülatörü başlat");
    disposeFirst();
    expect(target.children).toHaveLength(0);

    const disposeSecond = module.mount(target, CONTEXT);
    expect(target.children).toHaveLength(1);
    disposeSecond();
    expect(target.children).toHaveLength(0);
  });

  it("çift dispose no-op kalır ve tüm listener/RAF/interval kayıtlarını temizler", () => {
    const env = new FakeEnv();
    const target = fakeTarget();
    const dispose = createPulseModule({ env }).mount(target, CONTEXT);
    const root = target.children[0]!;
    root.emit("click", click({ pulseView: "sim" }));
    expect(root.innerHTML).toContain("data-pulse-ecg");
    expect(env.frames.size).toBe(1);
    expect(env.observers.size).toBe(1);
    expect(env.registrationCount).toBeGreaterThan(0);

    dispose(); dispose();
    expect(target.children).toHaveLength(0);
    expect(env.registrationCount).toBe(0);
    expect(env.aborts).toEqual([{ aborted: true }]);
  });

  it("iki mount örneğinin ekranı, controller'ı ve kaynakları birbirinden izoledir", () => {
    const env = new FakeEnv();
    const module = createPulseModule({ env, assetBase: "/tenant/pulse/" });
    const firstTarget = fakeTarget(), secondTarget = fakeTarget();
    const disposeFirst = module.mount(firstTarget, CONTEXT);
    const disposeSecond = module.mount(secondTarget, CONTEXT);
    const first = firstTarget.children[0]!, second = secondTarget.children[0]!;

    first.emit("click", click({ pulseView: "sim" }));
    first.emit("click", click({ pulseMode: "af" }));
    expect(env.observers.size).toBe(1);
    expect(first.innerHTML).toContain("Atriyal fibrilasyon");
    expect(second.innerHTML).toContain("Çalışma Modunu Seçin");
    expect([first.dataset.assetBase, second.dataset.assetBase]).toEqual(["/tenant/pulse/", "/tenant/pulse/"]);

    disposeFirst();
    expect(firstTarget.children).toHaveLength(0);
    expect(secondTarget.children).toHaveLength(1);
    expect(env.registrationCount).toBe(2);
    disposeSecond();
    expect(env.registrationCount).toBe(0);
  });

  it("vaka ve quiz seçimlerini mount içindeki ekran akışına bağlar", () => {
    const env = new FakeEnv();
    const target = fakeTarget();
    const dispose = createPulseModule({ env }).mount(target, CONTEXT);
    const root = target.children[0]!;
    root.emit("click", click({ pulseView: "case" }));
    root.emit("change", { target: { name: "activeCase", value: "0" } });
    root.emit("click", click({ caseAction: "check" }));
    expect(root.innerHTML).toContain("case-feedback-v2");

    root.emit("click", click({ pulseView: "quiz" }));
    root.emit("change", { target: { name: "activeQuiz", value: "1" } });
    root.emit("click", click({ quizAction: "submit" }));
    expect(root.innerHTML).toContain("quiz-feedback-v2");
    dispose();
  });

  it("Başarılarım ve Liderlik ekranlarını üst çubuktan açar", async () => {
    const env = new FakeEnv();
    const target = fakeTarget();
    const dispose = createPulseModule({ env }).mount(target, CONTEXT);
    const root = target.children[0]!;

    root.emit("click", click({ pulseView: "achievements" }));
    expect(root.innerHTML).toContain("Başarılarım");
    expect(root.innerHTML).toContain("Henüz kazanım yok");

    root.emit("click", click({ pulseView: "leaderboard" }));
    await flush();
    expect(root.innerHTML).toContain("Liderlik Tahtası");
    expect(root.innerHTML).toContain("report-table-v2");
    expect(root.innerHTML).toContain("Anonim öğrenci");

    root.emit("click", click({ pulseGamiPeriod: "month" }));
    await flush();
    expect(root.innerHTML).toContain('data-pulse-gami-period="month" aria-pressed="true"');
    dispose();
  });

  it("değerlendirme sonuçları kazanımı bir kez kaydeder ve kartı çizer", async () => {
    const env = new FakeEnv();
    const target = fakeTarget();
    const dispose = createPulseModule({ env }).mount(target, CONTEXT);
    const root = target.children[0]!;

    root.emit("click", click({ pulseView: "quiz" }));
    for (let index = 0; index < 10; index += 1) {
      root.emit("change", { target: { name: "activeQuiz", value: "1" } });
      root.emit("click", click({ quizAction: "submit" }));
      if (index < 9) root.emit("click", click({ quizAction: "next" }));
    }
    root.emit("click", click({ quizAction: "results" }));
    await flush();
    expect(root.innerHTML).toContain("Kazanımlar");
    const stored = JSON.parse(env.storageValues.get(PULSE_GAMI_STORAGE_KEY) ?? "null") as { attempts: unknown[] } | null;
    expect(stored?.attempts).toHaveLength(1);

    root.emit("click", click({ quizAction: "results" }));
    await flush();
    const repeated = JSON.parse(env.storageValues.get(PULSE_GAMI_STORAGE_KEY) ?? "null") as { attempts: unknown[] } | null;
    expect(repeated?.attempts).toHaveLength(1);
    dispose();
  });
});

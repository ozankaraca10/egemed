import { describe, expect, it } from "vitest";
import { createMonitorAudioPort, type MonitorAudioContext, type MonitorIntervalHost } from "../../packages/sim-pulse/src/index";

interface BeatCapture {
  start: number | null;
  stop: number | null;
}

class FakeIntervals implements MonitorIntervalHost {
  private nextId = 1;
  readonly handlers = new Map<number, () => void>();
  readonly cleared: number[] = [];

  setInterval(handler: () => void): number {
    const id = this.nextId++;
    this.handlers.set(id, handler);
    return id;
  }

  clearInterval(handle: unknown): void {
    if (typeof handle !== "number") return;
    this.cleared.push(handle);
    this.handlers.delete(handle);
  }

  tickAll(): void {
    for (const handler of this.handlers.values()) handler();
  }
}

class FakeAudioContext implements MonitorAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  resumeCalls = 0;
  closeCalls = 0;
  readonly beats: BeatCapture[] = [];

  createOscillator() {
    const beat: BeatCapture = { start: null, stop: null };
    this.beats.push(beat);
    return {
      type: "sine",
      frequency: {
        setValueAtTime() { /* noop */ },
        linearRampToValueAtTime() { /* noop */ },
      },
      connect() { /* noop */ },
      start: (time: number) => { beat.start = time; },
      stop: (time: number) => { beat.stop = time; },
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() { /* noop */ },
        linearRampToValueAtTime() { /* noop */ },
      },
      connect() { /* noop */ },
    };
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
  }
}

describe("Pulse landing monitor sesi portu", () => {
  it("unlock sonrası scheduler beep üretir ve stop interval'i temizler", async () => {
    const intervals = new FakeIntervals();
    const ctx = new FakeAudioContext();
    ctx.currentTime = 10;
    const monitor = createMonitorAudioPort({
      createContext: () => ctx,
      intervals,
    });

    monitor.start();
    expect(intervals.handlers.size).toBe(0);

    await expect(monitor.unlock()).resolves.toBe(true);
    monitor.start();
    expect(intervals.handlers.size).toBe(1);
    expect(ctx.beats).toHaveLength(1);
    expect(ctx.beats[0]?.start).toBeCloseTo(10.05, 6);

    ctx.currentTime = 10.9;
    intervals.tickAll();
    expect(ctx.beats).toHaveLength(2);
    expect(ctx.beats[1]?.start).toBeCloseTo(10.85, 6);

    monitor.stop();
    expect(intervals.handlers.size).toBe(0);
  });

  it("close dispose akışında interval'i temizler ve context.close çağırır", async () => {
    const intervals = new FakeIntervals();
    const ctx = new FakeAudioContext();
    const monitor = createMonitorAudioPort({
      createContext: () => ctx,
      intervals,
    });

    await monitor.unlock();
    monitor.start();
    expect(intervals.handlers.size).toBe(1);

    await monitor.close();
    expect(intervals.handlers.size).toBe(0);
    expect(ctx.closeCalls).toBe(1);

    await monitor.close();
    expect(ctx.closeCalls).toBe(1);
    monitor.start();
    expect(intervals.handlers.size).toBe(0);
  });

  it("AudioContext yoksa unlock false döner ve close güvenlidir", async () => {
    const monitor = createMonitorAudioPort({
      createContext: () => null,
      intervals: {
        setInterval: () => 1,
        clearInterval: () => undefined,
      },
    });

    await expect(monitor.unlock()).resolves.toBe(false);
    monitor.start();
    monitor.stop();
    await expect(monitor.close()).resolves.toBeUndefined();
  });
});

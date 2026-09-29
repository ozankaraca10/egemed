import { describe, expect, it } from "vitest";
import type { SoundRecord } from "../../packages/sim-ausculta/src/index";
import { computePeaks, drawWave } from "../../packages/sim-ausculta/src/audio/waveform";
import type { WaveCanvas, WaveContext2D } from "../../packages/sim-ausculta/src/audio/waveform";

function sound(id: string): SoundRecord {
  return { id } as SoundRecord;
}

function buffer(samples: number[]): { getChannelData: () => Float32Array } {
  const data = Float32Array.from(samples);
  return { getChannelData: () => data };
}

interface RecordedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

function canvas(ctx: WaveContext2D | null, clientWidth = 200, clientHeight = 100): WaveCanvas & { width: number; height: number } {
  return {
    clientWidth,
    clientHeight,
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
}

function recorder(): { ctx: WaveContext2D; rects: RecordedRect[]; texts: string[] } {
  const rects: RecordedRect[] = [];
  const texts: string[] = [];
  const ctx: WaveContext2D = {
    fillStyle: "",
    font: "",
    setTransform() {},
    clearRect() {},
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, fillStyle: this.fillStyle });
    },
    fillText(text) {
      texts.push(text);
    },
  };
  return { ctx, rects, texts };
}

describe("Ausculta dalga formu", () => {
  it("her iki örnekte tepe alır ve aynı ses kimliğini önbelleğe yazar", () => {
    const samples = [0.1, -0.8, 0.4, 0.2, -0.5, 0.9, 0, 0.3];
    const peaks = computePeaks(sound("wave-peaks"), buffer(samples), 2);
    expect(peaks[0]).toBeCloseTo(0.4);
    expect(peaks[1]).toBeCloseTo(0.5);
    const again = computePeaks(sound("wave-peaks"), buffer([1, 1, 1, 1]), 4);
    expect(again).toBe(peaks);
    expect(computePeaks(sound("wave-other"), buffer([1, -1]), 1)[0]).toBe(1);
  });

  it("sahte tuvale çubuk ve etiket çizer", () => {
    const host = globalThis as {
      window?: { devicePixelRatio?: number };
      document?: { body: object };
      getComputedStyle?: (element: object) => { fontFamily: string };
    };
    const previous = {
      window: host.window,
      document: host.document,
      getComputedStyle: host.getComputedStyle,
    };
    host.window = { devicePixelRatio: 2 };
    host.document = { body: {} };
    host.getComputedStyle = () => ({ fontFamily: "Inter" });
    const drawn = recorder();
    const surface = canvas(drawn.ctx);
    drawWave(surface, Float32Array.from([1, 0]), {
      progress: 0.4,
      progressColor: "#1673e6",
      color: "#b9cfeb",
      annotations: [{ at: 0.5, label: "S1", color: "#c45" }],
    });
    if (previous.window === undefined) delete host.window;
    else host.window = previous.window;
    if (previous.document === undefined) delete host.document;
    else host.document = previous.document;
    if (previous.getComputedStyle === undefined) delete host.getComputedStyle;
    else host.getComputedStyle = previous.getComputedStyle;

    expect(surface.width).toBe(400);
    expect(surface.height).toBe(200);
    expect(drawn.rects[0]).toMatchObject({ x: 0, fillStyle: "#1673e6", h: 88 });
    expect(drawn.rects[1]).toMatchObject({ x: 100, fillStyle: "#b9cfeb", h: 1 });
    expect(drawn.rects[2]).toMatchObject({ x: 99.5, w: 1, h: 100, fillStyle: "#c45" });
    expect(drawn.texts).toEqual(["S1"]);
    expect(drawn.ctx.font).toBe("600 11px Inter");
  });
});

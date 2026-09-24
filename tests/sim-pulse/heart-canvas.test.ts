import { describe, expect, it } from "vitest";
import {
  coronaryParticlePositions,
  drawHeartCanvas,
  observeHeartCanvas,
  type HeartCanvasContext,
} from "../../packages/sim-pulse/src/ui/sim/heartCanvas";
import { createPulseLifecycle, type AbortControllerLike } from "../../packages/sim-pulse/src/host/lifecycle";

class FakeCanvasContext implements HeartCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 0;
  readonly calls: unknown[][] = [];
  beginPath(): void { this.calls.push(["beginPath"]); }
  moveTo(x: number, y: number): void { this.calls.push(["moveTo", x, y]); }
  bezierCurveTo(...points: [number, number, number, number, number, number]): void {
    this.calls.push(["bezierCurveTo", ...points]);
  }
  closePath(): void { this.calls.push(["closePath"]); }
  fill(): void { this.calls.push(["fill", this.fillStyle]); }
  stroke(): void { this.calls.push(["stroke", this.strokeStyle, this.lineWidth]); }
  clearRect(...rect: [number, number, number, number]): void { this.calls.push(["clearRect", ...rect]); }
  arc(...circle: [number, number, number, number, number]): void { this.calls.push(["arc", ...circle]); }
}

function fakeController(): AbortControllerLike {
  return { signal: {}, abort: () => undefined };
}

describe("Pulse kalp canvas", () => {
  it("sahte bağlamda sahneyi belirli çizim sırasıyla ve parçacıklarla çizer", () => {
    const context = new FakeCanvasContext();
    drawHeartCanvas(context, { width: 200, height: 100 }, 450);
    expect(context.calls.slice(0, 8).map(([name]) => name)).toEqual([
      "clearRect", "beginPath", "moveTo", "bezierCurveTo", "bezierCurveTo", "closePath", "fill", "stroke",
    ]);
    expect(context.calls[0]).toEqual(["clearRect", 0, 0, 200, 100]);
    expect(context.calls.filter(([name]) => name === "arc")).toHaveLength(8);
    expect(context.calls.slice(8).map(([name]) => name)).toEqual(
      Array.from({ length: 8 }, () => ["beginPath", "arc", "fill"]).flat(),
    );
  });

  it("partikül koordinatlarını aynı zaman girdisinde deterministik ve sınırlı üretir", () => {
    const first = coronaryParticlePositions(1250, 6);
    expect(coronaryParticlePositions(1250, 6)).toEqual(first);
    expect(first).toHaveLength(6);
    for (const particle of first) {
      expect(particle.x).toBeGreaterThanOrEqual(0.22);
      expect(particle.x).toBeLessThanOrEqual(0.78);
      expect(particle.y).toBeGreaterThanOrEqual(0.35);
      expect(particle.y).toBeLessThanOrEqual(0.59);
      expect(particle.radius).toBeGreaterThan(0);
    }
    expect(coronaryParticlePositions(Number.NaN, 2)).toEqual(coronaryParticlePositions(0, 2));
  });

  it("boyut gözlemcisini lifecycle'a kaydeder, değişimde çizer ve dispose'ta disconnect eder", () => {
    const context = new FakeCanvasContext();
    const lifecycle = createPulseLifecycle(fakeController());
    let onResize: (() => void) | undefined;
    let disconnects = 0;
    let width = 100;
    const observer = {
      observe(_target: unknown, callback: () => void) { onResize = callback; },
      disconnect() { disconnects += 1; },
    };
    observeHeartCanvas({
      context,
      lifecycle,
      observer,
      target: { canvas: true },
      size: () => ({ width, height: 80 }),
      timeMs: () => 0,
    });
    expect(context.calls[0]).toEqual(["clearRect", 0, 0, 100, 80]);
    width = 240;
    onResize?.();
    expect(context.calls.filter(([name]) => name === "clearRect")).toEqual([
      ["clearRect", 0, 0, 100, 80], ["clearRect", 0, 0, 240, 80],
    ]);
    lifecycle.dispose();
    lifecycle.dispose();
    expect(disconnects).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  ITEM_ECG_ZOOM_STEPS,
  createPulseLifecycle,
  drawEcg,
  drawItemEcg,
  itemEcgGeometry,
  itemEcgZoom,
  itemEcgZoomLabel,
  mainEcgGeometry,
  observeItemEcg,
  type AbortControllerLike,
  type EcgCanvasContext,
} from "../../packages/sim-pulse/src/index";

class FakeContext implements EcgCanvasContext {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 0;
  lineJoin = "";
  font = "";
  textAlign = "";
  readonly calls: unknown[][] = [];
  save(): void { this.calls.push(["save"]); }
  restore(): void { this.calls.push(["restore"]); }
  beginPath(): void { this.calls.push(["beginPath"]); }
  rect(...values: [number, number, number, number]): void { this.calls.push(["rect", ...values]); }
  clip(): void { this.calls.push(["clip"]); }
  clearRect(...values: [number, number, number, number]): void { this.calls.push(["clearRect", ...values]); }
  fillRect(...values: [number, number, number, number]): void { this.calls.push(["fillRect", ...values, this.fillStyle]); }
  moveTo(x: number, y: number): void { this.calls.push(["moveTo", x, y]); }
  lineTo(x: number, y: number): void { this.calls.push(["lineTo", x, y]); }
  stroke(): void { this.calls.push(["stroke", this.strokeStyle, this.lineWidth]); }
  arc(...values: [number, number, number, number, number]): void { this.calls.push(["arc", ...values]); }
  fill(): void { this.calls.push(["fill", this.fillStyle]); }
  fillText(text: string, x: number, y: number): void { this.calls.push(["fillText", text, x, y]); }
  setLineDash(segments: readonly number[]): void { this.calls.push(["setLineDash", ...segments]); }
}

const flatSignal = { signal: () => 0.1 };

function fakeController(): AbortControllerLike {
  return { signal: {}, abort: () => undefined };
}

describe("Pulse EKG geometrisi", () => {
  it("kaynak ana canvas golden değerlerini geniş ve dar görünümde korur", () => {
    const wide = mainEcgGeometry(900, 300, 10);
    expect(wide.columns).toHaveLength(3);
    expect(wide.columns[0]).toEqual({ index: 0, offset: 0, width: 296, cursor: 288 });
    expect(wide.windowSeconds).toBeCloseTo(2.24, 12);
    expect(wide.pixelsPerSecond).toBeCloseTo(126.78571428571429, 12);
    expect(wide.smallSquare).toBeCloseTo(5.071428571428572, 12);
    expect(wide.pixelsPerMv).toBeCloseTo(50.71428571428572, 12);
    expect([wide.baseline, wide.leftTime]).toEqual([180, 7.76]);

    const narrow = mainEcgGeometry(600, 240, 5);
    expect(narrow.columns[2]).toEqual({ index: 2, offset: 404, width: 196, cursor: 592 });
    expect(narrow.windowSeconds).toBeCloseTo(1.76, 12);
    expect(narrow.pixelsPerSecond).toBeCloseTo(104.54545454545453, 12);
    expect(narrow.leftTime).toBeCloseTo(3.24, 12);
  });

  it("madde golden'ında 25 mm/sn ve 10 mm/mV oranlarını yakınlaştırmayla korur", () => {
    const geometry = itemEcgGeometry(900, 300, 2, 4, 1.25);
    expect(geometry.columns[0]?.width).toBeCloseTo(294.6666666666667, 12);
    expect(geometry.pixelsPerSecond).toBeCloseTo(82.08333333333334, 12);
    expect(geometry.smallSquare).toBeCloseTo(3.2833333333333337, 12);
    expect(geometry.pixelsPerMv).toBeCloseTo(32.833333333333336, 12);
    expect(geometry.baseline).toBe(186);
    expect(geometry.smallSquare / geometry.pixelsPerSecond).toBeCloseTo(0.04, 12);
    expect(geometry.pixelsPerMv / geometry.smallSquare).toBe(10);
  });
});

describe("Pulse EKG çizimi", () => {
  it("üç sütunu, aktif zemini, normal overlay'i ve imleçleri sahte bağlama çizer", () => {
    const context = new FakeContext();
    drawEcg({
      context,
      width: 600,
      height: 240,
      time: 5,
      leads: ["II", "aVF", "V1"],
      activeColumn: 1,
      source: flatSignal,
      normalSource: { signal: () => 0 },
      compare: true,
    });
    expect(context.calls[0]).toEqual(["clearRect", 0, 0, 600, 240]);
    expect(context.calls.filter(([name]) => name === "arc")).toHaveLength(3);
    expect(context.calls.filter(([name]) => name === "fillText").map(([, text]) => text)).toEqual(["II", "aVF", "V1"]);
    expect(context.calls).toContainEqual(["setLineDash", 6, 4]);
    expect(context.calls).toContainEqual(["fillRect", 202, 0, 196, 240, "#fff7f8"]);
    expect(context.calls.filter((call) => call[0] === "stroke" && call[1] === "rgba(46,141,247,.85)")).toHaveLength(3);
  });

  it("madde EKG'sinde üç izi, zaman uçlarını, 1 mV etiketini ve overlay'i çizer", () => {
    const context = new FakeContext();
    drawItemEcg({
      context,
      width: 480,
      height: 180,
      start: 2,
      seconds: 4,
      zoom: 1.5,
      leads: ["I", "aVL", "V6"],
      source: flatSignal,
      normalSource: { signal: () => 0 },
      compare: true,
    });
    const labels = context.calls.filter(([name]) => name === "fillText").map(([, text]) => text);
    expect(labels).toEqual([
      "I", "2.0s", "6.0s", "1mV",
      "aVL", "2.0s", "6.0s", "1mV",
      "V6", "2.0s", "6.0s", "1mV",
    ]);
    expect(context.calls.filter((call) => call[0] === "stroke" && call[1] === "rgba(46,141,247,.85)")).toHaveLength(3);
  });

  it("zoom basamaklarını sınırlar ve Türkçe etiketi üretir", () => {
    expect(ITEM_ECG_ZOOM_STEPS).toEqual([1, 1.25, 1.5, 2]);
    expect(itemEcgZoom(1, "out")).toBe(1);
    expect(itemEcgZoom(1, "in")).toBe(1.25);
    expect(itemEcgZoom(2, "in")).toBe(2);
    expect(itemEcgZoomLabel(1.25)).toBe("1,25×");
  });

  it("madde gözlemcisini lifecycle dispose'ta yalnız bir kez kapatır", () => {
    const lifecycle = createPulseLifecycle(fakeController());
    let callback: (() => void) | undefined;
    let drawings = 0;
    let disconnects = 0;
    const observer = {
      observe(_target: unknown, onResize: () => void) { callback = onResize; },
      disconnect() { disconnects += 1; },
    };
    observeItemEcg(lifecycle, observer, { canvas: true }, () => { drawings += 1; });
    expect(drawings).toBe(1);
    callback?.();
    expect(drawings).toBe(2);
    lifecycle.dispose();
    lifecycle.dispose();
    expect(disconnects).toBe(1);
  });
});

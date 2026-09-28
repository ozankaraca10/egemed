import { describe, expect, it } from "vitest";
import {
  TUBE_ANCHOR_RATIO,
  TUBE_CHESTPIECE_RADIUS,
  tubeAnchor,
  tubePath,
  tubeTip,
} from "../../packages/sim-ausculta/src/index";

/** T228 — stetoskop ses iletim tüpü saf geometrisi. */

interface Point {
  x: number;
  y: number;
}

interface ParsedTube {
  start: Point;
  c1: Point;
  c2: Point;
  end: Point;
}

function parseTube(d: string): ParsedTube {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers, `yol verisi sayı çiftleri taşımalı: ${d}`).toHaveLength(8);
  const [sx = 0, sy = 0, c1x = 0, c1y = 0, c2x = 0, c2y = 0, ex = 0, ey = 0] = numbers;
  return { start: { x: sx, y: sy }, c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, end: { x: ex, y: ey } };
}

describe("stetoskop tüpü geometrisi (T228)", () => {
  const size = { w: 400, h: 300 };

  it("bağlantı sabit oranda, uçlar path uçlarıyla birebir", () => {
    const anchor = tubeAnchor(size);
    expect(anchor.x).toBeCloseTo(size.w * TUBE_ANCHOR_RATIO.x, 5);
    expect(anchor.y).toBeCloseTo(size.h * TUBE_ANCHOR_RATIO.y, 5);

    const tip = tubeTip({ x: 200, y: 230 }, anchor);
    const parsed = parseTube(tubePath(anchor, tip, size));
    expect(parsed.start.x).toBeCloseTo(anchor.x, 1);
    expect(parsed.start.y).toBeCloseTo(anchor.y, 1);
    expect(parsed.end.x).toBeCloseTo(tip.x, 1);
    expect(parsed.end.y).toBeCloseTo(tip.y, 1);
  });

  it("uç göğüs parçası kenarına yarıçap kadar uzaklıkta oturur", () => {
    const anchor = tubeAnchor(size);
    const center = { x: 240, y: 220 };
    const tip = tubeTip(center, anchor);
    expect(Math.hypot(tip.x - center.x, tip.y - center.y)).toBeCloseTo(TUBE_CHESTPIECE_RADIUS, 5);
  });

  it("kontrol noktaları mesafeyle orantılı aşağı sarkar", () => {
    const anchor = tubeAnchor(size);
    const tip = tubeTip({ x: 220, y: 230 }, anchor);
    const parsed = parseTube(tubePath(anchor, tip, size));
    expect(parsed.c1.y).toBeGreaterThan(anchor.y);
    expect(parsed.c2.y).toBeGreaterThan(tip.y);
    // Yol sahnenin altına taşmaz; sarkma tavanı sahne yüksekliğiyle sınırlıdır.
    expect(parsed.c1.y).toBeLessThanOrEqual(size.h);
    expect(parsed.c2.y).toBeLessThanOrEqual(size.h);
  });

  it("yakın uçlar NaN üretmez ve uç bağlantıya çekilir", () => {
    const anchor = tubeAnchor(size);
    const center = { x: anchor.x + 6, y: anchor.y + 8 };
    const tip = tubeTip(center, anchor);
    expect(tip.x).toBeCloseTo(anchor.x, 5);
    expect(tip.y).toBeCloseTo(anchor.y, 5);

    const parsed = parseTube(tubePath(anchor, tip, size));
    for (const point of [parsed.start, parsed.c1, parsed.c2, parsed.end]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(tubePath(center, center, size)).not.toMatch(/NaN/);
  });

  it("sıfır boyutlu sahnede de sonlu yol üretir", () => {
    const zero = { w: 0, h: 0 };
    const d = tubePath({ x: 0, y: 0 }, { x: 0, y: 0 }, zero);
    expect(d).not.toMatch(/NaN/);
    expect(tubeAnchor(zero)).toEqual({ x: 0, y: 0 });
  });
});

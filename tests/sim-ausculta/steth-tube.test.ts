import { describe, expect, it } from "vitest";
import {
  HEADSET_TO_CHESTPIECE,
  tubeHeadsetHeight,
  TUBE_CHESTPIECE_RADIUS,
  tubeAnchor,
  tubePath,
  tubeTip,
  TUBE_ATTACH_DIR,
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
    // T232: bağlantı kulaklığın hemen altında; kulaklık gerçek oranlı, sahneye sığar.
    expect(anchor.y).toBeCloseTo(tubeHeadsetHeight(size) + 10, 5);
    expect(tubeHeadsetHeight({ w: 900, h: 900 })).toBeCloseTo(HEADSET_TO_CHESTPIECE * 2 * TUBE_CHESTPIECE_RADIUS, 5);
    expect(tubeHeadsetHeight(size)).toBeLessThanOrEqual(size.h * 0.42);

    const tip = tubeTip({ x: 200, y: 230 });
    const parsed = parseTube(tubePath(anchor, tip, size));
    expect(parsed.start.x).toBeCloseTo(anchor.x, 1);
    expect(parsed.start.y).toBeCloseTo(anchor.y, 1);
    expect(parsed.end.x).toBeCloseTo(tip.x, 1);
    expect(parsed.end.y).toBeCloseTo(tip.y, 1);
  });

  it("uç göğüs parçası kenarına yarıçap kadar uzaklıkta oturur", () => {
    const anchor = tubeAnchor(size);
    const center = { x: 240, y: 220 };
    const tip = tubeTip(center);
    expect(Math.hypot(tip.x - center.x, tip.y - center.y)).toBeCloseTo(TUBE_CHESTPIECE_RADIUS, 5);
    // T231: bağlantı daima sol alt 45° (−x, +y) — anchor nerede olursa olsun.
    expect(tip.x).toBeLessThan(center.x);
    expect(tip.y).toBeGreaterThan(center.y);
    expect(center.x - tip.x).toBeCloseTo(tip.y - center.y, 5);
    void anchor;
  });

  it("bağlantıdan dikey sarkar, uca 45° doğrultusunda girer", () => {
    const anchor = tubeAnchor(size);
    const tip = tubeTip({ x: 220, y: 230 });
    const parsed = parseTube(tubePath(anchor, tip, size));
    expect(parsed.c1.x).toBeCloseTo(anchor.x, 1);
    expect(parsed.c1.y).toBeGreaterThan(anchor.y);
    // c2, uçtan sol alt 45° doğrultusunda
    expect(parsed.c2.x).toBeLessThan(tip.x);
    expect(parsed.c2.y).toBeGreaterThan(tip.y);
    expect(tip.x - parsed.c2.x).toBeCloseTo(parsed.c2.y - tip.y, 0);
    expect(TUBE_ATTACH_DIR).toEqual({ x: -Math.SQRT1_2, y: Math.SQRT1_2 });
    expect(parsed.c1.y).toBeLessThanOrEqual(size.h);
    expect(parsed.c2.y).toBeLessThanOrEqual(size.h);
  });

  it("T307: geniş sahnede tüp, uçlar arası düz mesafenin ~2 katından kısa değildir", () => {
    const stage = { w: 1000, h: 940 };
    const anchor = tubeAnchor(stage);
    const tip = tubeTip({ x: 520, y: 420 });
    const { start, c1, c2, end } = parseTube(tubePath(anchor, tip, stage));
    let length = 0;
    let prev = start;
    for (let i = 1; i <= 64; i += 1) {
      const t = i / 64;
      const u = 1 - t;
      const point = {
        x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
        y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
      };
      length += Math.hypot(point.x - prev.x, point.y - prev.y);
      prev = point;
    }
    expect(length).toBeGreaterThan(1.9 * Math.hypot(tip.x - anchor.x, tip.y - anchor.y));
    expect(c1.y).toBeLessThanOrEqual(stage.h);
  });

  it("yakın uçlar NaN üretmez", () => {
    const anchor = tubeAnchor(size);
    const center = { x: anchor.x + 6, y: anchor.y + 8 };
    const tip = tubeTip(center);

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
    const zeroAnchor = tubeAnchor(zero);
    expect(Number.isFinite(zeroAnchor.x) && Number.isFinite(zeroAnchor.y)).toBe(true);
    expect(tubeHeadsetHeight(zero)).toBe(0);
  });
});

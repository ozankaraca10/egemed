import { describe, expect, it } from "vitest";
import { labelEvery, niceMax } from "../../packages/gamification-core/src/chart";

describe("ilerleme grafiği verisi", () => {

  it("XP ekseni yuvarlak üst sınır; etiket aralığı genişliğe göre", () => {
    expect([80, 120, 920, 1500, 6200].map((n) => niceMax(n))).toEqual([100, 200, 1000, 2000, 10000]);
    expect(labelEvery(12, 680)).toBe(2);
    expect(labelEvery(12, 250)).toBe(4);
    expect(labelEvery(60, 680)).toBe(6);
    expect(labelEvery(1, 300)).toBe(1);
  });
});

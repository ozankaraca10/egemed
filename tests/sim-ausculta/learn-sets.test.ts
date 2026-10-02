import { describe, expect, it } from "vitest";
import { LIBRARY_ITEM_KEYS } from "../../packages/sim-ausculta/src/index";
import { clipRecord, learnExamples, waveForSound } from "../../packages/sim-ausculta/src/data/learnSets";
import pointsData from "../../packages/sim-ausculta/src/data/auscultation-points.json" with { type: "json" };

/** T307 — öğrenme örnek seti kuralı (depo sahibi, 2 Eki 2026): 1. örnek çok noktalı
 *  sentetik; 2–4. örnekler gerçek hastalar, bulgunun duyulduğu nokta sayısı çoktan aza. */

const POINT_IDS = new Set((pointsData as unknown as { points: { id: string }[] }).points.map((point) => point.id));

describe("öğrenme örnek seti", () => {
  it("her konuda ilk örnek sentetik, en çok 3 gerçek hasta, gerçekler nokta sayısına göre azalan", () => {
    for (const key of LIBRARY_ITEM_KEYS) {
      const [first, ...rest] = learnExamples(key);
      expect(first?.kind === "library" || first?.kind === "model", key).toBe(true);
      expect(rest.every((example) => example.kind === "real"), key).toBe(true);
      expect(rest.length, key).toBeLessThanOrEqual(3);
      const counts = rest.map((example) => (example.kind === "library" ? 0 : Object.keys(example.points).length));
      expect(counts, key).toEqual([...counts].sort((a, b) => b - a));
    }
  });

  it("model sentetiği çok noktalıdır; her nokta gerçek bir dinleme noktasına ve çalınabilir klibe bağlanır", () => {
    for (const key of LIBRARY_ITEM_KEYS) {
      for (const example of learnExamples(key)) {
        if (example.kind === "library") continue;
        if (example.kind === "model") expect(Object.keys(example.points).length, key).toBeGreaterThan(1);
        for (const [pointId, clipId] of Object.entries(example.points)) {
          expect(POINT_IDS.has(pointId), `${key}/${pointId}`).toBe(true);
          const record = clipRecord(clipId, "lung", "x", pointId);
          expect(record?.runtimeUrl, `${key}/${clipId}`).toMatch(/^\/?assets\/audio\/runtime\/learn\/[\w.-]+\.(wav|mp3|ogg|m4a)$/);
          const wave = record ? waveForSound(record) : null;
          expect(wave?.env.length ?? 0, `${key}/${clipId}`).toBeGreaterThan(0);
          expect(wave?.durationSec ?? 0, `${key}/${clipId}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

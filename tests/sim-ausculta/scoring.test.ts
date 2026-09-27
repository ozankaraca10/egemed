import { describe, expect, it } from "vitest";
import { MASTERY_THRESHOLD, aggregateResults, practiceAdjusted, scoreCase } from "../../packages/sim-ausculta/src/index";
import { CORE_CASES, poolFor } from "./bank-cases";
import type { Telemetry } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:236-315 (8 test → 8 test). Tam havuz: cases.json + poolFor('assessment'). */

describe("skor hesaplama", () => {
  const c = CORE_CASES.find((x) => x.id === "case_normal_heart");
  if (!c) throw new Error("case_normal_heart yok");
  const baseTelemetry: Telemetry = {
    visits: {
      cardiac_aortic: { dwellMs: 4000, listenMs: 4000, visits: 1, firstOrder: 0 },
      cardiac_pulmonary: { dwellMs: 4000, listenMs: 3500, visits: 1, firstOrder: 1 },
      cardiac_tricuspid: { dwellMs: 4000, listenMs: 3000, visits: 1, firstOrder: 2 },
      cardiac_mitral: { dwellMs: 5000, listenMs: 4000, visits: 1, firstOrder: 3 },
    },
    order: ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"],
    headChanges: 1,
    headUse: { bell: 0, diaphragm: 1 },
    replayCount: 0,
  };
  const allCorrect = Object.fromEntries(c.questions.map((q) => [q.id, q.correct]));

  it("tam doğru + eksiksiz teknik → 100", () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0);
    expect(r.total).toBe(100);
    expect(r.mastery).toBe(true);
  });

  it("yanlış tanıma → ses tanımlama 0, toplam < 80", () => {
    const r = scoreCase(c, { ...allCorrect, q1: ["b"] }, baseTelemetry, 0);
    expect(r.domains.recognition.earned).toBe(0);
    expect(r.total).toBeLessThan(80);
    expect(r.mastery).toBe(false);
  });

  it("teknik eşiğini tutmayan nokta teknik puanı düşürür", () => {
    const t: Telemetry = {
      ...baseTelemetry,
      visits: { ...baseTelemetry.visits, cardiac_mitral: { dwellMs: 100, listenMs: 100, visits: 1, firstOrder: 3 } },
    };
    const r = scoreCase(c, allCorrect, t, 0);
    expect(r.domains.technique.earned).toBeLessThan(20);
  });

  it("yanlış sıra → sistematik puan yarım (çifte ceza yok)", () => {
    const t: Telemetry = { ...baseTelemetry, order: [...baseTelemetry.order].reverse() };
    const r = scoreCase(c, allCorrect, t, 0);
    expect(r.domains.systematic.earned).toBe(2.5);
  });

  it("ipucu cezası deterministiktir (Uygulama modu)", () => {
    expect(practiceAdjusted(90, 0)).toBe(90);
    expect(practiceAdjusted(90, 2)).toBe(80);
    expect(practiceAdjusted(8, 2)).toBe(0);
  });

  it("hakimiyet eşiği 80 (§24)", () => {
    expect(MASTERY_THRESHOLD).toBe(80);
  });

  it("çoklu vaka toplamı alan bazlı birleşir", () => {
    const r = scoreCase(c, allCorrect, baseTelemetry, 0);
    const agg = aggregateResults([r, r]);
    expect(agg.total).toBe(100);
    expect(agg.domains.technique.max).toBe(40);
  });

  it("ulaşılamayan ağırlık yok (K2): değerlendirme havuzundaki her vakada kusursuz performans 100 puan verir", () => {
    for (const cc of poolFor("assessment")) {
      const answers = Object.fromEntries(cc.questions.map((q) => [q.id, q.correct]));
      const telemetry: Telemetry = {
        visits: Object.fromEntries(
          cc.technique.requiredPoints.map((p, i) => [p, { dwellMs: 99999, listenMs: 99999, visits: 1, firstOrder: i }]),
        ),
        order: [...cc.technique.requiredPoints],
        headChanges: 0,
        headUse: { bell: 0, diaphragm: 0 },
        replayCount: 0,
      };
      const r = scoreCase(cc, answers, telemetry, 0);
      expect(r.total, `${cc.id} kusursuz performansta 100 vermeli`).toBe(100);
      expect(r.mastery, cc.id).toBe(true);
    }
  });
});

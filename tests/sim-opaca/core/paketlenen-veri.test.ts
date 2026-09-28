import { describe, expect, it } from "vitest";
import {
  EXPERT_SOURCES,
  FINDINGS,
  IMAGES,
  LIBRARY_ITEMS,
  ZONES,
  ZONE_IDS,
  getImage,
  validateCase,
} from "../../../packages/sim-opaca/src/index";
import { ALL_CASES, poolFor } from "../bank-cases";

/** Paketlenen veri grubu — kaynak egemed-opaca tests/core.test.ts `describe('paketlenen veri')` portu.
 *  A2.3 (ADR-009): istemci vaka havuzu taşımaz; anahtarlı vakalar bankanın veri yolundan
 *  (test-yalnız `bank-cases.ts`) okunur, saf doğrulayıcılar istemciden gelir. */

const findingIds = new Set(Object.keys(FINDINGS));

describe("paketlenen veri (kaynak davranışı)", () => {
  it("tüm vakalar hatasız", () => {
    const issues = ALL_CASES.flatMap((c) => validateCase(c, ZONE_IDS, getImage, findingIds)).filter((i) => i.severity === "error");
    expect(issues).toEqual([]);
  });

  it("değerlendirme havuzu yalnız uzman kaynaklı yetişkin filmlerinden oluşur", () => {
    for (const c of poolFor("assessment")) {
      const i = getImage(c.imageId)!;
      expect((EXPERT_SOURCES as readonly string[]).includes(i.findings[c.primaryFinding]!)).toBe(true);
      expect(i.population).toBe("yetiskin");
    }
  });

  it("öğretilen her bulgunun kütüphane kalemi ve geçerli bölgeleri var", () => {
    for (const [f, def] of Object.entries(FINDINGS)) if (def.teaching) expect(LIBRARY_ITEMS.some((it) => it.finding === f)).toBe(true);
    for (const it of LIBRARY_ITEMS) for (const z of it.bestZones) expect(ZONE_IDS).toContain(z);
  });

  it("kütüphane yorum şablonları tutarlı (V2: her biri en az 3 varyant içeren bir dizidir)", () => {
    for (const it of LIBRARY_ITEMS) {
      for (const template of [...(it.interpretation ?? []), ...(it.nextStepQuestion ?? [])]) {
        const ids = template.options.map((o) => o.id);
        expect(template.correct.every((c) => ids.includes(c))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
      }
      if (it.interpretation) expect(it.interpretation.length).toBeGreaterThanOrEqual(3);
      if (it.nextStepQuestion) expect(it.nextStepQuestion.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("V2: aynı şablon içindeki varyantların prompt metinleri birbirinden farklı (kopya değil)", () => {
    for (const it of LIBRARY_ITEMS) {
      for (const variants of [it.interpretation, it.nextStepQuestion]) {
        if (!variants) continue;
        const prompts = variants.map((v) => v.prompt);
        expect(new Set(prompts).size).toBe(prompts.length);
      }
    }
  });

  it("bölge dikdörtgenleri 0–1 aralığında ve her ABCDE adımı temsil ediliyor", () => {
    for (const z of ZONES) for (const r of z.rects) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1).toBe(true);
    expect(new Set(ZONES.map((z) => z.step))).toEqual(new Set(["A", "B", "C", "D", "E"]));
  });

  it("görüntü kayıtlarında NLP kaynaklı kutu yok", () => {
    for (const r of IMAGES) for (const a of r.annotations) expect(a.source).not.toBe("report_nlp");
  });
});

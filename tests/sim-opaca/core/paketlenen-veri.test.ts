import { describe, expect, it } from "vitest";
import {
  EXPERT_SOURCES,
  FINDINGS,
  IMAGES,
  LIBRARY_ITEMS,
  ZONES,
  ZONE_IDS,
  getImage,
  zonesForImage,
  validateCase,
} from "../../../packages/sim-opaca/src/index";
import imageZonesJson from "../../../packages/sim-opaca/src/data/image-zones.json";
import type { ImageZonesData } from "../../../packages/sim-opaca/src/data/imageZoneModel";
import { ALL_CASES, poolFor } from "../bank-cases";

/** Paketlenen veri grubu — kaynak egemed-opaca tests/core.test.ts `describe('paketlenen veri')` portu.
 *  A2.3 (ADR-009): istemci vaka havuzu taşımaz; anahtarlı vakalar bankanın veri yolundan
 *  (test-yalnız `bank-cases.ts`) okunur, saf doğrulayıcılar istemciden gelir. */

const findingIds = new Set(Object.keys(FINDINGS));
const imageZones = imageZonesJson as ImageZonesData;

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

  it("her görüntü tam olarak bölgeli veya bölgesiz listede", () => {
    expect(Object.keys(imageZones.images)).toHaveLength(575);
    expect(Object.keys(imageZones.noZones)).toHaveLength(22);
    for (const image of IMAGES) {
      const memberships = Number(imageZones.images[image.id] !== undefined) + Number(imageZones.noZones[image.id] !== undefined);
      expect(memberships, image.id).toBe(1);
    }
    expect(new Set([...Object.keys(imageZones.images), ...Object.keys(imageZones.noZones)]).size).toBe(IMAGES.length);
  });

  it("tüm görüntü bölgeleri kendi setinde tanımlı ve 0–1 aralığında", () => {
    for (const [imageId, image] of Object.entries(imageZones.images)) {
      const definitions = imageZones.zoneDefs[image.set];
      for (const [zoneId, rects] of Object.entries(image.zones)) {
        expect(definitions[zoneId], `${imageId}/${zoneId}`).toBeDefined();
        for (const rect of rects) {
          expect(rect.x, `${imageId}/${zoneId}/x`).toBeGreaterThanOrEqual(0);
          expect(rect.y, `${imageId}/${zoneId}/y`).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.w, `${imageId}/${zoneId}/x+w`).toBeLessThanOrEqual(1);
          expect(rect.y + rect.h, `${imageId}/${zoneId}/y+h`).toBeLessThanOrEqual(1);
        }
      }
      const resolved = zonesForImage(imageId);
      expect(resolved).not.toBeNull();
      expect(resolved?.every((zone) => definitions[zone.id] !== undefined)).toBe(true);
    }
    expect(new Set(ZONES.map((z) => z.step))).toEqual(new Set(["A", "B", "C", "D", "E"]));
  });

  it("zonesForImage frontal, lateral ve bölgesiz görüntüyü ayırır", () => {
    const frontal = zonesForImage("commons_coin_ap");
    const lateral = zonesForImage("commons_normal_lat");
    expect(frontal?.some((zone) => zone.id === "b_r_upper")).toBe(true);
    expect(frontal?.some((zone) => zone.id === "b_retrosternal")).toBe(false);
    expect(lateral?.some((zone) => zone.id === "b_retrosternal" && zone.label === "Retrosternal")).toBe(true);
    expect(lateral?.some((zone) => zone.id === "b_r_upper")).toBe(false);
    expect(zonesForImage("commons_clavicle_fx")).toBeNull();
  });

  it("görüntü kayıtlarında NLP kaynaklı kutu yok", () => {
    for (const r of IMAGES) for (const a of r.annotations) expect(a.source).not.toBe("report_nlp");
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_LOCALIZATION_BOX_AREA,
  boxArea,
  decodeMark,
  encodeMark,
  inBox,
  markHitsBox,
  markHitsFinding,
  markRadiusNorm,
  markToScorm,
  nearestFindingBoxCenter,
  ratio,
  zonesAt,
} from "../../../packages/sim-opaca/src/index";
import type { ImageRecord, ReadingZone } from "../../../packages/sim-opaca/src/index";

/** Geometri grubu — kaynak egemed-opaca tests/core.test.ts `describe('geometri')` portu (8 test).
 *  Bölge fixture'ı küçük sentetiktir; a_trachea ve e_bones dikdörtgenleri kaynak
 *  reading-zones.json değerleriyle aynıdır (yalnız bu iki bölge taşınır). */

const img = (over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: "img_t",
  sourceDataset: "nih-cxr14",
  sourceFile: "t.png",
  viewPosition: "PA",
  ageYears: 50,
  sex: "F",
  population: "yetiskin",
  width: 1000,
  height: 1000,
  originalWidth: 1000,
  originalHeight: 1000,
  findings: { pneumothorax: "expert_bbox" },
  negatives: { fracture: "expert_panel" },
  annotations: [{ finding: "pneumothorax", source: "expert_bbox", x: 0.6, y: 0.1, w: 0.2, h: 0.3 }],
  quality: null,
  runtimeUrl: "assets/xray/runtime/img_t.webp",
  bytes: 1,
  validationStatus: "validated",
  clinicalReview: "beklemede",
  issues: [],
  ...over,
});

const ZONES: ReadingZone[] = [
  {
    id: "a_trachea",
    step: "A",
    label: "Trakea",
    fullLabel: "A — Trakea",
    detail: "",
    rects: [{ x: 0.42, y: 0.02, w: 0.16, h: 0.3 }],
  },
  {
    id: "e_bones",
    step: "E",
    label: "Kemik ve yumuşak doku",
    fullLabel: "E — Kemik ve yumuşak doku",
    detail: "",
    rects: [
      { x: 0, y: 0.02, w: 0.3, h: 0.12 },
      { x: 0.7, y: 0.02, w: 0.3, h: 0.12 },
      { x: 0, y: 0.14, w: 0.08, h: 0.64 },
      { x: 0.92, y: 0.14, w: 0.08, h: 0.64 },
    ],
  },
];

describe("geometri (kaynak davranışı)", () => {
  it("işaret kodlaması gidiş-dönüş", () => {
    const v = encodeMark({ x: 0.12345, y: 0.9 });
    expect(v).toBe("pt:0.1235,0.9000");
    expect(decodeMark(v)).toEqual({ x: 0.1235, y: 0.9 });
    expect(decodeMark("pt:1.2,0.5")).toBeNull();
    expect(decodeMark("a")).toBeNull();
    expect(decodeMark(undefined)).toBeNull();
    expect(markToScorm(v)).toBe("x12y90");
  });

  it("kutu içi ve tolerans", () => {
    const b = { x: 0.2, y: 0.2, w: 0.1, h: 0.1 };
    expect(inBox({ x: 0.25, y: 0.25 }, b)).toBe(true);
    expect(inBox({ x: 0.315, y: 0.25 }, b)).toBe(false);
    expect(inBox({ x: 0.315, y: 0.25 }, b, 0.02)).toBe(true);
  });

  it("işaret yalnız uzman kutusunda isabet sayılır", () => {
    const i = img();
    expect(markHitsFinding({ x: 0.7, y: 0.2 }, i, "pneumothorax")).toBe(true);
    expect(markHitsFinding({ x: 0.2, y: 0.2 }, i, "pneumothorax")).toBe(false);
    expect(markHitsFinding({ x: 0.7, y: 0.2 }, i, "nodule_mass")).toBe(false);
    const nlp = img({ annotations: [{ finding: "pneumothorax", source: "report_nlp", x: 0, y: 0, w: 1, h: 1 }] });
    expect(markHitsFinding({ x: 0.5, y: 0.5 }, nlp, "pneumothorax")).toBe(false);
    expect(markHitsFinding({ x: 0.5, y: 0.5 }, undefined, "pneumothorax")).toBe(false);
  });

  it("V3 isabet ölçütü: merkez kutu içinde VE kutu merkezine uzaklık yarı köşegenin %60ını aşmamalı", () => {
    // kutu: x .2 y .2 w .4 h .2 → merkez (.4,.3), yarı köşegen = hypot(.4,.2)/2 ≈ .2236, %60 ≈ .1342
    const b = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
    expect(markHitsBox({ x: 0.4, y: 0.3 }, b)).toBe(true); // tam merkez
    expect(markHitsBox({ x: 0.21, y: 0.21 }, b)).toBe(false); // kutu içinde ama köşeye çok yakın (kenardan teğet)
    expect(markHitsBox({ x: 0.19, y: 0.3 }, b)).toBe(false); // eski %2 kenar toleransı KALDIRILDI — kutu dışı artık asla isabet değil
    expect(markHitsBox({ x: 0.6, y: 0.2 }, b)).toBe(false); // kutu köşesi: içeride sayılsa da merkeze çok uzak
  });

  it("kutu alanı ve maksimum lokalizasyon eşiği", () => {
    expect(boxArea({ x: 0, y: 0, w: 0.5, h: 0.5 })).toBeCloseTo(0.25);
    expect(boxArea({ x: 0, y: 0, w: 0.7, h: 0.6 })).toBeGreaterThan(MAX_LOCALIZATION_BOX_AREA);
    expect(MAX_LOCALIZATION_BOX_AREA).toBe(0.35);
  });

  it("işaret dairesi yarıçapı: kare olmayan görüntüde eksene göre farklı normalize yarıçap, gerçekte dairesel", () => {
    const { rx, ry } = markRadiusNorm({ width: 2000, height: 1000 });
    // kısa kenar 1000 → R = 80px; rx = 80/2000 = .04, ry = 80/1000 = .08 → piksel olarak rx*2000 === ry*1000
    expect(rx).toBeCloseTo(0.04);
    expect(ry).toBeCloseTo(0.08);
    expect(rx * 2000).toBeCloseTo(ry * 1000);
  });

  it("en yakın kutu merkezi (yanlış işaret geri bildirimi için)", () => {
    const i = img();
    expect(nearestFindingBoxCenter({ x: 0, y: 0 }, i, "pneumothorax")).toEqual({ x: 0.7, y: 0.25 });
    expect(nearestFindingBoxCenter({ x: 0, y: 0 }, i, "nodule_mass")).toBeNull();
  });

  it("bölge bulma ve oran", () => {
    expect(zonesAt({ x: 0.5, y: 0.05 }, ZONES)).toContain("a_trachea");
    expect(zonesAt({ x: 0.02, y: 0.4 }, ZONES)).toEqual(["e_bones"]);
    expect(ratio(55, 100)).toBe(0.55);
    expect(ratio(1, 0)).toBeNull();
  });
});

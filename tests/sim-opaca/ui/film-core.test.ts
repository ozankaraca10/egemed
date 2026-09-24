import { describe, expect, it } from "vitest";
import {
  MARK_KEY_STEP,
  MAX_SCALE,
  PAN_KEY_STEP,
  WINDOW_PRESETS,
  WHEEL_ZOOM_FACTOR,
  ZOOM_KEY_FACTOR,
  annotatedSlices,
  applyPanKey,
  availablePresets,
  clampSlice,
  constrainView,
  filterFindingAnnotations,
  filterSliceAnnotations,
  goToSlice,
  hasMultiSliceStack,
  imageToClient,
  initialPresetForImage,
  initialSliceIndex,
  mapFilmKey,
  markAnnounceText,
  measureLen,
  moveMarkByKey,
  resetView,
  stackFrames,
  stackWindowForPreset,
  toImage,
  viewCenterImagePoint,
  windowSettingForPreset,
  zoomView,
} from "../../../packages/sim-opaca/src/index";
import type { ImageRecord } from "../../../packages/sim-opaca/src/index";

/** Film çekirdek grubu — E2 §8 S10 kabulü: saf fonksiyonlar, sentetik görüntü kaydı. */

const LAYER: { left: number; top: number; width: number; height: number } = {
  left: 100,
  top: 50,
  width: 400,
  height: 400,
};

const BASE = { w: 400, h: 400 };

function img(over: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: "img_ct",
    sourceDataset: "tcia-lidc",
    sourceFile: "ct.png",
    viewPosition: "CT_AXIAL",
    ageYears: 65,
    sex: "M",
    population: "yetiskin",
    width: 512,
    height: 512,
    originalWidth: 512,
    originalHeight: 512,
    findings: { nodule: "expert_bbox" },
    negatives: {},
    annotations: [
      { finding: "nodule", source: "expert_bbox", x: 0.4, y: 0.4, w: 0.1, h: 0.1, frameIndex: 2 },
      { finding: "nodule", source: "expert_bbox", x: 0.5, y: 0.5, w: 0.08, h: 0.08, frameIndex: 5 },
      { finding: "atelectasis", source: "report_nlp", x: 0.1, y: 0.1, w: 0.2, h: 0.2, frameIndex: 2 },
    ],
    quality: null,
    runtimeUrl: "assets/ct/runtime/img_ct_lung_0.webp",
    bytes: 1,
    validationStatus: "validated",
    clinicalReview: "onayli",
    issues: [],
    modality: "CT",
    stack: [
      {
        window: "lung",
        frames: ["assets/ct/lung/0.webp", "assets/ct/lung/1.webp", "assets/ct/lung/2.webp"],
      },
      {
        window: "mediastinum",
        frames: ["assets/ct/med/0.webp", "assets/ct/med/1.webp", "assets/ct/med/2.webp"],
      },
    ],
    ...over,
  };
}

describe("film-core (S10 saf çekirdek)", () => {
  it("WINDOW_PRESETS dört ön ayar taşır", () => {
    expect(WINDOW_PRESETS.map((p) => p.id)).toEqual(["standard", "lung", "mediastinum", "bone"]);
    expect(WINDOW_PRESETS.find((p) => p.id === "lung")?.w).toEqual({ brightness: 0.9, contrast: 1.35 });
  });

  it("constrainView pan sınırlarını uygular", () => {
    const view = { scale: 4, tx: 9999, ty: -9999 };
    const c = constrainView(view, BASE);
    const lim = (BASE.w * (view.scale - 1)) / 2 + BASE.w * 0.25;
    expect(c.tx).toBe(lim);
    expect(c.ty).toBe(-lim);
    expect(constrainView({ scale: 1, tx: 10, ty: -10 }, BASE)).toEqual({ scale: 1, tx: 10, ty: -10 });
  });

  it("zoomView sınırları ve sıfırlamayı uygular", () => {
    const atMax = zoomView({ scale: MAX_SCALE, tx: 0, ty: 0 }, BASE, 2);
    expect(atMax.changed).toBe(false);
    expect(atMax.view.scale).toBe(MAX_SCALE);

    const zoomed = zoomView({ scale: 2, tx: 50, ty: -30 }, BASE, 1 / 2);
    expect(zoomed.view).toEqual({ scale: 1, tx: 0, ty: 0 });
    expect(zoomed.zoomPct).toBe(100);

    const stage = { left: 0, top: 0, width: 400, height: 400 };
    const withOrigin = zoomView({ scale: 1, tx: 0, ty: 0 }, BASE, ZOOM_KEY_FACTOR, {
      clientX: 300,
      clientY: 200,
      stageRect: stage,
    });
    expect(withOrigin.changed).toBe(true);
    expect(withOrigin.view.scale).toBeCloseTo(ZOOM_KEY_FACTOR);
    expect(withOrigin.zoomPct).toBe(Math.round(ZOOM_KEY_FACTOR * 100));
  });

  it("resetView birim ölçeğe döner", () => {
    expect(resetView()).toEqual({ view: { scale: 1, tx: 0, ty: 0 }, zoomPct: 100 });
  });

  it("toImage ve imageToClient gidiş-dönüş", () => {
    const p = { x: 0.25, y: 0.75 };
    const client = imageToClient(p, LAYER);
    expect(toImage(client.x, client.y, LAYER)).toEqual(p);
    expect(toImage(LAYER.left - 1, LAYER.top, LAYER)).toBeNull();
    expect(toImage(LAYER.left, LAYER.top, null)).toBeNull();
    expect(toImage(LAYER.left, LAYER.top, { ...LAYER, width: 0 })).toBeNull();
  });

  it("mapFilmKey tuş eşlemesi", () => {
    const baseCtx = { inert: false, markEnabled: false, tool: "pan" as const, hasMultiSliceStack: false };
    expect(mapFilmKey("+", baseCtx)).toEqual({ type: "zoom", factor: ZOOM_KEY_FACTOR });
    expect(mapFilmKey("-", baseCtx)).toEqual({ type: "zoom", factor: 1 / ZOOM_KEY_FACTOR });
    expect(mapFilmKey("0", baseCtx)).toEqual({ type: "reset" });
    expect(mapFilmKey("ArrowLeft", baseCtx)).toEqual({ type: "pan", dx: PAN_KEY_STEP, dy: 0 });
    expect(mapFilmKey("ArrowRight", baseCtx)).toEqual({ type: "pan", dx: -PAN_KEY_STEP, dy: 0 });
    expect(mapFilmKey("z", baseCtx)).toBeNull();
    expect(mapFilmKey("+", { ...baseCtx, inert: true })).toBeNull();

    const markCtx = { ...baseCtx, markEnabled: true, tool: "mark" as const };
    expect(mapFilmKey("ArrowLeft", markCtx)).toEqual({ type: "markMove", dx: -MARK_KEY_STEP, dy: 0 });
    expect(mapFilmKey("Enter", markCtx)).toEqual({ type: "markCenter" });
    expect(mapFilmKey("Enter", { ...baseCtx, markEnabled: true, tool: "pan" })).toBeNull();

    const stackCtx = { ...baseCtx, hasMultiSliceStack: true };
    expect(mapFilmKey("ArrowDown", stackCtx)).toEqual({ type: "slice", delta: 1 });
    expect(mapFilmKey("ArrowUp", stackCtx)).toEqual({ type: "slice", delta: -1 });
  });

  it("pan ve işaret klavye yardımcıları", () => {
    const view = { scale: 2, tx: 0, ty: 0 };
    const panned = applyPanKey(view, BASE, PAN_KEY_STEP, -PAN_KEY_STEP);
    expect(panned.tx).toBe(PAN_KEY_STEP);
    expect(panned.ty).toBe(-PAN_KEY_STEP);

    const center = viewCenterImagePoint(view, BASE);
    expect(center).toEqual({ x: 0.5, y: 0.5 });
    const moved = moveMarkByKey({ x: 0.5, y: 0.5 }, view, BASE, MARK_KEY_STEP, 0);
    expect(moved.x).toBeCloseTo(0.5 + MARK_KEY_STEP);
    expect(markAnnounceText({ x: 0.4312, y: 0.5521 })).toBe("İşaret konumu: yatay %43, dikey %55");
  });

  it("measureLen normalize uzunluğu piksele çevirir", () => {
    const m: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
    ];
    expect(measureLen(m, { width: 1000, height: 500 })).toBe(100);
    expect(measureLen(m)).toBe(0.1);
  });

  it("BT yığın ve kesit filtreleme", () => {
    const image = img();
    expect(stackWindowForPreset("mediastinum")).toBe("mediastinum");
    expect(stackWindowForPreset("lung")).toBe("lung");
    expect(stackFrames(image, "lung")[0]).toContain("lung");
    expect(stackFrames(image, "mediastinum")[0]).toContain("med");
    expect(stackFrames(undefined, "lung")).toEqual([]);
    expect(hasMultiSliceStack(stackFrames(image, "lung"))).toBe(true);
    expect(hasMultiSliceStack(["single"])).toBe(false);
    expect(clampSlice(99, 3)).toBe(2);
    expect(goToSlice(5, 3)).toBe(2);
    expect(initialSliceIndex(image)).toBe(2);
    const flatImage = { ...img({ annotations: [] }) };
    delete flatImage.stack;
    expect(initialSliceIndex(flatImage)).toBe(0);
    expect(initialPresetForImage(image)).toBe("lung");
    expect(initialPresetForImage(flatImage)).toBe("standard");

    const finding = filterFindingAnnotations(image.annotations, "nodule");
    expect(finding).toHaveLength(2);
    expect(finding.every((a) => a.source !== "report_nlp")).toBe(true);

    const slice2 = filterSliceAnnotations(finding, true, 2);
    expect(slice2).toHaveLength(1);
    expect(slice2[0]?.frameIndex).toBe(2);
    expect(filterSliceAnnotations(finding, false, 0)).toHaveLength(2);
    expect(annotatedSlices(finding, true)).toEqual([2, 5]);
    expect(annotatedSlices(finding, false)).toEqual([]);
  });

  it("pencere ön ayarı seçenekleri", () => {
    expect(availablePresets(true).map((p) => p.id)).toEqual(["lung", "mediastinum"]);
    expect(availablePresets(false)).toHaveLength(4);
    expect(windowSettingForPreset("bone", false)).toEqual(WINDOW_PRESETS.find((p) => p.id === "bone")!.w);
    expect(windowSettingForPreset("bone", true)).toEqual(WINDOW_PRESETS.find((p) => p.id === "standard")?.w);
    expect(windowSettingForPreset("missing", false)).toBeNull();
  });

  it("tekerlek yakınlaştırma faktörü sabiti", () => {
    expect(WHEEL_ZOOM_FACTOR).toBe(1.15);
  });
});

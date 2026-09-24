/** FilmViewer saf çekirdek — görünüm dönüşümü, koordinat, klavye, ölçüm ve BT kesit mantığı.
 *  Kaynak: egemed-opaca `ui/FilmViewer.tsx` (S10 çıkarımı; React/DOM bağımlılığı yok). */

import { clamp, type Point } from "../core/geometry";
import type { Annotation, ImageRecord } from "../core/types";

export type PointerTool = "pan" | "mark" | "measure";

export interface WindowSetting {
  brightness: number;
  contrast: number;
}

export const WINDOW_PRESETS: { id: string; label: string; w: WindowSetting }[] = [
  { id: "standard", label: "Standart", w: { brightness: 1, contrast: 1 } },
  { id: "lung", label: "Akciğer", w: { brightness: 0.9, contrast: 1.35 } },
  { id: "mediastinum", label: "Mediasten", w: { brightness: 1.25, contrast: 0.85 } },
  { id: "bone", label: "Kemik", w: { brightness: 1.05, contrast: 1.7 } },
];

export const MAX_SCALE = 8;
export const MARK_KEY_STEP = 0.02;
export const PAN_KEY_STEP = 40;
export const ZOOM_KEY_FACTOR = 1.25;
export const WHEEL_ZOOM_FACTOR = 1.15;

export interface FilmView {
  scale: number;
  tx: number;
  ty: number;
}

export interface FilmBaseSize {
  w: number;
  h: number;
}

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ZoomOrigin {
  clientX: number;
  clientY: number;
  stageRect: ClientRect;
}

/** Pan sınırlarını uygular (kaynak `constrain`). */
export function constrainView(view: FilmView, base: FilmBaseSize): FilmView {
  const limX = (base.w * (view.scale - 1)) / 2 + base.w * 0.25;
  const limY = (base.h * (view.scale - 1)) / 2 + base.h * 0.25;
  return {
    ...view,
    tx: clamp(view.tx, -limX, limX),
    ty: clamp(view.ty, -limY, limY),
  };
}

/** Yakınlaştırma; imleç altındaki nokta sabit kalır (kaynak `zoomBy`). */
export function zoomView(
  view: FilmView,
  base: FilmBaseSize,
  factor: number,
  origin?: ZoomOrigin,
): { view: FilmView; zoomPct: number; changed: boolean } {
  const next = clamp(view.scale * factor, 1, MAX_SCALE);
  if (next === view.scale) {
    return { view, zoomPct: Math.round(view.scale * 100), changed: false };
  }
  let { tx, ty, scale } = view;
  if (origin) {
    const { left, top, width, height } = origin.stageRect;
    const ox = origin.clientX - (left + width / 2);
    const oy = origin.clientY - (top + height / 2);
    const k = next / scale;
    tx = ox - (ox - tx) * k;
    ty = oy - (oy - ty) * k;
  }
  scale = next;
  if (next === 1) {
    tx = 0;
    ty = 0;
  }
  const constrained = constrainView({ scale, tx, ty }, base);
  return {
    view: constrained,
    zoomPct: Math.round(constrained.scale * 100),
    changed: true,
  };
}

/** Görünümü sıfırlar (kaynak `reset`). */
export function resetView(): { view: FilmView; zoomPct: number } {
  return { view: { scale: 1, tx: 0, ty: 0 }, zoomPct: 100 };
}

/** İstemci koordinatını görüntü normalize koordinatına çevirir (kaynak `toImage`). */
export function toImage(clientX: number, clientY: number, layerRect: ClientRect | null): Point | null {
  if (!layerRect || !layerRect.width || !layerRect.height) return null;
  const x = (clientX - layerRect.left) / layerRect.width;
  const y = (clientY - layerRect.top) / layerRect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** Normalize görüntü noktasını istemci koordinatına çevirir (`toImage` tersi). */
export function imageToClient(p: Point, layerRect: ClientRect): { x: number; y: number } {
  return {
    x: layerRect.left + p.x * layerRect.width,
    y: layerRect.top + p.y * layerRect.height,
  };
}

/** Görünüm merkezinin normalize görüntü koordinatı. */
export function viewCenterImagePoint(view: FilmView, base: FilmBaseSize): Point {
  const cx = 0.5 - view.tx / (base.w * view.scale);
  const cy = 0.5 - view.ty / (base.h * view.scale);
  return { x: clamp(cx, 0, 1), y: clamp(cy, 0, 1) };
}

export type FilmKeyAction =
  | { type: "zoom"; factor: number }
  | { type: "reset" }
  | { type: "pan"; dx: number; dy: number }
  | { type: "markMove"; dx: number; dy: number }
  | { type: "markCenter" }
  | { type: "slice"; delta: number };

export interface FilmKeyContext {
  inert: boolean;
  markEnabled: boolean;
  tool: PointerTool;
  hasMultiSliceStack: boolean;
}

/** Klavye tuşunu eyleme eşler (kaynak `onKeyDown` dalları). Tanınmayan tuşlar için null. */
export function mapFilmKey(key: string, ctx: FilmKeyContext): FilmKeyAction | null {
  if (ctx.inert) return null;
  const markArrow =
    ctx.markEnabled &&
    ctx.tool === "mark" &&
    (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown");
  if (markArrow) {
    const dx = key === "ArrowLeft" ? -MARK_KEY_STEP : key === "ArrowRight" ? MARK_KEY_STEP : 0;
    const dy = key === "ArrowUp" ? -MARK_KEY_STEP : key === "ArrowDown" ? MARK_KEY_STEP : 0;
    return { type: "markMove", dx, dy };
  }
  if (ctx.hasMultiSliceStack && (key === "ArrowUp" || key === "ArrowDown")) {
    return { type: "slice", delta: key === "ArrowDown" ? 1 : -1 };
  }
  switch (key) {
    case "+":
    case "=":
      return { type: "zoom", factor: ZOOM_KEY_FACTOR };
    case "-":
      return { type: "zoom", factor: 1 / ZOOM_KEY_FACTOR };
    case "0":
      return { type: "reset" };
    case "ArrowLeft":
      return { type: "pan", dx: PAN_KEY_STEP, dy: 0 };
    case "ArrowRight":
      return { type: "pan", dx: -PAN_KEY_STEP, dy: 0 };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: PAN_KEY_STEP };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: -PAN_KEY_STEP };
    case "Enter":
    case " ":
      if (ctx.markEnabled && ctx.tool === "mark") return { type: "markCenter" };
      return null;
    default:
      return null;
  }
}

/** Ok tuşu pan hareketini görünüme uygular. */
export function applyPanKey(view: FilmView, base: FilmBaseSize, dx: number, dy: number): FilmView {
  return constrainView({ ...view, tx: view.tx + dx, ty: view.ty + dy }, base);
}

/** İşaret ok tuşu hareketi (kaynak `onKeyDown` markArrowMove). */
export function moveMarkByKey(
  from: Point | null,
  view: FilmView,
  base: FilmBaseSize,
  dx: number,
  dy: number,
): Point {
  const start = from ?? viewCenterImagePoint(view, base);
  return { x: clamp(start.x + dx, 0, 1), y: clamp(start.y + dy, 0, 1) };
}

/** Ekran okuyucu duyurusu metni (kaynak `setMarkAnnounce`). */
export function markAnnounceText(p: Point): string {
  return `İşaret konumu: yatay %${Math.round(p.x * 100)}, dikey %${Math.round(p.y * 100)}`;
}

/** Ölçüm çizgisi uzunluğu piksel cinsinden (kaynak `measureLen`). */
export function measureLen(m: [Point, Point], image?: Pick<ImageRecord, "width" | "height">): number {
  const w = image?.width ?? 1;
  const h = image?.height ?? 1;
  return Math.hypot((m[1].x - m[0].x) * w, (m[1].y - m[0].y) * h);
}

export function isCtStack(image: ImageRecord | undefined): boolean {
  return !!image?.stack?.length;
}

export function stackWindowForPreset(preset: string): "lung" | "mediastinum" {
  return preset === "mediastinum" ? "mediastinum" : "lung";
}

/** BT yığın kareleri — pencere ön ayarına göre (kaynak `stackFrames`). */
export function stackFrames(image: ImageRecord | undefined, preset: string): string[] {
  const stackWindow = stackWindowForPreset(preset);
  return image?.stack?.find((s) => s.window === stackWindow)?.frames ?? (image ? [image.runtimeUrl] : []);
}

export function hasMultiSliceStack(frames: string[]): boolean {
  return frames.length > 1;
}

export function clampSlice(sliceIndex: number, frameCount: number): number {
  return clamp(sliceIndex, 0, Math.max(0, frameCount - 1));
}

export function goToSlice(next: number, frameCount: number): number {
  return clamp(next, 0, Math.max(0, frameCount - 1));
}

/** Görüntü değişiminde başlangıç kesit indeksi (kaynak `useEffect` [image?.id]). */
export function initialSliceIndex(image: ImageRecord | undefined): number {
  const marked = (image?.stack?.length ? image.annotations : [])
    .map((a) => a.frameIndex)
    .filter((f): f is number => typeof f === "number")
    .sort((a, b) => a - b);
  if (!marked.length) return 0;
  return marked[Math.floor(marked.length / 2)] ?? 0;
}

export function initialPresetForImage(image: ImageRecord | undefined): string {
  return image?.stack?.length ? "lung" : "standard";
}

export function availablePresets(isCtStackImage: boolean): typeof WINDOW_PRESETS {
  return isCtStackImage
    ? WINDOW_PRESETS.filter((x) => x.id === "lung" || x.id === "mediastinum")
    : WINDOW_PRESETS;
}

/** Pencere ön ayarı seçimi — BT yığınında parlaklık/kontrast sabit kalır (kaynak `choosePreset`). */
export function windowSettingForPreset(id: string, isCtStackImage: boolean): WindowSetting | null {
  const p = WINDOW_PRESETS.find((x) => x.id === id);
  if (!p) return null;
  const standard = WINDOW_PRESETS[0];
  return isCtStackImage && standard ? standard.w : p.w;
}

/** Uzman işaretleri — rapor NLP hariç (kaynak `findingAnnotations`). */
export function filterFindingAnnotations(
  annotations: Annotation[],
  annotationFinding?: string | null,
): Annotation[] {
  return annotations.filter(
    (a) => a.source !== "report_nlp" && (!annotationFinding || a.finding === annotationFinding),
  );
}

/** BT yığınında kesite göre işaret filtreleme (kaynak `annotations`). */
export function filterSliceAnnotations(
  findingAnnotations: Annotation[],
  multiSlice: boolean,
  clampedSlice: number,
): Annotation[] {
  return multiSlice
    ? findingAnnotations.filter((a) => a.frameIndex == null || a.frameIndex === clampedSlice)
    : findingAnnotations;
}

/** İşaretli kesit indeksleri (kaynak `annotatedSlices`). */
export function annotatedSlices(findingAnnotations: Annotation[], multiSlice: boolean): number[] {
  if (!multiSlice) return [];
  return [
    ...new Set(findingAnnotations.map((a) => a.frameIndex).filter((f): f is number => f != null)),
  ].sort((x, y) => x - y);
}

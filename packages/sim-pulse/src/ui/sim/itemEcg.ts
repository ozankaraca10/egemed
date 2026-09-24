import type { PulseLifecycle } from "../../host/lifecycle";
import { itemEcgGeometry } from "./ecgGeometry";
import type { EcgGeometry } from "./ecgGeometry";
import { observeEcg } from "./ecg";
import type { EcgCanvasContext, EcgResizeObserver, EcgSignalSource } from "./ecg";

export const ITEM_ECG_ZOOM_STEPS = [1, 1.25, 1.5, 2] as const;
export type ItemEcgZoom = (typeof ITEM_ECG_ZOOM_STEPS)[number];

export function itemEcgZoom(current: number, direction: "in" | "out"): ItemEcgZoom {
  const found = ITEM_ECG_ZOOM_STEPS.indexOf(current as ItemEcgZoom);
  const index = found < 0 ? 0 : found;
  const next = Math.max(0, Math.min(ITEM_ECG_ZOOM_STEPS.length - 1, index + (direction === "in" ? 1 : -1)));
  return ITEM_ECG_ZOOM_STEPS[next] ?? 1;
}

export function itemEcgZoomLabel(zoom: number): string {
  return `${String(zoom).replace(".", ",")}×`;
}

export interface DrawItemEcgOptions {
  readonly context: EcgCanvasContext;
  readonly width: number;
  readonly height: number;
  readonly start: number;
  readonly seconds: number;
  readonly zoom: number;
  readonly leads: readonly string[];
  readonly source: EcgSignalSource;
  readonly normalSource?: EcgSignalSource;
  readonly compare?: boolean;
  readonly normal?: boolean;
}

function trace(
  context: EcgCanvasContext,
  geometry: EcgGeometry,
  column: EcgGeometry["columns"][number],
  lead: string,
  source: EcgSignalSource,
  color: string,
  width: number,
  dash: readonly number[] = [],
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.beginPath();
  for (let x = 0; x < column.width - 8; x += width < 2 ? 0.8 : 0.65) {
    const time = geometry.leftTime + x / geometry.pixelsPerSecond;
    const y = geometry.baseline - source.signal(time, lead) * geometry.pixelsPerMv;
    if (x === 0) context.moveTo(column.offset, y);
    else context.lineTo(column.offset + x, y);
  }
  context.stroke();
  context.restore();
}

/** Vaka ve soru EKG'sini 25 mm/sn–10 mm/mV ızgarasında çizer. */
export function drawItemEcg(options: DrawItemEcgOptions): EcgGeometry {
  const { context } = options;
  const geometry = itemEcgGeometry(options.width, options.height, options.start, options.seconds, options.zoom);
  context.fillStyle = "#fffafb";
  context.fillRect(0, 0, geometry.width, geometry.height);
  if (geometry.pixelsPerSecond <= 0 || geometry.smallSquare <= 0) return geometry;

  for (const column of geometry.columns) {
    const lead = options.leads[column.index] ?? "II";
    context.save();
    context.beginPath();
    context.rect(column.offset, 0, column.width, geometry.height);
    context.clip();
    for (let localX = 0, index = 0; localX < column.width; localX += geometry.smallSquare, index += 1) {
      context.strokeStyle = index % 5 === 0 ? "#e6b9c2" : "#f3d8dd";
      context.lineWidth = 0.6;
      context.beginPath();
      context.moveTo(column.offset + localX, 0);
      context.lineTo(column.offset + localX, geometry.height);
      context.stroke();
    }
    for (let y = geometry.baseline % geometry.smallSquare; y < geometry.height; y += geometry.smallSquare) {
      context.strokeStyle = "#ebc8d0";
      context.beginPath();
      context.moveTo(column.offset, y);
      context.lineTo(column.offset + column.width, y);
      context.stroke();
    }
    if (options.compare && !options.normal && options.normalSource) {
      trace(context, geometry, column, lead, options.normalSource, "rgba(46,141,247,.85)", 1.5, [6, 4]);
    }
    trace(context, geometry, column, lead, options.source, "#a81730", 2);
    context.font = "bold 12px ui-monospace,monospace";
    context.fillStyle = "#67333f";
    context.fillText(lead, column.offset + 6, 16);
    context.fillText(`${options.start.toFixed(1)}s`, column.offset + 6, geometry.height - 6);
    context.fillText(`${(options.start + options.seconds).toFixed(1)}s`, column.offset + column.width - 40, geometry.height - 6);
    context.fillText("1mV", column.offset + 5, geometry.baseline - geometry.pixelsPerMv);
    context.restore();
  }
  return geometry;
}

export function observeItemEcg(
  lifecycle: Pick<PulseLifecycle, "observe">,
  observer: EcgResizeObserver,
  target: unknown,
  redraw: () => void,
): void {
  observeEcg(lifecycle, observer, target, redraw);
}

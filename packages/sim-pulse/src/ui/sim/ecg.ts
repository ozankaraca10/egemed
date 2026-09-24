import type { PulseLifecycle, Disconnectable } from "../../host/lifecycle";
import { ECG_SMALL_SQUARE_SECONDS, mainEcgGeometry } from "./ecgGeometry";
import type { EcgColumnGeometry, EcgGeometry } from "./ecgGeometry";

export interface EcgCanvasContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  font: string;
  textAlign: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: readonly number[]): void;
}

export interface EcgSignalSource {
  signal(time: number, lead: string): number;
}

export interface DrawEcgOptions {
  readonly context: EcgCanvasContext;
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly leads: readonly string[];
  readonly activeColumn: number;
  readonly source: EcgSignalSource;
  readonly normalSource?: EcgSignalSource;
  readonly compare?: boolean;
  readonly normal?: boolean;
  readonly zoom?: number;
}

function line(context: EcgCanvasContext, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function trace(
  context: EcgCanvasContext,
  geometry: EcgGeometry,
  column: EcgColumnGeometry,
  lead: string,
  source: EcgSignalSource,
  color: string,
  width: number,
  dash: readonly number[] = [],
): void {
  context.save();
  context.beginPath();
  context.rect(column.offset, 0, Math.max(0, column.width - 4), geometry.height);
  context.clip();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.setLineDash(dash);
  context.beginPath();
  for (let localX = 0; localX <= column.width - 8; localX += 0.55) {
    const x = column.offset + localX;
    const time = geometry.leftTime + localX / geometry.pixelsPerSecond;
    const y = geometry.baseline - source.signal(time, lead) * geometry.pixelsPerMv;
    if (localX === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

/** Üç derivasyonu kaynak monitör düzeniyle çizer. */
export function drawEcg(options: DrawEcgOptions): EcgGeometry {
  const { context } = options;
  const geometry = mainEcgGeometry(options.width, options.height, options.time, options.zoom);
  context.clearRect(0, 0, geometry.width, geometry.height);
  context.fillStyle = "#fffafb";
  context.fillRect(0, 0, geometry.width, geometry.height);
  if (geometry.pixelsPerSecond <= 0 || geometry.smallSquare <= 0) return geometry;

  const active = Math.max(0, Math.min(2, Math.trunc(options.activeColumn)));
  for (const column of geometry.columns) {
    const lead = options.leads[column.index] ?? "II";
    context.save();
    context.beginPath();
    context.rect(column.offset, 0, column.width, geometry.height);
    context.clip();
    context.fillStyle = column.index === active ? "#fff7f8" : "#fffafb";
    context.fillRect(column.offset, 0, column.width, geometry.height);

    const first = Math.floor(geometry.leftTime / ECG_SMALL_SQUARE_SECONDS);
    for (let index = first; index * ECG_SMALL_SQUARE_SECONDS < options.time + 0.5; index += 1) {
      const x = column.offset + (index * ECG_SMALL_SQUARE_SECONDS - geometry.leftTime) * geometry.pixelsPerSecond;
      context.strokeStyle = index % 5 === 0 ? "#ebbec7" : "#f5dce0";
      context.lineWidth = index % 5 === 0 ? 0.8 : 0.45;
      line(context, x, 0, x, geometry.height);
    }
    for (let index = -Math.ceil(geometry.height / geometry.smallSquare); index < Math.ceil(geometry.height / geometry.smallSquare); index += 1) {
      const y = geometry.baseline + index * geometry.smallSquare;
      if (y < 0 || y > geometry.height) continue;
      context.strokeStyle = index % 5 === 0 ? "#ebbec7" : "#f5dce0";
      context.lineWidth = index % 5 === 0 ? 0.8 : 0.45;
      line(context, column.offset, y, column.offset + column.width, y);
    }
    if (options.compare && !options.normal && options.normalSource) {
      trace(context, geometry, column, lead, options.normalSource, "rgba(46,141,247,.85)", 1.5, [6, 4]);
    }
    trace(context, geometry, column, lead, options.source, options.normal ? "#144f67" : "#b92036", 1.8);
    context.strokeStyle = "#44687535";
    context.setLineDash([4, 4]);
    line(context, column.offset, geometry.baseline, column.offset + column.width, geometry.baseline);
    context.setLineDash([]);
    context.strokeStyle = "#25657677";
    context.lineWidth = 1;
    line(context, column.cursor, 10, column.cursor, geometry.height - 16);
    context.fillStyle = "#136077";
    context.beginPath();
    context.arc(column.cursor, geometry.baseline - options.source.signal(options.time, lead) * geometry.pixelsPerMv, 2.8, 0, Math.PI * 2);
    context.fill();
    context.font = "bold 12px ui-monospace,monospace";
    context.fillStyle = "#7b3a46";
    context.textAlign = "left";
    context.fillText(lead, column.offset + 7, 15);
    context.restore();
    if (column.index < 2) {
      context.fillStyle = "#cfdae0";
      context.fillRect(column.offset + column.width + 2, 0, 2, geometry.height);
    }
  }
  return geometry;
}

export interface EcgResizeObserver extends Disconnectable {
  observe(target: unknown, onResize: () => void): void;
}

/** Gözlemciyi mount yaşam döngüsüne bağlar ve ilk çizimi hemen yapar. */
export function observeEcg(
  lifecycle: Pick<PulseLifecycle, "observe">,
  observer: EcgResizeObserver,
  target: unknown,
  redraw: () => void,
): void {
  lifecycle.observe(observer);
  observer.observe(target, redraw);
  redraw();
}

export const drawEcgCanvas = drawEcg;
export const observeEcgCanvas = observeEcg;

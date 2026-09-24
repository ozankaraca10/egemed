export const ECG_COLUMN_COUNT = 3;
export const ECG_SMALL_SQUARE_SECONDS = 0.04;
export const ECG_SMALL_SQUARE_MV = 0.1;
export const ECG_ZOOM = 1.25;

export interface EcgColumnGeometry {
  readonly index: number;
  readonly offset: number;
  readonly width: number;
  readonly cursor: number;
}

export interface EcgGeometry {
  readonly width: number;
  readonly height: number;
  readonly windowSeconds: number;
  readonly pixelsPerSecond: number;
  readonly smallSquare: number;
  readonly baseline: number;
  readonly pixelsPerMv: number;
  readonly leftTime: number;
  readonly columns: readonly EcgColumnGeometry[];
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function columns(width: number, gap: number): readonly EcgColumnGeometry[] {
  const columnWidth = Math.max(0, (width - gap * 2) / ECG_COLUMN_COUNT);
  return Array.from({ length: ECG_COLUMN_COUNT }, (_, index) => {
    const offset = index * (columnWidth + gap);
    return { index, offset, width: columnWidth, cursor: offset + Math.max(0, columnWidth - 8) };
  });
}

/** Kaynak monitör formülleri; 25 mm/sn ve 10 mm/mV ölçeğini piksele çevirir. */
export function mainEcgGeometry(width: number, height: number, time: number, zoom = ECG_ZOOM): EcgGeometry {
  const safeWidth = Math.max(0, finite(width));
  const safeHeight = Math.max(0, finite(height));
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : ECG_ZOOM;
  const layout = columns(safeWidth, 6);
  const columnWidth = layout[0]?.width ?? 0;
  const windowSeconds = (safeWidth < 700 ? 2.2 : 2.8) / safeZoom;
  const pixelsPerSecond = Math.max(0, columnWidth - 12) / windowSeconds;
  const smallSquare = pixelsPerSecond * ECG_SMALL_SQUARE_SECONDS;
  return {
    width: safeWidth,
    height: safeHeight,
    windowSeconds,
    pixelsPerSecond,
    smallSquare,
    baseline: safeHeight * 0.6,
    pixelsPerMv: smallSquare / ECG_SMALL_SQUARE_MV,
    leftTime: finite(time) - windowSeconds,
    columns: layout,
  };
}

/** Vaka/soru şeridi kaynak geometrisi; yakınlaştırma görünür zaman aralığını daraltır. */
export function itemEcgGeometry(
  width: number,
  height: number,
  start: number,
  seconds: number,
  zoom = 1,
): EcgGeometry {
  const safeWidth = Math.max(0, finite(width));
  const safeHeight = Math.max(0, finite(height));
  const safeSeconds = seconds > 0 && Number.isFinite(seconds) ? seconds : 1;
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const layout = columns(safeWidth, 8);
  const columnWidth = layout[0]?.width ?? 0;
  const pixelsPerSecond = Math.max(0, columnWidth - 32) / safeSeconds * safeZoom;
  const smallSquare = pixelsPerSecond * ECG_SMALL_SQUARE_SECONDS;
  return {
    width: safeWidth,
    height: safeHeight,
    windowSeconds: safeSeconds / safeZoom,
    pixelsPerSecond,
    smallSquare,
    baseline: safeHeight * 0.62,
    pixelsPerMv: smallSquare / ECG_SMALL_SQUARE_MV,
    leftTime: finite(start),
    columns: layout,
  };
}

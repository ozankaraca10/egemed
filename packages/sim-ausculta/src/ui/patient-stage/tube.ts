/** Stetoskop ses iletim tüpü saf geometrisi (T228, T231).
 *  Sabit bağlantı (Y-parça) noktasından önce aşağı sarkan, sonra göğüs parçasının
 *  sol alt 45° noktasına o doğrultuda giren kübik Bézier. React, DOM ve `window`
 *  yok; sahne piksel uzayında çalışır. */

export interface TubePoint {
  readonly x: number;
  readonly y: number;
}

export interface TubeSize {
  readonly w: number;
  readonly h: number;
}

/** Sabit bağlantı noktası — sahnenin sol kenarı, üstten biraz aşağıda (gövde sahnesi oranı). */
export const TUBE_ANCHOR_RATIO = { x: 0.06, y: 0.12 } as const;

/** Göğüs parçası yarıçapı (px): `.steth` 76 px kutu, merkez hizalı. */
export const TUBE_CHESTPIECE_RADIUS = 38;

/** Tüpün göğüs parçasına bağlandığı yön: sol alt 45° (ekranda −x, +y). */
export const TUBE_ATTACH_DIR: TubePoint = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };

/** Bağlantıdan dikey iniş: uçlar arası mesafenin oranı (yerçekimi). */
const DROP_RATIO = 0.75;

/** Uçta 45° doğrultusundaki teğet kolunun uçlar arası mesafeye oranı. */
const ATTACH_ARM_RATIO = 0.35;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Sabit bağlantı noktasının sahne koordinatı. */
export function tubeAnchor(size: TubeSize): TubePoint {
  return { x: size.w * TUBE_ANCHOR_RATIO.x, y: size.h * TUBE_ANCHOR_RATIO.y };
}

/** Göğüs parçası kenarında sol alt 45° bağlantı noktası. */
export function tubeTip(center: TubePoint, radius = TUBE_CHESTPIECE_RADIUS): TubePoint {
  return { x: center.x + TUBE_ATTACH_DIR.x * radius, y: center.y + TUBE_ATTACH_DIR.y * radius };
}

/** Kübik Bézier yol verisi. Başlangıç ve bitiş uçlarla birebir aynıdır; tüp
 *  bağlantıdan dikey sarkar ve uca 45° doğrultusunda girer; kontroller sahnede kalır. */
export function tubePath(anchor: TubePoint, tip: TubePoint, size: TubeSize): string {
  const distance = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
  const maxY = Math.max(size.h - 2, 0);
  const maxX = Math.max(size.w - 2, 0);
  const c1x = anchor.x;
  const c1y = clamp(anchor.y + Math.max(tip.y - anchor.y, 0) * DROP_RATIO + distance * 0.2, anchor.y, maxY);
  // Kol, 45° doğrultusu bozulmadan sahne içinde kalacak kadar kısaltılır.
  const roomX = TUBE_ATTACH_DIR.x < 0 ? tip.x : maxX - tip.x;
  const roomY = TUBE_ATTACH_DIR.y > 0 ? maxY - tip.y : tip.y;
  const arm = Math.max(0, Math.min(distance * ATTACH_ARM_RATIO, roomX / Math.SQRT1_2, roomY / Math.SQRT1_2));
  const c2x = tip.x + TUBE_ATTACH_DIR.x * arm;
  const c2y = tip.y + TUBE_ATTACH_DIR.y * arm;
  return `M ${round(anchor.x)} ${round(anchor.y)} C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(tip.x)} ${round(tip.y)}`;
}

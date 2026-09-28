/** Stetoskop ses iletim tüpü saf geometrisi (T228).
 *  Sabit bağlantı (Y-parça) noktasından göğüs parçası kenarına inen kübik
 *  Bézier'i üretir. React, DOM ve `window` yok; sahne piksel uzayında çalışır. */

export interface TubePoint {
  readonly x: number;
  readonly y: number;
}

export interface TubeSize {
  readonly w: number;
  readonly h: number;
}

/** Sabit bağlantı noktası — sahnenin sol üst köşesi (gövde sahnesi oranı). */
export const TUBE_ANCHOR_RATIO = { x: 0.04, y: 0.04 } as const;

/** Göğüs parçası yarıçapı (px): `.steth` 76 px kutu, merkez hizalı. */
export const TUBE_CHESTPIECE_RADIUS = 38;

/** Sarkma uçlar arası mesafeyle orantılıdır (yerçekimi). */
const SAG_RATIO = 0.3;

/** Uzun mesafede sarkma sahne yüksekliğinin bu oranını aşmaz. */
const SAG_MAX_RATIO = 0.26;

/** Teğet kontrol noktalarının uçlar arası yatay açıklığa oranı. */
const TANGENT_RATIO = 0.28;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Sabit bağlantı noktasının sahne koordinatı. */
export function tubeAnchor(size: TubeSize): TubePoint {
  return { x: size.w * TUBE_ANCHOR_RATIO.x, y: size.h * TUBE_ANCHOR_RATIO.y };
}

/** Göğüs parçası kenarının tüpe bakan noktası. Merkez bağlantıya yarıçaptan
 *  yakınsa uç bağlantıya kadar çekilir; tüp kıvrılıp kendi üstüne binmez. */
export function tubeTip(center: TubePoint, anchor: TubePoint, radius = TUBE_CHESTPIECE_RADIUS): TubePoint {
  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: center.x, y: center.y };
  const reach = Math.min(radius, length);
  return { x: center.x + (dx / length) * reach, y: center.y + (dy / length) * reach };
}

/** Kübik Bézier yol verisi. Başlangıç ve bitiş uçlarla birebir aynıdır;
 *  kontrol noktaları mesafeyle orantılı aşağı sarkar ve sahne içinde kalır. */
export function tubePath(anchor: TubePoint, tip: TubePoint, size: TubeSize): string {
  const dx = tip.x - anchor.x;
  const dy = tip.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  const sag = Math.min(distance * SAG_RATIO, Math.max(size.h, 0) * SAG_MAX_RATIO);
  const floor = Math.max(anchor.y, tip.y);
  const c1y = Math.min(anchor.y + sag, Math.max(floor, size.h - 2));
  const c2y = Math.min(tip.y + sag, Math.max(floor, size.h - 2));
  const c1x = anchor.x + dx * TANGENT_RATIO;
  const c2x = tip.x - dx * TANGENT_RATIO;
  return `M ${round(anchor.x)} ${round(anchor.y)} C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(tip.x)} ${round(tip.y)}`;
}

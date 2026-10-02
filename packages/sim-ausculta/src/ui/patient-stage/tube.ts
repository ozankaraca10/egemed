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

/** Kulaklık (çatal) bölümünün göğüs parçası çapına oranı: gerçek stetoskopta
 *  ~4,5 cm göğüs parçasına karşı ~15 cm Y-parça + kulak boruları + kulak uçları. */
export const HEADSET_TO_CHESTPIECE = 3.2;

/** Küçük sahnede kulaklık sahne yüksekliğinin bu oranını aşmaz. */
const HEADSET_MAX_STAGE_RATIO = 0.42;

/** Kulaklık yüksekliği (px): gerçek oran, sahneye sığacak şekilde sınırlı.
 *  `scale` (T310): stetoskobun tamamı için ölçek (öğrenme sahnesinde 0,75). */
export function tubeHeadsetHeight(size: TubeSize, scale = 1): number {
  const real = HEADSET_TO_CHESTPIECE * 2 * TUBE_CHESTPIECE_RADIUS * scale;
  return Math.max(0, Math.min(real, size.h * HEADSET_MAX_STAGE_RATIO));
}

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

/** Sabit bağlantı (Y-parça) noktası: sol kenarda, kulaklığın hemen altında. */
export function tubeAnchor(size: TubeSize, scale = 1): TubePoint {
  const head = tubeHeadsetHeight(size, scale);
  return { x: Math.max(size.w * 0.06, head * 0.34 + 8), y: head + 10 };
}

/** Göğüs parçası kenarında sol alt 45° bağlantı noktası. */
export function tubeTip(center: TubePoint, radius = TUBE_CHESTPIECE_RADIUS): TubePoint {
  return { x: center.x + TUBE_ATTACH_DIR.x * radius, y: center.y + TUBE_ATTACH_DIR.y * radius };
}

/** T307: tüp, T228 temel eğrisinin bu katı uzunluktadır (gerçek stetoskop tüpü ~2×). */
export const TUBE_LENGTH_FACTOR = 2;

interface Cubic {
  readonly c1: TubePoint;
  readonly c2: TubePoint;
}

function cubicLength(a: TubePoint, c: Cubic, b: TubePoint): number {
  let length = 0;
  let prev = a;
  for (let i = 1; i <= 32; i += 1) {
    const t = i / 32;
    const u = 1 - t;
    const point = {
      x: u * u * u * a.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * b.y,
    };
    length += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return length;
}

/** Kübik Bézier yol verisi. Başlangıç ve bitiş uçlarla birebir aynıdır; tüp
 *  bağlantıdan dikey sarkar ve uca 45° doğrultusunda girer; kontroller sahnede kalır.
 *  Sarkma derinliği, uzunluk temel eğrinin `TUBE_LENGTH_FACTOR` katı olana dek
 *  (sahne tabanını aşmadan) ikili aramayla artırılır. */
export function tubePath(anchor: TubePoint, tip: TubePoint, size: TubeSize): string {
  const distance = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
  const maxY = Math.max(size.h - 2, 0);
  const maxX = Math.max(size.w - 2, 0);
  // Kol, 45° doğrultusu bozulmadan sahne içinde kalacak kadar kısaltılır.
  const roomX = TUBE_ATTACH_DIR.x < 0 ? tip.x : maxX - tip.x;
  const roomY = TUBE_ATTACH_DIR.y > 0 ? maxY - tip.y : tip.y;
  const armCap = Math.max(0, Math.min(roomX / Math.SQRT1_2, roomY / Math.SQRT1_2));
  const baseDrop = clamp(anchor.y + Math.max(tip.y - anchor.y, 0) * DROP_RATIO + distance * 0.2, anchor.y, maxY);
  const baseArm = Math.min(distance * ATTACH_ARM_RATIO, armCap);
  const curve = (s: number): Cubic => {
    const c1y = baseDrop + (maxY - baseDrop) * s;
    const arm = baseArm + (armCap - baseArm) * s;
    return {
      c1: { x: anchor.x, y: clamp(c1y, anchor.y, maxY) },
      c2: { x: tip.x + TUBE_ATTACH_DIR.x * arm, y: tip.y + TUBE_ATTACH_DIR.y * arm },
    };
  };
  const target = cubicLength(anchor, curve(0), tip) * TUBE_LENGTH_FACTOR;
  let lo = 0;
  let hi = 1;
  if (cubicLength(anchor, curve(1), tip) <= target) lo = 1;
  else {
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (cubicLength(anchor, curve(mid), tip) < target) lo = mid;
      else hi = mid;
    }
  }
  const { c1, c2 } = curve(lo);
  return `M ${round(anchor.x)} ${round(anchor.y)} C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(tip.x)} ${round(tip.y)}`;
}

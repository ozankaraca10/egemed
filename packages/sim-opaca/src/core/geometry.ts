import type { Box, ImageRecord } from "./types";

/** Görüntü koordinat yardımcıları — tamamı normalize (0–1) uzayda çalışır, DOM'a bağımlı değildir. */

export interface Point {
  x: number;
  y: number;
}

export function inBox(p: Point, b: Box, margin = 0): boolean {
  return p.x >= b.x - margin && p.x <= b.x + b.w + margin && p.y >= b.y - margin && p.y <= b.y + b.h + margin;
}

/** V3 isabet ölçütü: merkez kutunun içinde OLMALI ve merkezin kutu merkezine uzaklığı,
 *  kutunun yarı köşegeninin %60'ını AŞMAMALI. Büyük/geniş kutularda kenardan teğet geçen
 *  işaretlerin doğru sayılmasını engeller; eski %2 kenar toleransı (MARK_TOLERANCE) kaldırıldı. */
export const MARK_CENTER_DISTANCE_FRACTION = 0.6;

export function markHitsBox(p: Point, b: Box): boolean {
  if (!inBox(p, b, 0)) return false;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const halfDiag = Math.hypot(b.w, b.h) / 2;
  if (halfDiag <= 0) return true;
  const dist = Math.hypot(p.x - cx, p.y - cy);
  return dist <= halfDiag * MARK_CENTER_DISTANCE_FRACTION;
}

/** İşaretin, görüntüdeki hedef bulgunun uzman kutularından birine düşüp düşmediği. */
export function markHitsFinding(p: Point, image: ImageRecord | undefined, finding: string): boolean {
  if (!image) return false;
  return image.annotations.some((a) => a.finding === finding && a.source !== "report_nlp" && markHitsBox(p, a));
}

export function decodeMark(v: string | undefined): Point | null {
  if (!v || !v.startsWith("pt:")) return null;
  const [xs, ys] = v.slice(3).split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

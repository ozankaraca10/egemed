import type { Box, ImageRecord } from "./types";

/** SUNUCU TARAFI kopya (A2.1, ADR-009); kaynak packages/sim-opaca/src/core/geometry.ts.
 *  Görüntü koordinat yardımcıları — tamamı normalize (0–1) uzayda çalışır, DOM'a bağımlı değildir. */

export interface Point {
  x: number;
  y: number;
}

function inBox(p: Point, b: Box): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** İsabet ölçütü: merkez kutunun içinde OLMALI ve merkezin kutu merkezine uzaklığı,
 *  kutunun yarı köşegeninin %60'ını AŞMAMALI (sim ile birebir aynı davranış). */
export const MARK_CENTER_DISTANCE_FRACTION = 0.6;

export function markHitsBox(p: Point, b: Box): boolean {
  if (!inBox(p, b)) return false;
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

/** Görüntüdeki hedef bulgunun kutularından işarete en yakın olanının merkezi (yanlış
 *  işaretlerde geri bildirim çizgisi/oku için) — kutu yoksa null. */
export function nearestFindingBoxCenter(p: Point, image: ImageRecord | undefined, finding: string): Point | null {
  if (!image) return null;
  const boxes = image.annotations.filter((a) => a.finding === finding && a.source !== "report_nlp");
  if (!boxes.length) return null;
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const b of boxes) {
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Yanıt kodlaması: "pt:0.4312,0.5521" (istemci ve SCORM ile uyumlu düz metin). */
export function decodeMark(v: string | undefined): Point | null {
  if (!v || !v.startsWith("pt:")) return null;
  const [xs, ys] = v.slice(3).split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

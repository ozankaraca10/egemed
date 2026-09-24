/** PatientStage saf geometri, işaretçi ve klavye hesabı (S9a).
 *  React, DOM ve `window` yok; görsel kutu ve snap kaynak formüllerini korur. */

import type { PatientView } from "../../core/types";
import pointsConfig from "../../data/auscultation-points.json";

export type BodyType = "erkek" | "kadin" | "pediatrik";

export interface StageCoordPoint {
  readonly id: string;
  readonly view: PatientView;
  readonly x: number;
  readonly y: number;
  readonly xf?: number;
  readonly yf?: number;
  readonly xp?: number;
  readonly yp?: number;
}

export interface NormPoint {
  readonly x: number;
  readonly y: number;
}

export interface StageBox {
  readonly w: number;
  readonly h: number;
}

export interface StageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StageViewConfig {
  readonly image?: string;
  readonly svg?: string;
  readonly width: number;
  readonly height: number;
}

type ImageKey = "male" | "female" | "pediatric";
type CoordKey = "x" | "y" | "xf" | "yf" | "xp" | "yp";

/** Kaynak başlangıç: göğüs parçası alt-orta. */
export const INITIAL_STAGE_POSITION: NormPoint = { x: 0.5, y: 0.75 };

export const KEYBOARD_STEP = 0.02;
export const STAGE_X_MIN = 0.01;
export const STAGE_X_MAX = 0.99;
export const STAGE_Y_MIN = 0.02;
export const STAGE_Y_MAX = 0.98;
export const SNAP_MAX_PX = 60;
export const SNAP_WIDTH_RATIO = 0.07;
const MIN_CONTAINER_PX = 10;

const COORD_KEYS: Record<BodyType, readonly [CoordKey, CoordKey]> = {
  erkek: ["x", "y"],
  kadin: ["xf", "yf"],
  pediatrik: ["xp", "yp"],
};

const IMAGE_KEY: Record<BodyType, ImageKey> = {
  erkek: "male",
  kadin: "female",
  pediatrik: "pediatric",
};

const IMAGES = pointsConfig.images as unknown as Record<PatientView, Record<ImageKey, StageViewConfig>>;

const ARROW_NUDGE: Record<string, (position: NormPoint) => NormPoint> = {
  ArrowUp: (position) => ({ ...position, y: Math.max(STAGE_Y_MIN, position.y - KEYBOARD_STEP) }),
  ArrowDown: (position) => ({ ...position, y: Math.min(STAGE_Y_MAX, position.y + KEYBOARD_STEP) }),
  ArrowLeft: (position) => ({ ...position, x: Math.max(STAGE_X_MIN, position.x - KEYBOARD_STEP) }),
  ArrowRight: (position) => ({ ...position, x: Math.min(STAGE_X_MAX, position.x + KEYBOARD_STEP) }),
};

export function stageViewConfig(view: PatientView, bodyType: BodyType): StageViewConfig {
  return IMAGES[view][IMAGE_KEY[bodyType]] ?? IMAGES[view].male;
}

export function isPediatricSchematic(config: StageViewConfig): boolean {
  return config.svg === "pediatric-front" || config.svg === "pediatric-back";
}

/** Gövde türüne göre koordinat; eksik kadın/pediatrik alan yetişkin x/y'ye düşer. */
export function coordOf(point: StageCoordPoint, bodyType: BodyType): NormPoint {
  const [ckx, cky] = COORD_KEYS[bodyType];
  return {
    x: Number(point[ckx] ?? point.x),
    y: Number(point[cky] ?? point.y),
  };
}

export function pointsInView(
  points: readonly StageCoordPoint[],
  view: PatientView,
  filterIds?: readonly string[],
): StageCoordPoint[] {
  return points.filter((point) => point.view === view && (!filterIds || filterIds.includes(point.id)));
}

/** Kapsayıcıya sığan en büyük dikdörtgen (letterbox yok). 10 px altı ölçülmez. */
export function fitStageBox(
  container: { readonly width: number; readonly height: number },
  image: { readonly width: number; readonly height: number },
): StageBox | null {
  const { width, height } = container;
  if (width < MIN_CONTAINER_PX || height < MIN_CONTAINER_PX) return null;
  const aspect = image.width / image.height;
  let w = width;
  let h = w / aspect;
  if (h > height) {
    h = height;
    w = h * aspect;
  }
  return { w: Math.floor(w), h: Math.floor(h) };
}

export function clampStagePosition(x: number, y: number): NormPoint {
  return {
    x: Math.min(STAGE_X_MAX, Math.max(STAGE_X_MIN, x)),
    y: Math.min(STAGE_Y_MAX, Math.max(STAGE_Y_MIN, y)),
  };
}

export function pointerToStagePosition(clientX: number, clientY: number, rect: StageRect): NormPoint {
  return clampStagePosition((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
}

/** Farede yalnız birincil düğme; dokunma/kalem düğme değerinden bağımsız başlar. */
export function isPrimaryPointer(button: number, pointerType: string): boolean {
  return !(button !== 0 && pointerType === "mouse");
}

export function snapTolerance(rectWidth: number): number {
  return Math.min(SNAP_MAX_PX, rectWidth * SNAP_WIDTH_RATIO);
}

/** Tolerans içindeki en yakın nokta. Eşit uzaklıkta listedeki ilk nokta kalır. */
export function findNearestPoint(
  points: readonly StageCoordPoint[],
  view: PatientView,
  bodyType: BodyType,
  position: NormPoint,
  rect: { readonly width: number; readonly height: number },
  filterIds?: readonly string[],
): string | null {
  const px = position.x * rect.width;
  const py = position.y * rect.height;
  let best: { id: string; d: number } | null = null;
  for (const point of pointsInView(points, view, filterIds)) {
    const coord = coordOf(point, bodyType);
    const distance = Math.hypot(coord.x * rect.width - px, coord.y * rect.height - py);
    if (!best || distance < best.d) best = { id: point.id, d: distance };
  }
  const tolerance = snapTolerance(rect.width);
  return best && best.d <= tolerance ? best.id : null;
}

/** Ok tuşu %2 adım. Ok değilse `null` (yerleştirme tuşu ayrıdır). */
export function nudgeStagePosition(position: NormPoint, key: string): NormPoint | null {
  const move = ARROW_NUDGE[key];
  return move ? move(position) : null;
}

export function isPlaceKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

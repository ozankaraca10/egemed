/** DOM'suz kaliper geometrisi ve mount kapsamlı pointer/klavye bağları. */
import { createPulseLifecycle } from "../../host/lifecycle";
import type { AbortControllerLike, EventListenerLike, ListenerTarget, PulseLifecycle } from "../../host/lifecycle";

export interface CaliperPoint { x: number; y: number }
export interface CaliperState { a: CaliperPoint; b: CaliperPoint }
export interface CaliperRect { left: number; top: number; width: number; height: number }
export type CaliperHandle = keyof CaliperState;
export const CALIPER_X_MIN = 0.02;
export const CALIPER_X_MAX = 0.98;
export const CALIPER_Y_MIN = 0.04;
export const CALIPER_Y_MAX = 0.96;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const rounded = (n: number): number => Number(n.toFixed(3));

export function caliperPointFromPointer(clientX: number, clientY: number, rect: CaliperRect): CaliperPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: CALIPER_X_MIN, y: CALIPER_Y_MIN };
  return {
    x: clamp((clientX - rect.left) / rect.width, CALIPER_X_MIN, CALIPER_X_MAX),
    y: clamp((clientY - rect.top) / rect.height, CALIPER_Y_MIN, CALIPER_Y_MAX),
  };
}

export function nudgeCaliper(state: CaliperState, handle: CaliperHandle, key: string, large = false): boolean {
  const delta = large ? 0.02 : 0.005;
  const point = state[handle];
  if (key === "ArrowLeft") point.x = rounded(clamp(point.x - delta, CALIPER_X_MIN, CALIPER_X_MAX));
  else if (key === "ArrowRight") point.x = rounded(clamp(point.x + delta, CALIPER_X_MIN, CALIPER_X_MAX));
  else if (key === "ArrowUp") point.y = rounded(clamp(point.y - delta, CALIPER_Y_MIN, CALIPER_Y_MAX));
  else if (key === "ArrowDown") point.y = rounded(clamp(point.y + delta, CALIPER_Y_MIN, CALIPER_Y_MAX));
  else return false;
  return true;
}

export interface CaliperPointerEvent {
  readonly pointerId: number; readonly clientX: number; readonly clientY: number;
  preventDefault(): void; stopPropagation(): void;
}
export interface CaliperKeyboardEvent { readonly key: string; readonly shiftKey: boolean; preventDefault(): void }
export interface CaliperHandleTarget extends ListenerTarget {
  setPointerCapture?(pointerId: number): void;
}
export interface CaliperHandleBinding { readonly handle: CaliperHandle; readonly target: CaliperHandleTarget }
export interface CaliperDragOptions {
  readonly lifecycle: PulseLifecycle; readonly handles: readonly CaliperHandleBinding[];
  readonly pointerTarget: ListenerTarget; readonly state: CaliperState;
  readonly rect: () => CaliperRect; readonly changed: () => void;
}

/** Pointer capture ve window dinleyicileri mount lifecycle'ı ile birlikte kapanır. */
export function bindCaliperDrag(options: CaliperDragOptions): void {
  let active: { handle: CaliperHandle; pointerId: number } | null = null;
  const listen = (target: ListenerTarget, type: string, handler: (event: CaliperPointerEvent) => void): void =>
    options.lifecycle.listen(target, type, handler as unknown as EventListenerLike);
  for (const binding of options.handles) {
    listen(binding.target, "pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation();
      active = { handle: binding.handle, pointerId: event.pointerId };
      binding.target.setPointerCapture?.(event.pointerId);
    });
    options.lifecycle.listen(binding.target, "keydown", ((event: CaliperKeyboardEvent) => {
      if (!nudgeCaliper(options.state, binding.handle, event.key, event.shiftKey)) return;
      event.preventDefault(); options.changed();
    }) as unknown as EventListenerLike);
  }
  listen(options.pointerTarget, "pointermove", (event) => {
    if (!active || active.pointerId !== event.pointerId) return;
    options.state[active.handle] = caliperPointFromPointer(event.clientX, event.clientY, options.rect());
    options.changed();
  });
  const end = (event: CaliperPointerEvent): void => {
    if (active?.pointerId === event.pointerId) active = null;
  };
  listen(options.pointerTarget, "pointerup", end);
  listen(options.pointerTarget, "pointercancel", end);
}

/** Küçük lifecycle fabrikası yalnız caliper mount'unda gereken abort kontrolünü sağlar. */
export function createCaliperLifecycle(controller: AbortControllerLike): PulseLifecycle {
  return createPulseLifecycle(controller);
}

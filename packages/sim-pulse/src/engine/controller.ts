import { CardiacModel } from "./model";
import type { PulseState } from "./state";
import { createPulseScheduler } from "./scheduler";
import type { PulseSchedulerOptions } from "./scheduler";

export interface PulseControllerOptions {
  state: PulseState;
  model: CardiacModel;
  scheduler: PulseSchedulerOptions;
  onFrame?: (state: PulseState, snapshot: ReturnType<CardiacModel["snapshot"]>) => void;
}

export interface PulseController {
  start(): void;
  pause(): void;
  resume(): void;
  setSpeed(speed: number): void;
  observeMode(mode: PulseState["mode"] | null): void;
  startExamClock(onSecond: () => void): () => void;
  dispose(): void;
}

/** Motor saatini ve gözlem ilerlemesini tek örneğe bağlar; görünüm çizimi callback'tedir. */
export function createPulseController(options: PulseControllerOptions): PulseController {
  const scheduler = createPulseScheduler(options.scheduler);
  let disposed = false;
  let playing = false;
  let observationMode: PulseState["mode"] | null = null;

  const draw = (): void => {
    if (!disposed) options.onFrame?.(options.state, options.model.snapshot(options.state.time));
  };
  const tick = (elapsedSeconds: number): void => {
    if (disposed || !playing || options.scheduler.isHidden()) return;
    const state = options.state;
    if (elapsedSeconds > 0) {
      state.time = Math.min(36000, state.time + elapsedSeconds * state.speed);
      if (observationMode === state.mode) {
        const observed = state.viewed[state.mode] + elapsedSeconds;
        state.viewed[state.mode] = observed >= 16 - 1e-9 ? 16 : observed;
      }
      if (state.time >= 36000) {
        playing = false;
        scheduler.pause();
      }
    }
    draw();
  };

  return {
    start(): void {
      if (disposed || playing) return;
      playing = true;
      scheduler.start(tick);
      draw();
    },
    pause(): void {
      if (disposed || !playing) return;
      playing = false;
      scheduler.pause();
      draw();
    },
    resume(): void {
      if (disposed || playing) return;
      playing = true;
      scheduler.resume();
      draw();
    },
    setSpeed(speed): void {
      if (disposed || ![0.25, 0.5, 1, 2].includes(speed)) return;
      options.state.speed = speed;
    },
    observeMode(mode): void {
      if (disposed) return;
      observationMode = mode;
    },
    startExamClock(onSecond): () => void {
      return scheduler.interval(onSecond, 1000);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      playing = false;
      observationMode = null;
      scheduler.dispose();
    },
  };
}

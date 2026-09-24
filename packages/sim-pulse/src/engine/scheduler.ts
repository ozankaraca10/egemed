export type FrameHandle = number;
export type IntervalHandle = number;
export type FrameCallback = () => void;

export interface PulseSchedulerOptions {
  requestFrame(callback: FrameCallback): FrameHandle;
  cancelFrame(handle: FrameHandle): void;
  now(): number;
  setInterval(callback: () => void, milliseconds: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;
  isHidden(): boolean;
}

export interface PulseScheduler {
  start(tick: (elapsedSeconds: number) => void): void;
  pause(): void;
  resume(): void;
  interval(callback: () => void, milliseconds: number): () => void;
  dispose(): void;
}

/** Enjekte edilmiş RAF ve saatle kare döngüsünü, interval'ları örnek ömrüne bağlar. */
export function createPulseScheduler(options: PulseSchedulerOptions): PulseScheduler {
  let disposed = false;
  let running = false;
  let frame: FrameHandle | null = null;
  let previousTime: number | null = null;
  let tick: ((elapsedSeconds: number) => void) | null = null;
  const intervals = new Map<IntervalHandle, () => void>();

  const schedule = (): void => {
    if (!disposed && running && frame === null) frame = options.requestFrame(onFrame);
  };
  const onFrame = (): void => {
    frame = null;
    if (disposed || !running) return;
    const time = options.now();
    if (options.isHidden()) {
      previousTime = null;
    } else {
      const elapsed = previousTime === null ? 0 : Math.max(0, Math.min(0.1, (time - previousTime) / 1000));
      previousTime = time;
      tick?.(elapsed);
    }
    schedule();
  };

  return {
    start(callback): void {
      if (disposed) return;
      tick = callback;
      running = true;
      previousTime = null;
      schedule();
    },
    pause(): void {
      if (disposed || !running) return;
      running = false;
      previousTime = null;
      if (frame !== null) options.cancelFrame(frame);
      frame = null;
    },
    resume(): void {
      if (disposed || running) return;
      running = true;
      previousTime = null;
      schedule();
    },
    interval(callback, milliseconds): () => void {
      if (disposed) return () => undefined;
      const handle = options.setInterval(() => {
        if (!disposed) callback();
      }, milliseconds);
      const release = (): void => {
        if (!intervals.has(handle)) return;
        intervals.delete(handle);
        options.clearInterval(handle);
      };
      intervals.set(handle, release);
      return release;
    },
    dispose(): void {
      if (disposed) return;
      this.pause();
      disposed = true;
      tick = null;
      for (const release of [...intervals.values()]) release();
    },
  };
}

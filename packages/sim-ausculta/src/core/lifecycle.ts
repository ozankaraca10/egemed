/** Enjekte edilebilir pencere sınırı (S8d). Kök tsconfig DOM lib'i taşımadığı için tip yapısaldır.
 *  Üretimde kabuk `window` vekilini enjekte eder; testler sahte nesne verir.
 *  Paket içinde doğrudan `window`/`document`/`localStorage` erişimi yoktur (ADR-006). */
export interface WindowLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(handle: number): void;
  readonly visibilityState: "hidden" | "visible";
}

/** Auto-flush köprüsü (kaynak `attachAutoFlush`). */
export interface LifecycleHandlers {
  flush(): void;
  /** pagehide son yazımı. Oturumu kapatmaz; bfcache dönüşünde oturum sürer. */
  pageHide(): void;
}

export interface FlushTarget {
  flushNow(): void;
}

/** Mount başına kayıt: dinleyici ve zamanlayıcılar `detach` ile düşer. */
export interface Lifecycle {
  attach(handlers: LifecycleHandlers): void;
  detach(): void;
  startTicker(intervalMs: number, onTick: () => void): () => void;
}

export function createLifecycle(env: WindowLike): Lifecycle {
  const listeners: { type: string; handler: () => void }[] = [];
  const stops = new Set<() => void>();
  let attached = false;

  return {
    attach(handlers): void {
      if (attached) return;
      attached = true;
      listeners.push(
        { type: "beforeunload", handler: () => handlers.flush() },
        {
          type: "visibilitychange",
          handler: () => {
            if (env.visibilityState === "hidden") handlers.flush();
          },
        },
        { type: "pagehide", handler: () => handlers.pageHide() },
      );
      for (const { type, handler } of listeners) env.addEventListener(type, handler);
    },
    detach(): void {
      if (!attached) return;
      attached = false;
      for (const { type, handler } of listeners) env.removeEventListener(type, handler);
      listeners.length = 0;
      for (const stop of [...stops]) stop();
      stops.clear();
    },
    startTicker(intervalMs, onTick): () => void {
      if (!attached) return () => undefined;
      let handle: number | null = null;
      let stopped = false;
      const schedule = (): void => {
        handle = env.setTimeout(() => {
          handle = null;
          if (stopped || !attached) return;
          onTick();
          schedule();
        }, intervalMs);
      };
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (handle !== null) {
          env.clearTimeout(handle);
          handle = null;
        }
        stops.delete(stop);
      };
      stops.add(stop);
      schedule();
      return stop;
    },
  };
}

export function createFlushHandlers(runtime: FlushTarget): LifecycleHandlers {
  return {
    flush: () => runtime.flushNow(),
    pageHide: () => runtime.flushNow(),
  };
}

export type AbortSignalLike = object;

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(): void;
}

export interface ListenerTarget {
  addEventListener(type: string, listener: EventListenerLike, options?: { readonly signal?: AbortSignalLike }): void;
  removeEventListener(type: string, listener: EventListenerLike): void;
}

export type EventListenerLike = (...args: never[]) => void;

export interface Disconnectable {
  disconnect(): void;
}

export interface PulseLifecycle {
  readonly signal: AbortSignalLike;
  listen(target: ListenerTarget, type: string, listener: EventListenerLike): void;
  timer(handle: unknown, clear: (handle: unknown) => void): void;
  frame(handle: unknown, cancel: (handle: unknown) => void): void;
  observe(observer: Disconnectable): void;
  dispose(): void;
}

/** Tek abort sinyali ve kaynak kayıtlarıyla mount'a ait tüm işleri kapatır. */
export function createPulseLifecycle(controller: AbortControllerLike): PulseLifecycle {
  let disposed = false;
  const cleanup = new Set<() => void>();

  function register(release: () => void): void {
    if (disposed) {
      release();
    } else {
      cleanup.add(release);
    }
  }

  return {
    signal: controller.signal,
    listen(target, type, listener): void {
      target.addEventListener(type, listener, { signal: controller.signal });
      register(() => target.removeEventListener(type, listener));
    },
    timer(handle, clear): void {
      register(() => clear(handle));
    },
    frame(handle, cancel): void {
      register(() => cancel(handle));
    },
    observe(observer): void {
      register(() => observer.disconnect());
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const release of cleanup) {
        try {
          release();
        } catch {
          // Bir kaynağın temizlik hatası diğer kayıtların kapanmasını engellemez.
        }
      }
      cleanup.clear();
    },
  };
}

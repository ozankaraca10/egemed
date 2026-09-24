export const PULSE_EVENT_NAMES = [
  "cardai:tick",
  "cardai:mode",
  "cardai:view",
  "cardai:session",
  "cardai:reset",
] as const;

/** Olay ayrımı derleme zamanında korunur; payload'ı tüketici kendi sözleşmesinde daraltır. */
export interface PulseEventPayloads {
  "cardai:tick": unknown;
  "cardai:mode": unknown;
  "cardai:view": unknown;
  "cardai:session": unknown;
  "cardai:reset": unknown;
}

export type PulseEventName = keyof PulseEventPayloads;
export type PulseEventListener<K extends PulseEventName> = (payload: PulseEventPayloads[K]) => void;
export type PulseUnsubscribe = () => void;

export interface PulseEventEmitter {
  on<K extends PulseEventName>(name: K, listener: PulseEventListener<K>): PulseUnsubscribe;
  emit<K extends PulseEventName>(name: K, payload: PulseEventPayloads[K]): void;
  clear(): void;
}

/** Örnek başına olay kanalı; hiçbir window/document global'ine yazmaz. */
export function createPulseEventEmitter(): PulseEventEmitter {
  const listeners = new Map<PulseEventName, Set<(payload: unknown) => void>>();
  let disposed = false;

  return {
    on<K extends PulseEventName>(name: K, listener: PulseEventListener<K>): PulseUnsubscribe {
      if (disposed) return () => undefined;
      let bucket = listeners.get(name);
      if (!bucket) {
        bucket = new Set();
        listeners.set(name, bucket);
      }
      const callback = listener as (payload: unknown) => void;
      bucket.add(callback);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        bucket?.delete(callback);
        if (bucket?.size === 0) listeners.delete(name);
      };
    },
    emit<K extends PulseEventName>(name: K, payload: PulseEventPayloads[K]): void {
      if (disposed) return;
      for (const listener of listeners.get(name) ?? []) listener(payload);
    },
    clear(): void {
      disposed = true;
      listeners.clear();
    },
  };
}

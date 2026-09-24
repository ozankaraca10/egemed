import type { SimEvent } from "./types";

/** Hafif iç analytics olay veri yolu (§28). SCORM'a yüksek frekanslı veri gönderilmez.
 *  Port kararı (E2 §5): modül düzeyi tekil `bus` yerine mount başına örnek — `createBus(now)`.
 *  Her örnek kendi abone kümesini ve 2000 kayıtlık günlüğünü tutar; iki örnek birbirine sızmaz.
 *  Zaman damgası çağıranlar yerine veri yolunda vurulur; `Date.now()` kullanılmaz (AGENTS.md). */

/** `at` alanı veri yolunda vurulacağı için olay taslağı ondan arındırılır (birleşim korunur). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Zaman damgası olmadan yayınlanan olay; `at` yayın anında `now()` ile doldurulur. */
export type SimEventDraft = DistributiveOmit<SimEvent, "at">;

/** Günlük üst sınırı; aşılınca en eski kayıtlar düşer (kaynak davranışı: 2000 → 500 sil). */
export const LOG_LIMIT = 2000;
export const LOG_TRIM = 500;

export interface EventBus {
  /** Olayı damgalar, günlüğe yazar ve abonelere dağıtır; damgalanmış olayı döndürür. */
  emit(event: SimEventDraft): SimEvent;
  /** Aboneliği kaldıran işlevi döndürür. */
  subscribe(fn: (event: SimEvent) => void): () => void;
  /** Günlüğün canlı görünümü. */
  getLog(): readonly SimEvent[];
}

export function createBus(now: () => number): EventBus {
  const listeners = new Set<(event: SimEvent) => void>();
  const log: SimEvent[] = [];

  return {
    emit(event): SimEvent {
      const stamped = { ...event, at: now() } as SimEvent;
      log.push(stamped);
      if (log.length > LOG_LIMIT) log.splice(0, LOG_TRIM);
      for (const listener of listeners) listener(stamped);
      return stamped;
    },
    subscribe(fn): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getLog(): readonly SimEvent[] {
      return log;
    },
  };
}

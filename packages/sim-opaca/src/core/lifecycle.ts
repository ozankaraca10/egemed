/** Enjekte edilebilir pencere/belge sınırı (E2 §7.5, S7). Kök tsconfig DOM lib'i taşımadığı
 *  için tip yapısaldır: yalnız kullanılan yüzey — dinleyici kaydı, zamanlayıcı, görünürlük.
 *  Üretimde kabuk `window`+`document` vekilini enjekte eder; testler sahte nesne verir.
 *  Paket içinde doğrudan `window`/`document`/`localStorage` erişimi yoktur (ADR-006). */
export interface WindowLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(handle: number): void;
  readonly visibilityState: "hidden" | "visible";
}

/** Auto-flush köprüsü: pencere olaylarını çalışma zamanı yazımına bağlar (kaynak `attachAutoFlush`). */
export interface LifecycleHandlers {
  /** beforeunload ve gizlenme (visibilitychange → hidden): oturum anlık görüntüsünü yaz. */
  flush(): void;
  /** pagehide: son yazım. Oturumu kapatmaz; bfcache dönüşünde oturum sürer (kaynak: terminate yerine). */
  pageHide(): void;
}

/** Auto-flush hedefi: yalnız yazım yüzeyi (S5 `SimRuntime.flushNow`). */
export interface FlushTarget {
  flushNow(): void;
}

/** Mount başına yaşam döngüsü kaydı: tüm dinleyici ve zamanlayıcılar tek listede toplanır,
 *  `detach` hepsini düşürür (E2 §7.5 — kaynakta unmount'ta düşürülmeyen sızıntı kapatılır). */
export interface Lifecycle {
  /** Dinleyicileri bağlar; ikinci çağrı etkisizdir (idempotent). */
  attach(handlers: LifecycleHandlers): void;
  /** Tüm dinleyici ve zamanlayıcıları kaldırır; idempotent. Sonrasında yeniden attach edilebilir
   *  (StrictMode çift mount: setup → cleanup → setup). */
  detach(): void;
  /** Periyodik yoklama kurar (kaynak `setInterval`; DOM lib'siz setTimeout zinciriyle).
   *  Dönen işlev yoklamayı durdurur; `detach` bekleyen tüm yoklamaları da keser. */
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
        { type: "pagehide", handler: () => handlers.pageHide() }
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

/** Auto-flush handler seti: beforeunload/gizlenme ve pagehide son yazımı `flushNow`'a bağlar. */
export function createFlushHandlers(runtime: FlushTarget): LifecycleHandlers {
  return {
    flush: () => runtime.flushNow(),
    pageHide: () => runtime.flushNow(),
  };
}

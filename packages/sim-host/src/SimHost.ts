/**
 * SimHost sözleşmesi (ADR-006): tek React kabuk içindeki sim modülleri için
 * mount/dispose yaşam döngüsü. Paket React'e bağımlı değildir; motorlar
 * vanilla/TS kalır, kabuk bu sözleşme üzerinden bağlanır (E1/T14).
 *
 * Sözleşme kuralları:
 * - Sim kimliği kapalı birlik tipidir (`pulse|ausculta|opaca`); bilinmeyen
 *   kimlik çalışma zamanında reddedilir.
 * - `mount` dönüşü zorunlu cleanup fonksiyonudur; modül kendi DOM alt ağacını
 *   dispose'ta kaldırmakla yükümlüdür, host kapsayıcıyı temizlemez.
 * - Modül `id` alanı istendiği simi bildirir; eşleşmeyen modül reddedilir.
 * - Host aynı hostta tek etkin oturum tutar; yeni mount önce öncekini kapatır.
 * - Promise ile yüklenen modül, route değişimi ya da host dispose sonrası
 *   geç gelirse mount edilmez (epoch ile iptal).
 */
export type SimulatorId = "pulse" | "ausculta" | "opaca";

export const SIMULATOR_IDS: readonly SimulatorId[] = ["pulse", "ausculta", "opaca"];

/** Çalışma zamanı koruması: birlik tipi dışındaki değerleri reddeder. */
export function isSimulatorId(value: unknown): value is SimulatorId {
  return typeof value === "string" && (SIMULATOR_IDS as readonly unknown[]).includes(value);
}

/**
 * Sim'in mount edildiği hedef (kabuk kapsayıcısı). Kök tsconfig DOM lib'i
 * içermediği için tip yapısaldır; gerçek `HTMLElement` bu sözleşmeye
 * atanabilir. `appendChild` parametresi bilinçli olarak `unknown`tur:
 * DOM düğüm tipini pakete bağlamadan modülün kendi kök elemanını eklemesini
 * sağlar ve `HTMLElement.appendChild` ile uyumludur.
 */
export interface SimMountTarget {
  appendChild(node: unknown): unknown;
}

/** Modüle taşınan oturum bağlamı; sim başına ayrıktır (veri izolasyonu). */
export interface SimMountContext {
  readonly simId: SimulatorId;
  /** AGENTS.md: zaman doğrudan okunmaz, bağımlılık olarak enjekte edilir. */
  readonly now: () => number;
  /**
   * Oturumdaki kullanıcının takma kimliği (ad/e-posta değil). Sim yerel
   * kayıtlarını bu kimlikle ayırır; yoksa anonim ad alanı kullanılır (PULSE-08).
   */
  readonly actorId?: string;
}

/** Modül `mount` dönüşünde zorunlu cleanup verir; idempotent olmalıdır. */
export type SimDispose = () => void;

/**
 * Lazy yüklenen sim modülünün minimum sözleşmesi. `id`, yükleyicinin istenen
 * simi döndürdüğünü doğrulamak içindir; host eşleşmeyen modülü mount etmez.
 */
export interface SimModule {
  readonly id: SimulatorId;
  mount(target: SimMountTarget, context: SimMountContext): SimDispose;
}

/** Lazy yükleme kaynağı (dinamik import sarmalayıcısı). */
export type SimModuleLoader = (simId: SimulatorId) => Promise<SimModule>;

export interface SimHostEvents {
  onLoading?: (simId: SimulatorId) => void;
  onReady?: (simId: SimulatorId) => void;
  onError?: (simId: SimulatorId, error: unknown) => void;
}

export interface SimHostOptions {
  load: SimModuleLoader;
  now: () => number;
  events?: SimHostEvents;
}

/** `mount`a eşlik eden, kabuktan gelen oturum bilgisi. */
export interface SimMountOptions {
  readonly actorId?: string;
}

/** Bir `mount` çağrısının kimliği; yalnız o çağrının oturumunu bırakmak için. */
export type SimMountToken = number;

export interface SimHost {
  /** Var olan oturumu kapatıp `simId` için yeni yükleme başlatır. */
  mount(target: SimMountTarget, simId: SimulatorId, options?: SimMountOptions): SimMountToken;
  /**
   * Yalnız `token` hâlâ son `mount` ise oturumu kapatır. Ertelenmiş cleanup'ın
   * (ör. React effect'i) araya giren yeni mount'u iptal etmesini önler (PLATFORM-01).
   */
  release(token: SimMountToken): void;
  /** Etkin oturumu kapatır, bekleyen yüklemeyi geçersiz kılar; idempotent. */
  dispose(): void;
  readonly active: SimulatorId | null;
  readonly loading: SimulatorId | null;
}

interface Session {
  simId: SimulatorId;
  dispose: SimDispose;
  disposed: boolean;
}

interface PendingLoad {
  epoch: number;
  simId: SimulatorId;
}

/**
 * SimHost fabrikası. Yükleme iptali epoch sayacıyla yapılır: her `mount` ve
 * `dispose` sayacı artırır; geç çözülen loader sonucu eskimişse yoksayılır.
 * Hata durumunda yarım oturum kurulmaz; `onError` çağrılır, host yeni
 * `mount` ile toparlanabilir. `load` senkron atsa bile bekleyen yükleme
 * temizlenir. `mount` fonksiyon değil de `undefined` döndürürse (JS
 * modülünde sözleşme ihlali) oturum kurulmadan `onError` bildirilir.
 * Yükleme sırasında başka bir `mount`/`dispose` araya girerse tamamlanan
 * modül mount edilip hemen cleanup'ı çağrılır. Temizlik fonksiyonu yeni bir
 * `mount` tetiklerse son çağrı kazanır.
 */
export function createSimHost(options: SimHostOptions): SimHost {
  let epoch = 0;
  let session: Session | null = null;
  let pending: PendingLoad | null = null;
  const events: SimHostEvents = options.events ?? {};

  function endSession(): void {
    if (session === null) {
      return;
    }
    const current = session;
    session = null;
    if (!current.disposed) {
      current.disposed = true;
      try {
        current.dispose();
      } catch (error: unknown) {
        events.onError?.(current.simId, error);
      }
    }
  }

  return {
    get active(): SimulatorId | null {
      return session?.simId ?? null;
    },
    get loading(): SimulatorId | null {
      return pending?.simId ?? null;
    },
    mount(target: SimMountTarget, simId: SimulatorId, mountOptions?: SimMountOptions): SimMountToken {
      if (!isSimulatorId(simId)) {
        throw new Error(`Bilinmeyen simülatör kimliği: ${String(simId)}`);
      }
      const loadEpoch = ++epoch;
      pending = null;
      endSession();
      if (loadEpoch !== epoch) {
        // Önceki oturumun temizliği yeni bir mount/dispose tetikledi; son çağrı kazanır.
        return loadEpoch;
      }
      pending = { epoch: loadEpoch, simId };
      events.onLoading?.(simId);

      let loadResult: Promise<SimModule>;
      try {
        loadResult = options.load(simId);
      } catch (error: unknown) {
        pending = null;
        events.onError?.(simId, error);
        return loadEpoch;
      }

      void loadResult.then(
        (module: SimModule) => {
          if (loadEpoch !== epoch) {
            return;
          }
          pending = null;
          if (module.id !== simId) {
            events.onError?.(
              simId,
              new Error(`Yükleyici ${simId} istendiğinde ${String(module.id)} modülü döndürdü`),
            );
            return;
          }
          const actorId = mountOptions?.actorId;
          const context: SimMountContext =
            actorId === undefined ? { simId, now: options.now } : { actorId, now: options.now, simId };
          let dispose: SimDispose | undefined;
          try {
            dispose = module.mount(target, context);
          } catch (error: unknown) {
            events.onError?.(simId, error);
            return;
          }
          if (typeof dispose !== "function") {
            // Sözleşme ihlali (örn. JS modülü cleanup yerine undefined):
            // oturum kurulmaz, onReady üretilmez, hata bildirilir.
            events.onError?.(
              simId,
              new Error(`Sim modülü ${simId} geçerli bir cleanup fonksiyonu döndürmedi`),
            );
            return;
          }
          if (loadEpoch !== epoch) {
            try {
              dispose();
            } catch (error: unknown) {
              events.onError?.(simId, error);
            }
            return;
          }
          session = { simId, dispose, disposed: false };
          events.onReady?.(simId);
        },
        (error: unknown) => {
          if (loadEpoch !== epoch) {
            return;
          }
          pending = null;
          events.onError?.(simId, error);
        },
      );
      return loadEpoch;
    },
    release(token: SimMountToken): void {
      if (token !== epoch) return;
      epoch += 1;
      pending = null;
      endSession();
    },
    dispose(): void {
      epoch += 1;
      pending = null;
      endSession();
    },
  };
}

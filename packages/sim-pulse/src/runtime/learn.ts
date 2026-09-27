/**
 * T213 — Pulse öğrenme tamamlamasını platforma bağlar (Z2).
 *
 * T205 host kanalı `@egemed/sim-host` `SimLearnPort`: `complete` açılışta
 * sunucudan okunur, `markComplete` tamamlanmayı yazar. Bu dal T205
 * birleşmesinden önceki tabandan türediği için kanal burada yapısal olarak
 * tanımlanır; alanlar T205 sözleşmesiyle birebir uyumludur (birleşmede
 * değişiklik gerekmez).
 *
 * Akış: T208 runtime'ı yerel öğrenme tamamlanınca `pulse:learn-complete`
 * yayınlar; köprü olayı BİR KEZ `markComplete(contentVersion)`e çevirir. Hata
 * sessizce yutulur; yeniden deneme bir sonraki açılıştadır (yeni köprü örneği).
 * İçerik sürümü runtime küresellerinden üretilir:
 * `pulse-<patern sayısı>-<müfredat sürümü>` (ör. `pulse-23-8`).
 */
import type { PulseRuntimeBridge } from "./host";

/** T205 `SimLearnPort` ile yapısal eş; ziyaretçide kanal hiç verilmez. */
export interface PulseLearnPort {
  readonly complete: boolean;
  markComplete(contentVersion: string): Promise<void>;
}

/** `packages/contracts/src/schemas/learn.ts` deseniyle aynı. */
export const PULSE_LEARN_VERSION_PATTERN = /^[a-z0-9._-]{1,40}$/;

/** T208 öğrenme kilidi açıldığında bir kez yayınlanan olay. */
export const PULSE_LEARN_COMPLETE_EVENT = "pulse:learn-complete";

/**
 * Mount bağlamından öğrenme kanalını yapısal olarak okur. Ziyaretçide (ve
 * kanalsız kurulumda) alan yoktur → `undefined`; eksik/bozuk nesne kanal
 * sayılmaz, simülatör kanalsız sürer.
 */
export function pulseLearnPort(context: unknown): PulseLearnPort | undefined {
  const candidate = (context as { readonly learn?: unknown } | undefined)?.learn;
  if (candidate === null || typeof candidate !== "object") return undefined;
  const port = candidate as Partial<PulseLearnPort>;
  return typeof port.complete === "boolean" && typeof port.markComplete === "function"
    ? (candidate as PulseLearnPort)
    : undefined;
}

/**
 * Runtime küresellerinden içerik sürümü: patern sayısı
 * `CardAIModel.ALL_MODES`ten, müfredat sürümü `PulseCurriculum.version`dan
 * gelir (ör. `pulse-23-8`). Eksik ya da desene uymayan değerde `null` döner ve
 * kayıt hiç denenmez.
 */
export function pulseContentVersion(model: unknown, curriculum: unknown): string | null {
  const modes = (model as { readonly ALL_MODES?: unknown } | null)?.ALL_MODES;
  const version = (curriculum as { readonly version?: unknown } | null)?.version;
  if (!Array.isArray(modes) || modes.length === 0) return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  const candidate = `pulse-${modes.length}-${version}`;
  return PULSE_LEARN_VERSION_PATTERN.test(candidate) ? candidate : null;
}

export interface PulseLearnBridge {
  /** `mountPulseRuntime`e verilir; `pulse:*` olaylarını dinler ve alt köprüye iletir. */
  readonly bridge: PulseRuntimeBridge;
  /**
   * Runtime küreselleri hazır olunca bir kez çağrılır. Yerel öğrenme açılışta
   * zaten tamamsa olay mount içinde gelir; kayıt burada tazelenir.
   */
  bind(readGlobal: (name: string) => unknown): void;
}

/**
 * `pulse:learn-complete` → `markComplete` köprüsü. Kanalsız (ziyaretçi) veya
 * sürüm çözülemeyen durumda kayıt yapılmaz; hata yutulur ve aynı oturumda
 * yeniden denenmez. Yerel izlenme kaydına dokunulmaz.
 */
export function createPulseLearnBridge(
  learn: PulseLearnPort | undefined,
  downstream?: PulseRuntimeBridge,
): PulseLearnBridge {
  let version: string | null = null;
  let sent = false;
  let pending = false;
  const mark = (): void => {
    if (sent || learn === undefined || version === null) return;
    sent = true;
    try {
      void learn.markComplete(version).catch(() => undefined);
    } catch {
      /* eşzamanlı hata da yutulur; yeniden deneme bir sonraki açılışta */
    }
  };
  return {
    bridge: {
      onEvent(type, detail) {
        if (type === PULSE_LEARN_COMPLETE_EVENT) {
          pending = true;
          mark();
        }
        downstream?.onEvent?.(type, detail);
      },
    },
    bind(readGlobal) {
      version = pulseContentVersion(readGlobal("CardAIModel"), readGlobal("PulseCurriculum"));
      if (pending) mark();
    },
  };
}

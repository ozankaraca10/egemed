/// <reference lib="dom" />
import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import { createStorageGamiRepo } from "../gamification/repo";
import type { PulseGamiRepo } from "../gamification/repo";
import { attachPulseGamification } from "./gami";
import { mountPulseRuntime } from "./host";
import type { PulseRuntimeBridge } from "./host";

export const DEFAULT_PULSE_RUNTIME_ASSET_BASE = "/sims/pulse/";

export interface PulseRuntimeModuleDeps {
  readonly assetBase?: string;
  /** Varsayılan: tarayıcı `localStorage`ı; erişilemezse oturumluk bellek. */
  readonly storage?: Storage;
  readonly bridge?: PulseRuntimeBridge;
  /** Verilmezse oyunlaştırma kullanıcı×sim ad alanlı yerel kayda yazılır. */
  readonly gamiRepository?: PulseGamiRepo;
  /** false: oyunlaştırma eklenmez (ör. salt kaynak karşılaştırması). */
  readonly gamiEnabled?: boolean;
}

/** Kayıt ad alanı: kullanıcı×sim. Anonim oturumun kaydı hesaba aktarılmaz (PULSE-08). */
export function pulseStorageNamespace(actorId: string | undefined): string {
  return actorId === undefined || actorId.length === 0
    ? "egemed:anon:pulse:"
    : `egemed:u:${encodeURIComponent(actorId)}:pulse:`;
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
  };
}

function browserStorage(): Storage {
  try {
    const storage = window.localStorage;
    const probe = "egemed:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage();
  }
}

/** Kaynak runtime'ı (EGEMED_PULSE/cardai) platform sim sözleşmesine bağlar. */
export function createPulseRuntimeModule(deps: PulseRuntimeModuleDeps = {}): SimModule {
  return {
    id: "pulse",
    mount(target: SimMountTarget, context: SimMountContext): SimDispose {
      const handle = mountPulseRuntime(target as unknown as HTMLElement, {
        assetBase: deps.assetBase ?? DEFAULT_PULSE_RUNTIME_ASSET_BASE,
        storage: deps.storage ?? browserStorage(),
        storageNamespace: pulseStorageNamespace(context.actorId),
        // Kaynak ilk girişte kalıcı (modal) tam ekran önerisi açar; platformda
        // gezinme kabuğundadır ve modal onu kilitler. Tam ekran düğmesi kalır.
        defaultPreferences: { "pulse.fsPromptDone": "1" },
        ...(deps.bridge === undefined ? {} : { bridge: deps.bridge }),
      });
      let detachGami: (() => void) | null = null;
      if (deps.gamiEnabled !== false) {
        try {
          detachGami = attachPulseGamification(handle, {
            now: context.now,
            repo: deps.gamiRepository ?? createStorageGamiRepo(handle.storage),
          });
        } catch {
          // Oyunlaştırma kurulamasa da simülatör çalışmaya devam eder.
          detachGami = null;
        }
      }
      return () => {
        detachGami?.();
        handle.dispose();
      };
    },
  };
}

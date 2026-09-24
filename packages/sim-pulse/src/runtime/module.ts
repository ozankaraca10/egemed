/// <reference lib="dom" />
import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import { mountPulseRuntime } from "./host";
import type { PulseRuntimeBridge } from "./host";

export const DEFAULT_PULSE_RUNTIME_ASSET_BASE = "/sims/pulse/";

export interface PulseRuntimeModuleDeps {
  readonly assetBase?: string;
  /** Varsayılan: tarayıcı `localStorage`ı; erişilemezse oturumluk bellek. */
  readonly storage?: Storage;
  readonly bridge?: PulseRuntimeBridge;
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
        ...(deps.bridge === undefined ? {} : { bridge: deps.bridge }),
      });
      return () => handle.dispose();
    },
  };
}

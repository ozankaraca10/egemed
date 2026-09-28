/// <reference lib="dom" />
import { audienceOf, audienceShowsGamification } from "@egemed/sim-host";
import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import type { PulseAttemptRecord } from "../gamification/attempt";
import { createStorageGamiRepo } from "../gamification/repo";
import type { PulseGamiRepo } from "../gamification/repo";
import { attachPulseAudience } from "./audience";
import { attachPulseChrome } from "./chrome";
import { attachPulseGamification } from "./gami";
import { mountPulseRuntime } from "./host";
import type { PulseRuntimeBridge } from "./host";
import { createPulseLearnBridge, pulseLearnPort } from "./learn";
import { attachPulseServerRequired, createPulseServerItemsBridge } from "./serverItems";

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
      // T213: öğrenme kanalı (T205) oturumlu kullanıcıda gelir;
      // ziyaretçide/kanalsız kurulumda yoktur ve sim kanalsız sürer.
      const learn = pulseLearnPort(context);
      const learnBridge = createPulseLearnBridge(learn, deps.bridge);
      // A3.3: uygulama/değerlendirme maddeleri sunucu oturumundan gelir (ADR-009).
      // Kanal yoksa (ziyaretçi, API'siz üretim) kartlar kapalı tutulur.
      const server = context.sessions === undefined ? null : createPulseServerItemsBridge(context.sessions, learnBridge.bridge);
      const handle = mountPulseRuntime(target as unknown as HTMLElement, {
        assetBase: deps.assetBase ?? DEFAULT_PULSE_RUNTIME_ASSET_BASE,
        storage: deps.storage ?? browserStorage(),
        storageNamespace: pulseStorageNamespace(context.actorId),
        // Kaynak ilk girişte kalıcı (modal) tam ekran önerisi açar; platformda
        // gezinme kabuğundadır ve modal onu kilitler. Tam ekran düğmesi kalır.
        defaultPreferences: { "pulse.fsPromptDone": "1" },
        unifiedChrome: context.setChrome !== undefined,
        // Başka cihazda tamamlanmış öğrenme vaka/sınav kilidini açar; yerel
        // izlenme kaydı değişmez.
        learnComplete: learn?.complete === true,
        ...(server === null ? {} : { serverItems: server.port }),
        bridge: server === null ? learnBridge.bridge : server.bridge,
      });
      // İçerik sürümü (`pulse-23-8`) runtime küresellerinden çözülür; yerel
      // öğrenme açılışta zaten tamamsa olay mount içinde gelir ve kayıt burada
      // tamamlanır.
      learnBridge.bind((name) => handle.global(name));
      const detachServer = server?.attach(handle) ?? null;
      // Oturum kanalı yoksa uygulama/değerlendirme kartları kapalıdır (Ausculta/
      // Opaca ile aynı); ziyaretçide kartları zaten kitle kilitleri kapatır.
      const detachRequired = server === null && audienceOf(context) !== "visitor" ? attachPulseServerRequired(handle) : null;
      // Kitle (T173, sim-host T172 sözleşmesi): oyunlaştırma yalnız öğrenciye
      // çizilir (öğretim üyesi/ziyaretçi rozet, liderlik, İlerlemem görmez;
      // `reportAttempt` bağlamda olsa bile bu köprü hiç kurulmadığı için
      // çağrılmaz).
      const audience = audienceOf(context);
      let detachGami: (() => void) | null = null;
      if (deps.gamiEnabled !== false && audienceShowsGamification(audience)) {
        try {
          const reportAttempt = context.reportAttempt;
          const gamification = context.gamification;
          detachGami = attachPulseGamification(handle, {
            now: context.now,
            repo: deps.gamiRepository ?? createStorageGamiRepo(handle.storage),
            // A3.3: sunucu oturumunda deneme SUNUCUDA yazılır; istemci yerel
            // skor kaydı yapmaz (çift kayıt yok, ADR-008/009).
            recordAttempts: server === null,
            ...(reportAttempt === undefined
              ? {}
              : { reportAttempt: (record: PulseAttemptRecord) => reportAttempt(record) }),
            ...(gamification === undefined ? {} : { gamification }),
          });
        } catch {
          // Oyunlaştırma kurulamasa da simülatör çalışmaya devam eder.
          detachGami = null;
        }
      }
      let detachChrome: (() => void) | null = null;
      if (context.setChrome !== undefined) {
        // Birleşik barda kaynağın açılış sayfası atlanır (kullanıcı kararı):
        // Pulse, Opaca/Ausculta gibi doğrudan mod seçimiyle açılır.
        (handle.global("CardAILanding") as { enter?: () => void } | undefined)?.enter?.();
        detachChrome = attachPulseChrome(handle, context.setChrome);
      }
      const detachAudience = attachPulseAudience(handle, context);
      return () => {
        detachAudience();
        detachChrome?.();
        detachGami?.();
        detachRequired?.();
        detachServer?.();
        handle.dispose();
      };
    },
  };
}

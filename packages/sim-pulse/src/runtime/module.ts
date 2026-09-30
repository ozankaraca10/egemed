/// <reference lib="dom" />
import { audienceOf, audienceShowsGamification } from "@egemed/sim-host";
import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
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
      const eventBridge = server?.bridge ?? learnBridge.bridge;
      let navigationReady = false;
      let suppressNavigationReport = false;
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
        bridge: {
          ...eventBridge,
          onEvent(type, detail) {
            eventBridge.onEvent?.(type, detail);
            if (type !== "cardai:view" || !navigationReady || context.navigation === undefined) return;
            if (suppressNavigationReport) {
              suppressNavigationReport = false;
              return;
            }
            const view = (detail as { view?: string } | null)?.view;
            const key = view === "modes" ? "modlar"
              : view === "sim" ? "ogrenme"
                : view === "case" ? "uygulama"
                  : view === "quiz" ? "degerlendirme"
                    : view === "results" ? "sonuc" : null;
            if (key !== null) context.navigation.report(key);
          },
        },
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
      // çizilir (öğretim üyesi/ziyaretçi rozet, liderlik, İlerlemem görmez).
      // A4 (ADR-009): puanlı deneme kanalı yoktur; yalnız puansız öğrenme kaydı
      // sunucuya gider (`reportLearn`).
      const audience = audienceOf(context);
      let detachGami: (() => void) | null = null;
      if (deps.gamiEnabled !== false && audienceShowsGamification(audience)) {
        try {
          const reportLearn = context.reportLearn;
          const gamification = context.gamification;
          detachGami = attachPulseGamification(handle, {
            now: context.now,
            repo: deps.gamiRepository ?? createStorageGamiRepo(handle.storage),
            // A3.3: sunucu oturumunda deneme SUNUCUDA yazılır; istemci yerel
            // skor kaydı yapmaz (çift kayıt yok, ADR-008/009).
            recordAttempts: server === null,
            ...(reportLearn === undefined ? {} : { reportLearn }),
            ...(gamification === undefined ? {} : { gamification }),
            ...(context.rewards === undefined ? {} : { rewards: context.rewards }),
          });
        } catch {
          // Oyunlaştırma kurulamasa da simülatör çalışmaya devam eder.
          detachGami = null;
        }
      }
      let detachChrome: (() => void) | null = null;
      if (context.setChrome !== undefined || context.navigation !== undefined) {
        // Birleşik barda kaynağın açılış sayfası atlanır (kullanıcı kararı):
        // Pulse, Opaca/Ausculta gibi doğrudan mod seçimiyle açılır.
        (handle.global("CardAILanding") as { enter?: () => void } | undefined)?.enter?.();
        if (context.setChrome !== undefined) detachChrome = attachPulseChrome(handle, context.setChrome);
      }
      let unsubscribeNavigation: (() => void) | null = null;
      if (context.navigation !== undefined) {
        const controller = handle.global("CardAIController") as {
          readonly state: { readonly activeView: string; readonly assessed: boolean };
          showView(view: string): void;
        } | undefined;
        const routeView = (key: string | null): string | null => key === "modlar" ? "modes"
          : key === "ogrenme" ? "sim"
            : key === "uygulama" ? "case"
              : key === "degerlendirme" ? "quiz"
                : key === "sonuc" ? "results" : null;
        const keyForView = (view: string): string | null => view === "modes" ? "modlar"
          : view === "sim" || view === "tutorial" ? "ogrenme"
            : view === "case" ? "uygulama"
              : view === "quiz" ? "degerlendirme"
                : view === "results" ? "sonuc" : null;
        const applyRoute = (key: string | null): void => {
          if (controller === undefined) return;
          if (key !== null && !["modlar", "ogrenme", "uygulama", "degerlendirme", "sonuc"].includes(key)) return;
          const requested = key === null ? "modes" : routeView(key);
          if (requested === null || (requested === "results" && !controller.state.assessed)) {
            context.navigation?.report(keyForView(controller.state.activeView) ?? "modlar", { replace: true });
            return;
          }
          suppressNavigationReport = true;
          controller.showView(requested);
          const actualKey = keyForView(controller.state.activeView) ?? "modlar";
          if (actualKey !== key) context.navigation?.report(actualKey, { replace: true });
        };

        if (context.navigation.initial !== null) {
          applyRoute(context.navigation.initial);
          suppressNavigationReport = false;
        }
        navigationReady = true;
        unsubscribeNavigation = context.navigation.subscribe((key) => applyRoute(key));
      }
      const detachAudience = attachPulseAudience(handle, context);
      return () => {
        detachAudience();
        unsubscribeNavigation?.();
        detachChrome?.();
        detachGami?.();
        detachRequired?.();
        detachServer?.();
        handle.dispose();
      };
    },
  };
}

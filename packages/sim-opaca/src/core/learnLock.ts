import type { SimLearnPort } from "@egemed/sim-host";
import { LIBRARY_ITEM_COUNT, LIBRARY_ITEM_KEYS } from "../data/library";
import type { StoragePort } from "./reducer";
import type { Mode } from "./types";

/** T218 — öğrenme tamamlama tespiti ve mod kilidi (depo sahibi kararı, 27 Eyl 2026):
 *  öğrenme kütüphanesindeki HER konu en az bir kez açılmadan uygulama ve değerlendirme
 *  kilitlidir. Kayıt, simin kullanıcı×sim ad alanlı deposunda tutulur (`opaca.learn.opened`);
 *  host kanalı (`SimLearnPort`) varsa tamamlanma sunucuya da yazılır. Saf modül:
 *  React/DOM yok, `Date.now()` yok. Ausculta T209 çözümünün Opaca karşılığıdır. */

/** Açılan kütüphane anahtarlarının kalıcı listesi (JSON dizi). */
export const LEARN_OPENED_KEY = "opaca.learn.opened";

/** Kütüphane listesinden türetilen kısa, deterministik içerik sürümü.
 *  Sözleşme deseni `^[a-z0-9._-]{1,40}$` (packages/contracts/src/schemas/learn.ts). */
export function contentVersion(keys: readonly string[] = LIBRARY_ITEM_KEYS): string {
  let hash = 5381;
  for (const key of keys) {
    for (let index = 0; index < key.length; index += 1) {
      hash = (Math.imul(hash, 33) ^ key.charCodeAt(index)) >>> 0;
    }
  }
  return `lib-${keys.length}-${hash.toString(36)}`;
}

export const OPACA_CONTENT_VERSION = contentVersion(LIBRARY_ITEM_KEYS);

/** Bozuk/eksik kayıt güvenle boş küme sayılır; kütüphanede artık olmayan anahtarlar yok sayılır. */
export function parseOpened(raw: string | null, libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS): Set<string> {
  if (raw === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const allowed = new Set(libraryKeys);
    return new Set(parsed.filter((key): key is string => typeof key === "string" && allowed.has(key)));
  } catch {
    return new Set();
  }
}

export function loadOpened(storage: StoragePort, libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS): Set<string> {
  try {
    return parseOpened(storage.get(LEARN_OPENED_KEY), libraryKeys);
  } catch {
    return new Set();
  }
}

export function saveOpened(storage: StoragePort, opened: ReadonlySet<string>): void {
  try {
    storage.set(LEARN_OPENED_KEY, JSON.stringify([...opened].sort()));
  } catch {
    /* depolama kapalı/dolu: kayıt yazılamaz, kilit yerel kümeye göre yine açılır */
  }
}

/** Öğrenme ekranı ilerleme satırı: "Öğrenme: X/Y konu incelendi". */
export function learnProgressText(opened: number, total: number): string {
  return `Öğrenme: ${opened}/${total} konu incelendi`;
}

/** Mod seçimi kilidi metni: "Önce öğrenme modunu tamamlayın: X/Y konu incelendi." */
export function learnLockText(opened: number, total: number): string {
  return `Önce öğrenme modunu tamamlayın: ${opened}/${total} konu incelendi.`;
}

/** Düello bağlamıyla gelip kilitli kalan kullanıcıya öğrenme ekranında gösterilir. */
export function challengeLearnLockText(opened: number, total: number): string {
  return `Meydan okuma için önce öğrenme modunu tamamlayın: ${opened}/${total} konu incelendi.`;
}

/** Öğrenme her zaman açıktır; uygulama/değerlendirme yalnız tamamlanınca. */
export function canStartMode(mode: Mode, complete: boolean): boolean {
  return mode === "learn" || complete;
}

export interface LearnCompletionNotifier {
  /** Yerel küme tamamlandığı ilk anda host portuna bir kez yazar; hata sessizce yutulur
   *  (yeniden deneme bir sonraki açılışta, yeni notifier ile). */
  notify(localComplete: boolean): void;
}

export function createLearnCompletionNotifier(
  learn: SimLearnPort | undefined,
  version: string,
): LearnCompletionNotifier {
  let sent = false;
  return {
    notify(localComplete: boolean): void {
      if (!localComplete || sent || learn === undefined) return;
      sent = true;
      try {
        void learn.markComplete(version).catch(() => undefined);
      } catch {
        /* eşzamanlı hata da yutulur */
      }
    },
  };
}

export interface LearnSnapshot {
  readonly opened: ReadonlySet<string>;
  readonly openedCount: number;
  readonly total: number;
  readonly hostComplete: boolean;
  readonly localComplete: boolean;
  /** Kilit kararı: host kaydı VEYA yerel kümenin tamamı. */
  readonly complete: boolean;
  readonly lockText: string;
  readonly progressText: string;
}

export interface LearnTrackerDeps {
  readonly storage: StoragePort;
  readonly learn?: SimLearnPort | undefined;
  readonly libraryKeys?: readonly string[];
  readonly version?: string;
}

/** Öğrenme ilerlemesinin tek doğruluk kaynağı: kalıcı açıldı kümesi + host kanalı.
 *  React dışıdır; `LearnGate` sağlayıcısı bunu abonelikle yüzeye taşır. */
export interface LearnTracker {
  snapshot(): LearnSnapshot;
  markOpened(key: string): LearnSnapshot;
  /** Açılışta bir kez: yerel küme zaten tamamsa (önceki hata/eksik sürüm) kaydı tazeler. */
  notify(): void;
  subscribe(listener: () => void): () => void;
}

export function createLearnTracker(deps: LearnTrackerDeps): LearnTracker {
  const libraryKeys = deps.libraryKeys ?? LIBRARY_ITEM_KEYS;
  const version = deps.version ?? contentVersion(libraryKeys);
  const hostComplete = deps.learn?.complete === true;
  const total = libraryKeys.length;
  const allowed = new Set(libraryKeys);
  const notifier = createLearnCompletionNotifier(deps.learn, version);
  const listeners = new Set<() => void>();
  let opened = loadOpened(deps.storage, libraryKeys);
  let cached: LearnSnapshot | null = null;

  const snapshot = (): LearnSnapshot => {
    if (cached !== null) return cached;
    const openedCount = libraryKeys.reduce((sum, key) => (opened.has(key) ? sum + 1 : sum), 0);
    const localComplete = total > 0 && openedCount === total;
    cached = {
      opened,
      openedCount,
      total,
      hostComplete,
      localComplete,
      complete: hostComplete || localComplete,
      lockText: learnLockText(openedCount, total),
      progressText: learnProgressText(openedCount, total),
    };
    return cached;
  };

  return {
    snapshot,
    notify(): void {
      notifier.notify(snapshot().localComplete);
    },
    markOpened(key: string): LearnSnapshot {
      if (!allowed.has(key) || opened.has(key)) return snapshot();
      opened = new Set(opened).add(key);
      saveOpened(deps.storage, opened);
      cached = null;
      const next = snapshot();
      notifier.notify(next.localComplete);
      for (const listener of [...listeners]) listener();
      return next;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Sağlayıcı olmadan (bağımsız/eksik kurulum) güvenli varsayılan: kilitli. */
export const LOCKED_LEARN_SNAPSHOT: LearnSnapshot = {
  opened: new Set(),
  openedCount: 0,
  total: LIBRARY_ITEM_COUNT,
  hostComplete: false,
  localComplete: false,
  complete: false,
  lockText: learnLockText(0, LIBRARY_ITEM_COUNT),
  progressText: learnProgressText(0, LIBRARY_ITEM_COUNT),
};

import type { SimLearnPort } from "@egemed/sim-host";
import { LIBRARY_ITEM_COUNT, LIBRARY_ITEM_KEYS } from "../data/library";
import type { StoragePort } from "./reducer";
import type { Mode } from "./types";

/** T209 — öğrenme tamamlama tespiti ve mod kilidi (depo sahibi kararı, 27 Eyl 2026):
 *  öğrenme kütüphanesindeki HER ses öğesi en az bir kez dinlenmeden uygulama ve
 *  değerlendirme kilitlidir. Kayıt, simin kullanıcı×sim ad alanlı deposunda tutulur
 *  (`ausculta.learn.listened`); host kanalı (`SimLearnPort`) varsa tamamlanma sunucuya
 *  da yazılır. Saf modül: React/DOM yok, `Date.now()` yok. */

/** Dinlenen kütüphane anahtarlarının kalıcı listesi (JSON dizi). */
export const LEARN_LISTENED_KEY = "ausculta.learn.listened";

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

export const AUSCULTA_CONTENT_VERSION = contentVersion(LIBRARY_ITEM_KEYS);

/** Bozuk/eksik kayıt güvenle boş küme sayılır; kütüphanede artık olmayan anahtarlar yok sayılır. */
export function parseListened(raw: string | null, libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS): Set<string> {
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

export function loadListened(storage: StoragePort, libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS): Set<string> {
  try {
    return parseListened(storage.get(LEARN_LISTENED_KEY), libraryKeys);
  } catch {
    return new Set();
  }
}

export function saveListened(storage: StoragePort, listened: ReadonlySet<string>): void {
  try {
    storage.set(LEARN_LISTENED_KEY, JSON.stringify([...listened].sort()));
  } catch {
    /* depolama kapalı/dolu: kayıt yazılamaz, kilit yerel kümeye göre yine açılır */
  }
}

/** Öğrenme ekranı ilerleme satırı: "Öğrenme: X/Y ses dinlendi". */
export function learnProgressText(listened: number, total: number): string {
  return `Öğrenme: ${listened}/${total} ses dinlendi`;
}

/** Mod seçimi kilidi metni: "Önce öğrenme modunu tamamlayın: X/Y ses dinlendi." */
export function learnLockText(listened: number, total: number): string {
  return `Önce öğrenme modunu tamamlayın: ${listened}/${total} ses dinlendi.`;
}

/** Düello bağlamıyla gelip kilitli kalan kullanıcıya öğrenme ekranında gösterilir. */
export function challengeLearnLockText(listened: number, total: number): string {
  return `Meydan okuma için önce öğrenme modunu tamamlayın: ${listened}/${total} ses dinlendi.`;
}

/** Öğrenme her zaman açıktır; uygulama/değerlendirme yalnız tamamlanınca. */
export function canStartMode(mode: Mode, complete: boolean): boolean {
  return mode === "learn" || complete;
}

/** Oynatma başarısı → dinlenen anahtar eşlemesi: yalnız sahada gerçekten oynayan
 *  (playing) ve öğenin dinleme noktalarından birine yerleşmiş stetoskop öğeyi işaretler;
 *  yalnız seçmek (playing false) yetmez. */
export function listenedKeyOnPlay(
  playing: boolean,
  pointId: string | null,
  itemKey: string,
  itemPointIds: readonly string[],
): string | null {
  if (!playing || pointId === null || !itemPointIds.includes(pointId)) return null;
  return itemKey;
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
  readonly listened: ReadonlySet<string>;
  readonly listenedCount: number;
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

/** Öğrenme ilerlemesinin tek doğruluk kaynağı: kalıcı dinlendi kümesi + host kanalı.
 *  React dışıdır; `LearnGate` sağlayıcısı bunu abonelikle yüzeye taşır. */
export interface LearnTracker {
  snapshot(): LearnSnapshot;
  markListened(key: string): LearnSnapshot;
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
  let listened = loadListened(deps.storage, libraryKeys);
  let cached: LearnSnapshot | null = null;

  const snapshot = (): LearnSnapshot => {
    if (cached !== null) return cached;
    const listenedCount = libraryKeys.reduce((sum, key) => (listened.has(key) ? sum + 1 : sum), 0);
    const localComplete = total > 0 && listenedCount === total;
    cached = {
      listened,
      listenedCount,
      total,
      hostComplete,
      localComplete,
      complete: hostComplete || localComplete,
      lockText: learnLockText(listenedCount, total),
      progressText: learnProgressText(listenedCount, total),
    };
    return cached;
  };

  return {
    snapshot,
    notify(): void {
      notifier.notify(snapshot().localComplete);
    },
    markListened(key: string): LearnSnapshot {
      if (!allowed.has(key) || listened.has(key)) return snapshot();
      listened = new Set(listened).add(key);
      saveListened(deps.storage, listened);
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
  listened: new Set(),
  listenedCount: 0,
  total: LIBRARY_ITEM_COUNT,
  hostComplete: false,
  localComplete: false,
  complete: false,
  lockText: learnLockText(0, LIBRARY_ITEM_COUNT),
  progressText: learnProgressText(0, LIBRARY_ITEM_COUNT),
};

import type { SimLearnPort } from "@egemed/sim-host";
import { LIBRARY_ITEM_COUNT, LIBRARY_ITEM_KEYS } from "../data/library";
import { libraryItem } from "../data/terminology";
import { libraryExamples } from "./examples";
import type { StoragePort } from "./reducer";
import type { Mode } from "./types";

/** T218 — öğrenme tamamlama tespiti ve mod kilidi (depo sahibi kararı, 27 Eyl 2026):
 *  öğrenme kütüphanesindeki HER konu tamamlanmadan uygulama ve değerlendirme kilitlidir.
 *  T320 (3 Eki 2026, depo sahibi: "bir kategoride her görüntüde 15 sn geçirmesi gerek"):
 *  konu, öğrenme örneklerinin (1–4 film) HER BİRİ görüntü yüklüyken ve sayfa görünürken en az
 *  `LEARN_VIEW_SECONDS` saniye incelenince tamamlanır; yalnız seçmek sayılmaz. Kayıt, simin
 *  kullanıcı×sim ad alanlı deposunda tutulur (`opaca.learn.viewed`, `{"konu#örnekSırası": saniye}`);
 *  host kanalı (`SimLearnPort`) varsa tamamlanma sunucuya da yazılır. Saf modül: React/DOM yok,
 *  `Date.now()` yok. Ausculta T308 çözümünün Opaca karşılığıdır. */

/** Film başına gereken inceleme süresi (saniye). */
export const LEARN_VIEW_SECONDS = 15;

/** Örnek → incelenen saniye haritası (JSON nesne). Eski T218 "açıldı" listesi
 *  (`opaca.learn.opened`) farklı ölçüt olduğu için okunmaz. */
export const LEARN_VIEWED_KEY = "opaca.learn.viewed";

/** Örnek kaydının anahtarı: `<konu>#<örnek sırası>`. */
export function exampleKey(key: string, index: number): string {
  return `${key}#${index}`;
}

/** Konunun öğrenme örneği (film) sayısı. */
function defaultExampleCount(key: string): number {
  const item = libraryItem(key);
  return item ? libraryExamples(item).length : 0;
}

function exampleKeys(libraryKeys: readonly string[], countOf: (key: string) => number): string[] {
  return libraryKeys.flatMap((key) => Array.from({ length: countOf(key) }, (_, index) => exampleKey(key, index)));
}

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

/** Bozuk/eksik kayıt güvenle boş harita sayılır; var olmayan örnek anahtarı ve geçersiz
 *  değerler yok sayılır, değerler [0, LEARN_VIEW_SECONDS] aralığına kırpılır. */
export function parseViewed(
  raw: string | null,
  libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS,
  countOf: (key: string) => number = defaultExampleCount,
): Map<string, number> {
  const out = new Map<string, number>();
  if (raw === null) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    const allowed = new Set(exampleKeys(libraryKeys, countOf));
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (allowed.has(key) && typeof value === "number" && Number.isFinite(value) && value > 0) {
        out.set(key, Math.min(LEARN_VIEW_SECONDS, value));
      }
    }
    return out;
  } catch {
    return out;
  }
}

export function loadViewed(
  storage: StoragePort,
  libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS,
  countOf: (key: string) => number = defaultExampleCount,
): Map<string, number> {
  try {
    return parseViewed(storage.get(LEARN_VIEWED_KEY), libraryKeys, countOf);
  } catch {
    return new Map();
  }
}

export function saveViewed(storage: StoragePort, seconds: ReadonlyMap<string, number>): void {
  try {
    const sorted = [...seconds.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    storage.set(LEARN_VIEWED_KEY, JSON.stringify(Object.fromEntries(sorted.map(([key, value]) => [key, Math.round(value * 10) / 10]))));
  } catch {
    /* depolama kapalı/dolu: kayıt yazılamaz, kilit yerel haritaya göre yine açılır */
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
  /** Tüm filmleri incelenmiş (tamamlanmış) konular. */
  readonly opened: ReadonlySet<string>;
  /** Örnek (`exampleKey`) başına incelenen saniye (0–LEARN_VIEW_SECONDS). */
  readonly seconds: ReadonlyMap<string, number>;
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
  /** Konunun film sayısı; verilmezse öğrenme örneklerinden. */
  readonly exampleCount?: (key: string) => number;
}

/** Öğrenme ilerlemesinin tek doğruluk kaynağı: kalıcı inceleme süreleri + host kanalı.
 *  React dışıdır; `LearnGate` sağlayıcısı bunu abonelikle yüzeye taşır. */
export interface LearnTracker {
  snapshot(): LearnSnapshot;
  /** Film görünürken geçen süreyi konunun örneğine ekler; konunun tüm filmleri eşiği
   *  aşınca konu tamamlanır. */
  addView(key: string, exampleIndex: number, ms: number): LearnSnapshot;
  /** Açılışta bir kez: yerel küme zaten tamamsa (önceki hata/eksik sürüm) kaydı tazeler. */
  notify(): void;
  subscribe(listener: () => void): () => void;
}

export function createLearnTracker(deps: LearnTrackerDeps): LearnTracker {
  const libraryKeys = deps.libraryKeys ?? LIBRARY_ITEM_KEYS;
  const version = deps.version ?? contentVersion(libraryKeys);
  const hostComplete = deps.learn?.complete === true;
  const total = libraryKeys.length;
  const countOf = deps.exampleCount ?? defaultExampleCount;
  const allowed = new Set(libraryKeys);
  const notifier = createLearnCompletionNotifier(deps.learn, version);
  const listeners = new Set<() => void>();
  let seconds = loadViewed(deps.storage, libraryKeys, countOf);
  const topicDone = (key: string): boolean => {
    const count = countOf(key);
    return count > 0 && Array.from({ length: count }, (_, index) => seconds.get(exampleKey(key, index)) ?? 0).every((value) => value >= LEARN_VIEW_SECONDS);
  };
  let unsavedMs = 0;
  let cached: LearnSnapshot | null = null;

  const snapshot = (): LearnSnapshot => {
    if (cached !== null) return cached;
    const opened = new Set(libraryKeys.filter(topicDone));
    const openedCount = opened.size;
    const localComplete = total > 0 && openedCount === total;
    cached = {
      opened,
      seconds,
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
    addView(key: string, exampleIndex: number, ms: number): LearnSnapshot {
      const id = exampleKey(key, exampleIndex);
      const before = seconds.get(id) ?? 0;
      const valid = allowed.has(key) && Number.isInteger(exampleIndex) && exampleIndex >= 0 && exampleIndex < countOf(key);
      if (!valid || !(ms > 0) || before >= LEARN_VIEW_SECONDS) return snapshot();
      const after = Math.min(LEARN_VIEW_SECONDS, before + ms / 1000);
      seconds = new Map(seconds).set(id, after);
      unsavedMs += ms;
      const crossed = after >= LEARN_VIEW_SECONDS;
      // Depoya yaklaşık 3 sn'de bir ve eşik aşılınca yazılır.
      if (crossed || unsavedMs >= 3000) {
        unsavedMs = 0;
        saveViewed(deps.storage, seconds);
      }
      cached = null;
      const next = snapshot();
      if (crossed) notifier.notify(next.localComplete);
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
  seconds: new Map(),
  openedCount: 0,
  total: LIBRARY_ITEM_COUNT,
  hostComplete: false,
  localComplete: false,
  complete: false,
  lockText: learnLockText(0, LIBRARY_ITEM_COUNT),
  progressText: learnProgressText(0, LIBRARY_ITEM_COUNT),
};

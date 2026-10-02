import type { SimLearnPort } from "@egemed/sim-host";
import { LIBRARY_ITEM_COUNT, LIBRARY_ITEM_KEYS } from "../data/library";
import { learnExamples } from "../data/learnSets";
import type { StoragePort } from "./reducer";
import type { Mode } from "./types";

/** T209 — öğrenme tamamlama tespiti ve mod kilidi (depo sahibi kararı, 27 Eyl 2026):
 *  öğrenme kütüphanesindeki HER ses öğesi dinlenmeden uygulama ve değerlendirme kilitlidir.
 *  T308 (2 Eki 2026, depo sahibi: "tüm örneklerin dinlenmesini esas alalım"): konu,
 *  örneklerinin (sentetik + gerçek hastalar; sayısı konuya göre değişir) HER BİRİ sahnede
 *  ses gerçekten çalarken en az `LEARN_EXAMPLE_SECONDS` saniye dinlenince tamamlanır;
 *  tıklama sayılmaz. Kayıt, simin kullanıcı×sim ad alanlı deposunda tutulur
 *  (`ausculta.learn.examples`, `{"konu#örnekSırası": saniye}`); host kanalı
 *  (`SimLearnPort`) varsa tamamlanma sunucuya da yazılır. Saf modül: React/DOM yok. */

/** Örnek başına gereken dinleme süresi (saniye): tıklamanın sayılmaması için kısa eşik. */
export const LEARN_EXAMPLE_SECONDS = 5;

/** Örnek → dinlenen saniye haritası (JSON nesne). Eski T307 konu-saniye haritası
 *  (`ausculta.learn.seconds`) farklı anahtar biçiminde olduğu için okunmaz. */
export const LEARN_LISTENED_KEY = "ausculta.learn.examples";

/** Örnek kaydının anahtarı: `<konu>#<örnek sırası (0 = sentetik)>`. */
export function exampleKey(key: string, index: number): string {
  return `${key}#${index}`;
}

/** Konunun öğrenme örneği sayısı (sentetik + gerçek hastalar). */
function defaultExampleCount(key: string): number {
  return learnExamples(key).length;
}

/** Geçerli örnek anahtarları: her konu için 0..sayı-1. */
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

export const AUSCULTA_CONTENT_VERSION = contentVersion(LIBRARY_ITEM_KEYS);

/** Bozuk/eksik kayıt güvenle boş harita sayılır; var olmayan örnek anahtarı ve geçersiz
 *  değerler yok sayılır, değerler [0, LEARN_EXAMPLE_SECONDS] aralığına kırpılır. */
export function parseListened(
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
        out.set(key, Math.min(LEARN_EXAMPLE_SECONDS, value));
      }
    }
    return out;
  } catch {
    return out;
  }
}

export function loadListened(
  storage: StoragePort,
  libraryKeys: readonly string[] = LIBRARY_ITEM_KEYS,
  countOf: (key: string) => number = defaultExampleCount,
): Map<string, number> {
  try {
    return parseListened(storage.get(LEARN_LISTENED_KEY), libraryKeys, countOf);
  } catch {
    return new Map();
  }
}

export function saveListened(storage: StoragePort, seconds: ReadonlyMap<string, number>): void {
  try {
    const sorted = [...seconds.entries()].sort(([a], [b]) => a.localeCompare(b));
    storage.set(LEARN_LISTENED_KEY, JSON.stringify(Object.fromEntries(sorted.map(([key, value]) => [key, Math.round(value * 10) / 10]))));
  } catch {
    /* depolama kapalı/dolu: kayıt yazılamaz, kilit oturum içi haritaya göre yine açılır */
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

/** Dinleme tıkı → öğe eşlemesi: yalnız ses çalarken ve stetoskop öğenin dinleme
 *  noktalarından birindeyken süre sayılır; yalnız seçmek ya da tıklamak yetmez. */
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
  /** Tüm örnekleri dinlenmiş konular. */
  readonly listened: ReadonlySet<string>;
  /** Örnek (`exampleKey`) başına dinlenen saniye (0–LEARN_EXAMPLE_SECONDS). */
  readonly seconds: ReadonlyMap<string, number>;
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
  /** Konunun örnek sayısı; verilmezse öğrenme setinden. */
  readonly exampleCount?: (key: string) => number;
}

/** Öğrenme ilerlemesinin tek doğruluk kaynağı: kalıcı dinlendi kümesi + host kanalı.
 *  React dışıdır; `LearnGate` sağlayıcısı bunu abonelikle yüzeye taşır. */
export interface LearnTracker {
  snapshot(): LearnSnapshot;
  /** Ses çalarken geçen süreyi konunun örneğine ekler; konunun tüm örnekleri eşiği
   *  aşınca konu tamamlanır. */
  addListen(key: string, exampleIndex: number, ms: number): LearnSnapshot;
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
  let seconds = loadListened(deps.storage, libraryKeys, countOf);
  const topicDone = (key: string): boolean => {
    const count = countOf(key);
    return count > 0 && Array.from({ length: count }, (_, index) => seconds.get(exampleKey(key, index)) ?? 0).every((value) => value >= LEARN_EXAMPLE_SECONDS);
  };
  let unsavedMs = 0;
  let cached: LearnSnapshot | null = null;

  const snapshot = (): LearnSnapshot => {
    if (cached !== null) return cached;
    const listened = new Set(libraryKeys.filter(topicDone));
    const listenedCount = listened.size;
    const localComplete = total > 0 && listenedCount === total;
    cached = {
      listened,
      seconds,
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
    addListen(key: string, exampleIndex: number, ms: number): LearnSnapshot {
      const id = exampleKey(key, exampleIndex);
      const before = seconds.get(id) ?? 0;
      const valid = allowed.has(key) && Number.isInteger(exampleIndex) && exampleIndex >= 0 && exampleIndex < countOf(key);
      if (!valid || !(ms > 0) || before >= LEARN_EXAMPLE_SECONDS) return snapshot();
      const after = Math.min(LEARN_EXAMPLE_SECONDS, before + ms / 1000);
      seconds = new Map(seconds).set(id, after);
      unsavedMs += ms;
      const crossed = after >= LEARN_EXAMPLE_SECONDS;
      // Depoya yaklaşık 2 sn'de bir ve eşik aşılınca yazılır.
      if (crossed || unsavedMs >= 2000) {
        unsavedMs = 0;
        saveListened(deps.storage, seconds);
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
  listened: new Set(),
  seconds: new Map(),
  listenedCount: 0,
  total: LIBRARY_ITEM_COUNT,
  hostComplete: false,
  localComplete: false,
  complete: false,
  lockText: learnLockText(0, LIBRARY_ITEM_COUNT),
  progressText: learnProgressText(0, LIBRARY_ITEM_COUNT),
};

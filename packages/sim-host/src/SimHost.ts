import type { AttemptRecord, CohortFilter, GamiLeaderboardRow, Period } from "@egemed/gamification-core";
import type {
  AuscultaPublicCase,
  SimCaseResult,
  SimSession,
  SimSessionAnswerRequest,
  SimSessionMode,
} from "@egemed/contracts";

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

/** Birleşik barda simin eylem düğmesi simgesi (kabuk çizer). */
export type SimChromeIcon = "help" | "progress" | "fullscreen" | "swap" | "info" | "sound";

/** Birleşik barda simin eylemi (ör. Yardım, İlerlemem, Tam ekran). */
export interface SimChromeAction {
  readonly id: string;
  readonly label: string;
  readonly icon: SimChromeIcon;
  /** Aç/kapa durumundaki düğmeler için (ör. ses, tam ekran). */
  readonly pressed?: boolean;
  onSelect(): void;
}

/** Birleşik barda bilgi çipi (ör. çalışma modu, süre, ilerleme). */
export interface SimChromeChip {
  readonly id: string;
  readonly label: string;
  readonly tone?: "learn" | "practice" | "assessment" | "neutral";
  /**
   * Header'daki her öğe tıklanabilir (26 Eyl 2026): mod çipi için kabuk,
   * verilmişse `steps.onSelect(0)` (mod seçimine dön) çağırır; süre/ilerleme
   * gibi durum çipleri düğme görünümü almaz, düz durum metni olarak çizilir.
   */
  readonly onSelect?: () => void;
}

/**
 * UX kararı (25 Eylül 2026): sim rotasında tek bar vardır. Sim kendi üst barını
 * çizmez; adım göstergesini, çiplerini ve eylemlerini bu yapıyla kabuğa verir.
 */
export interface SimChrome {
  /**
   * `onSelect` verilirse tamamlanan adımlar (index < current) düğme olur; sim
   * geri dönüşü kendi yönetir (etkin oturumdan çıkışta onay sorar).
   */
  readonly steps?: { readonly labels: readonly string[]; readonly current: number; readonly onSelect?: (index: number) => void };
  readonly chips?: readonly SimChromeChip[];
  readonly actions?: readonly SimChromeAction[];
}

/**
 * API oturumundaki sunucu oyunlaştırması. `summary` `GamiSimSummary`,
 * `leaderboard` `GamiLeaderboardResponse["data"]` ile yapısal olarak örtüşür.
 */
export interface SimGamificationSummary {
  readonly xp: number;
  readonly level: number;
  readonly streak: { readonly current: number; readonly best: number };
  readonly badges: readonly { readonly key: string; readonly awardedAt: string }[];
}

export interface SimGamificationSource {
  summary(): Promise<SimGamificationSummary>;
  leaderboard(period: Period, cohort: CohortFilter): Promise<{ readonly rows: readonly GamiLeaderboardRow[] }>;
}

/**
 * Kitle (depo sahibi kararı, 26 Eylül 2026):
 * - `student`: tam içerik + oyunlaştırma (rozet, XP, liderlik, Meydan Okuma).
 * - `faculty` (öğretim üyesi): tam içerik; oyunlaştırma yüzeyleri (İlerlemem,
 *   liderlik, aylık ödül, Meydan Okuma) gizlenir, deneme raporlanmaz.
 * - `visitor` (ziyaretçi, hesapsız): yalnız öğrenme modu ve sime özgü sınırlı
 *   içerik; kilitli öğeler `VISITOR_LOCK_TEXT` ile işaretlenir.
 */
export type SimAudience = "student" | "faculty" | "visitor";
export const SIM_AUDIENCES: readonly SimAudience[] = ["student", "faculty", "visitor"];

/** Bağlamda kitle yoksa öğrenci varsayılır (geriye uyum). */
export function audienceOf(context: Pick<SimMountContext, "audience">): SimAudience {
  return context.audience ?? "student";
}

/** Oyunlaştırma yüzeyleri yalnız öğrenciye çizilir. */
export function audienceShowsGamification(audience: SimAudience): boolean {
  return audience === "student";
}

/** Ziyaretçi yalnız öğrenme modunu açabilir; uygulama ve değerlendirme kilitlidir. */
export function audienceCanUseMode(audience: SimAudience, mode: "learn" | "practice" | "assessment"): boolean {
  return audience !== "visitor" || mode === "learn";
}

/**
 * Ziyaretçi kilidi metinleri: üç sim aynı ifadeyi kullanır (tek kaynak).
 * Sim paketleri `@egemed/ui` i18n'e bağlı olmadığından metin sözleşmededir.
 */
export const VISITOR_LOCK_TEXT = {
  badge: "Ziyaretçi modu",
  locked: "Yalnızca Ege Üniversitesi Tıp Fakültesi öğrencileri yararlanabilir.",
  modeLocked: "Bu mod yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır.",
  itemLocked: "Tüm içerik yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır.",
  cta: "Öğrenci girişi",
} as const;

/**
 * A1 (ADR-009): uygulama ve değerlendirme vakaları sunucu oturumundan gelir; sim
 * cevap anahtarı görmez. Kabuk API oturumunda API istemcisiyle, geliştirmede
 * (DEV, API yok) tarayıcıda çalışan yerel bankayla kurar; üretimde yerel yol yoktur.
 */
export interface SimSessionSource {
  /** Doğrudan başlatma (uygulama/değerlendirme); `focusFinding` yalnız uygulamada (öğrenme → "bu bulguda çalış"). */
  start(mode: "practice" | "assessment", options?: { readonly focusFinding?: string }): Promise<SimSession>;
  getCase(sessionId: string, index: number): Promise<AuscultaPublicCase>;
  hint(sessionId: string, index: number, questionId: string): Promise<{ readonly hint: string; readonly hintsUsed: number }>;
  /** Yalnız uygulama: tek soruyu kontrol eder (anında geri bildirim); soru kilitlenir. */
  check(
    sessionId: string,
    index: number,
    questionId: string,
    answer: readonly string[],
  ): Promise<{ readonly questionId: string; readonly correct: boolean; readonly correctOptionIds: readonly string[]; readonly feedback: string }>;
  answer(
    sessionId: string,
    index: number,
    body: SimSessionAnswerRequest,
  ): Promise<{ readonly mode: "practice"; readonly result: SimCaseResult } | { readonly mode: "assessment" | "challenge"; readonly accepted: true }>;
  finish(sessionId: string): Promise<{
    readonly mode: SimSessionMode;
    readonly total: number;
    readonly max: number;
    readonly passed: boolean;
    readonly cases: readonly SimCaseResult[];
    readonly xpGained: number;
  }>;
  /** Oturuma bağlı ses jetonunun oynatılabilir adresi. */
  audioUrl(sessionId: string, token: string): string;
  /** ADR-010: Meydan Okuma oturumu (aynı vakalar/sıra; süreli). Desteklenmiyorsa reddeder. */
  startChallenge(challengeId: string): Promise<SimSession>;
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
  /**
   * API oturumunda kabuğun verdiği rapor hattı. Yerel deneme yazımı
   * başarıyla bitince sim bunu çağırır; yoksa alan hiç yoktur.
   */
  readonly reportAttempt?: (attempt: AttemptRecord) => void;
  /**
   * API oturumunda kabuğun verdiği okuma hattı. Varsa İlerlemem sunucudan gelir;
   * yoksa alan hiç yoktur ve yerel davranış sürer.
   */
  readonly gamification?: SimGamificationSource;
  /**
   * Birleşik bar kanalı: verilmişse sim kendi üst barını çizmez, `SimChrome`
   * gönderir (durum değiştikçe yeniden çağrılır; `null` barı temizler).
   */
  readonly setChrome?: (chrome: SimChrome | null) => void;
  /** Kitle (26 Eyl 2026); yoksa `student`. Bkz. `SimAudience`. */
  readonly audience?: SimAudience;
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi; kabuk giriş ekranına götürür. */
  readonly requestSignIn?: () => void;
  /** A1: sunucu vaka oturumu kanalı (ADR-009). Yoksa sim uygulama/değerlendirmeyi açmaz. */
  readonly sessions?: SimSessionSource;
  /** ADR-010: verilirse sim doğrudan bu düellonun oturumunu açar (mod seçimi atlanır). */
  readonly challengeId?: string;
  /** Düello oturumu bitince (sonuç karşılaştırması kabukta). */
  readonly onChallengeFinished?: (challengeId: string) => void;
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
  readonly reportAttempt?: (attempt: AttemptRecord) => void;
  readonly gamification?: SimGamificationSource;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly audience?: SimAudience;
  readonly requestSignIn?: () => void;
  readonly sessions?: SimSessionSource;
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
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

function mountContext(simId: SimulatorId, now: () => number, mountOptions: SimMountOptions | undefined): SimMountContext {
  const actorId = mountOptions?.actorId;
  const reportAttempt = mountOptions?.reportAttempt;
  const gamification = mountOptions?.gamification;
  const setChrome = mountOptions?.setChrome;
  const audience = mountOptions?.audience;
  const requestSignIn = mountOptions?.requestSignIn;
  const sessions = mountOptions?.sessions;
  const challengeId = mountOptions?.challengeId;
  const onChallengeFinished = mountOptions?.onChallengeFinished;
  return {
    now,
    simId,
    ...(actorId === undefined ? {} : { actorId }),
    ...(reportAttempt === undefined ? {} : { reportAttempt }),
    ...(gamification === undefined ? {} : { gamification }),
    ...(setChrome === undefined ? {} : { setChrome }),
    // T180: kitle ve ziyaretçi "Öğrenci girişi" kanalı sime aktarılır (T172'de eksik kalmıştı).
    ...(audience === undefined ? {} : { audience }),
    ...(requestSignIn === undefined ? {} : { requestSignIn }),
    ...(sessions === undefined ? {} : { sessions }),
    ...(challengeId === undefined ? {} : { challengeId }),
    ...(onChallengeFinished === undefined ? {} : { onChallengeFinished }),
  };
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
          const context = mountContext(simId, options.now, mountOptions);
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

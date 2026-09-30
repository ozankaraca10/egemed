import { useEffect, useRef, useState, type JSX } from "react";
import { audienceShowsGamification, createSimHost, type SimAudience, type SimChrome, type SimHost, type SimScreenKey, type SimulatorId } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { shellNow } from "./now";
import { challengeHref, routeHref, simScreenHref, simTitleKey } from "./routes";
import { createBrowserGamification, createBrowserLearnReporter, type ReportedLearnActivity } from "./reportLearn";
import { loadSimModule } from "./sims/loaders";
import { SERVER_SESSION_SIMS, createBrowserSessionSource } from "./sims/sessionSources";
import { createBrowserLearnSource, createLearnPort, createUnlockedLearnPort } from "./learn/learnSource";
import type { SimLearnPort, SimSessionSource } from "@egemed/sim-host";
import { useShellDataSources } from "./dataSources";
import { createBrowserSimNavigation } from "./simNavigation";

/**
 * A1.4 (ADR-009): uygulama/değerlendirme vakaları sunucu oturumundan gelir. Ziyaretçide
 * kanal yoktur (modlar zaten kilitli). API yoksa YALNIZ geliştirmede tarayıcı içi yerel
 * kaynak dinamik yüklenir; `import.meta.env.DEV` kapısı üretim paketinden eler.
 */
async function sessionSourceFor(simId: SimulatorId, audience: string, apiBaseUrl: string | null): Promise<SimSessionSource | null> {
  if (audience === "visitor" || !SERVER_SESSION_SIMS.includes(simId)) return null;
  if (apiBaseUrl !== null) return createBrowserSessionSource(apiBaseUrl, simId);
  if (import.meta.env.DEV) {
    const module = await import("./sims/devLocalSessions");
    return module.createDevLocalSessionSource(simId, shellNow);
  }
  return null;
}

/**
 * Öğrenme tamamlama kanalı (27 Eyl 2026): API oturumunda kayıt sunucudan
 * okunur ve sunucuya yazılır; API yoksa YALNIZ geliştirmede sekme deposuna
 * yazan yerel port kurulur. Ziyaretçide kanal verilmez (yalnız öğrenme modunu
 * görür). Ayrıcalıklı rollerde (admin, öğretim üyesi, uzmanlık öğrencisi;
 * T219) kilit uygulanmaz: kanal her zaman tamamlanmış görünür ve sunucuya
 * yazmaz. `import.meta.env.DEV` kapısı dev kodunu üretim paketinden eler.
 */
async function learnPortFor(simId: SimulatorId, audience: string, apiBaseUrl: string | null, unlocked: boolean): Promise<SimLearnPort | null> {
  if (audience === "visitor") return null;
  if (unlocked) return createUnlockedLearnPort();
  if (apiBaseUrl !== null) {
    const source = createBrowserLearnSource(apiBaseUrl);
    if (source === null) return null;
    // Durum okunamazsa sim açılışı engellenmez; kanal kurulmaz.
    return createLearnPort(source, simId).catch(() => null);
  }
  if (import.meta.env.DEV) {
    const module = await import("./sims/devLocalLearn");
    return module.createDevLocalLearnPort(simId);
  }
  return null;
}

/** Sim host kapsayıcısı; kök tsconfig DOM lib'i taşımadığı için tip yapısaldır. */
interface SimContainer {
  appendChild(node: unknown): unknown;
}

/** Sim rotasının görünür durumu: yükleniyor → hazır | hata. */
type SimRouteStatus = "loading" | "ready" | "error";

export interface SimRouteProps {
  readonly simId: SimulatorId;
  /** Oturumdaki kullanıcının takma kimliği; sim kayıtlarını kullanıcıya ayırır (PULSE-08). */
  readonly actorId?: string | undefined;
  /**
   * API oturumunun taban adresi. Doluysa tamamlanan denemeler sunucuya gider.
   * Sahte geliştirme oturumunda verilmez.
   */
  readonly apiBaseUrl?: string | null;
  /** API oturumunda sim `simAccess` dışında ise modül mount edilmez. */
  readonly allowed?: boolean;
  /**
   * Öğrenme kilidi muafiyeti (T219): admin, öğretim üyesi ve uzmanlık
   * öğrencisi rollerinde sime verilen `learn` portu tamamlanmış sayılır.
   */
  readonly learnUnlocked?: boolean;
  /** Birleşik bar kanalı: simin adım/çip/eylemleri kabuğun üst barına gider. */
  readonly onChrome?: ((chrome: SimChrome | null) => void) | undefined;
  /** Kitle (26 Eyl 2026): öğrenci / öğretim üyesi / ziyaretçi; yoksa öğrenci. */
  readonly audience?: SimAudience | undefined;
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly onRequestSignIn?: (() => void) | undefined;
  /** ADR-010: düello modunda açılış (`#/sims/<sim>/duello/<id>`). */
  readonly challengeId?: string | undefined;
  /** Sim içi hash alt yolundan gelen ilk ekran. */
  readonly screenKey?: SimScreenKey | undefined;
}

/** Duyuru kartı simgesi: erişim reddi (kilit) ve hata (uyarı). Dekoratiftir. */
function SimNoticeIcon({ kind }: { readonly kind: "lock" | "warning" }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={
        kind === "warning"
          ? "eg-shell-sim-notice__icon eg-shell-sim-notice__icon--warning"
          : "eg-shell-sim-notice__icon"
      }
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      {kind === "lock" ? (
        <>
          <rect height="10" rx="2" width="14" x="5" y="11" />
          <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
        </>
      ) : (
        <>
          <path d="M12 3.5 2.5 20.5h19z" />
          <path d="M12 10v4.5" />
          <path d="M12 17.5h.01" />
        </>
      )}
    </svg>
  );
}

/**
 * Erişim reddi kartı (T129): sim alanının ortasında, en çok 32rem; kilit
 * simgesi, başlık, açıklama ve "Simülatörlere dön" bağlantısı. Sayfanın tek
 * h1'i birleşik bardadır; kart h2 taşır.
 */
function SimAccessDenied(): JSX.Element {
  return (
    <section className="eg-shell-sim-page eg-shell-sim-page--notice">
      <div className="eg-shell-sim-notice" role="status">
        <SimNoticeIcon kind="lock" />
        <h2 className="eg-shell-sim-notice__title">{t("sims.access.none")}</h2>
        <p className="eg-shell-sim-notice__body">{t("sims.access.denied")}</p>
        <div className="eg-shell-sim-notice__actions">
          <a className="eg-shell-sim-notice__primary" href={routeHref("simulators")}>
            {t("sims.back")}
          </a>
        </div>
      </div>
    </section>
  );
}

export interface SimErrorNoticeProps {
  /** "Tekrar dene": aynı sim oturumunu yeniden kurar. */
  readonly onRetry: () => void;
}

/**
 * Sim yükleme hatası kartı (T129): uyarı simgesi, başlık, açıklama ve
 * birincil "Tekrar dene" + ikincil "Simülatörlere dön".
 */
export function SimErrorNotice({ onRetry }: SimErrorNoticeProps): JSX.Element {
  return (
    <div className="eg-shell-sim-notice eg-shell-sim-notice--error" role="alert">
      <SimNoticeIcon kind="warning" />
      <h2 className="eg-shell-sim-notice__title">{t("sims.error.title")}</h2>
      <p className="eg-shell-sim-notice__body">{t("sims.error.body")}</p>
      <div className="eg-shell-sim-notice__actions">
        <button className="eg-shell-sim-notice__primary" onClick={onRetry} type="button">
          {t("sims.error.retry")}
        </button>
        <a className="eg-shell-sim-notice__secondary" href={routeHref("simulators")}>
          {t("sims.back")}
        </a>
      </div>
    </div>
  );
}

/**
 * Sim rotası React host'u (ADR-006): `SimHost` bileşen ömrü boyunca tek
 * örnektir; modül `useEffect` içinde kapsayıcıya mount edilir, cleanup'ta
 * dispose edilir. Sim değişiminde yeni oturum kurulurken host önceki oturumu
 * kendisi kapatır; "tekrar dene" aynı yolu yeniden çalıştırır. Saat tek
 * sağlayıcıdan (`shellNow`) enjekte edilir; `Date.now()` kullanılmaz.
 *
 * Host kapsayıcısı React çocuğu taşımaz (T14b): vanilla sim modülü aynı düğüme
 * `appendChild` yapar ve kendi içeriğini `innerHTML=""` ile temizleyebilir;
 * React'in kaldıracağı düğüm olmadığı için bu güvenlidir. İskelet ve hata
 * kutusu host'un kardeşidir; yükleniyor/hata sırasında host gizlenmez, boş
 * kalır ve aşama ızgarasında aynı hücreyi paylaşır.
 */
export function SimRoute({ actorId, allowed = true, apiBaseUrl = null, audience, challengeId, learnUnlocked = false, onChrome, onRequestSignIn, screenKey, simId }: SimRouteProps): JSX.Element {
  if (!allowed) return <SimAccessDenied />;
  return (
    <SimRouteHost
      challengeId={challengeId}
      actorId={actorId}
      apiBaseUrl={apiBaseUrl}
      audience={audience}
      learnUnlocked={learnUnlocked}
      onChrome={onChrome}
      onRequestSignIn={onRequestSignIn}
      screenKey={screenKey}
      simId={simId}
    />
  );
}

function SimRouteHost({ actorId, apiBaseUrl = null, audience = "student", challengeId, learnUnlocked, onChrome, onRequestSignIn, screenKey, simId }: Omit<SimRouteProps, "allowed">): JSX.Element {
  const shellSources = useShellDataSources();
  // Kanal ref'te tutulur: üst bileşen yeniden çizilince sim yeniden mount edilmez.
  const chromeRef = useRef(onChrome);
  chromeRef.current = onChrome;
  const signInRef = useRef(onRequestSignIn);
  signInRef.current = onRequestSignIn;
  const containerRef = useRef<SimContainer | null>(null);
  const screenKeyRef = useRef<SimScreenKey | null>(screenKey ?? null);
  screenKeyRef.current = screenKey ?? null;
  const hostRef = useRef<SimHost | null>(null);
  const [status, setStatus] = useState<SimRouteStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  if (hostRef.current === null) {
    hostRef.current = createSimHost({
      events: {
        onError: () => setStatus("error"),
        onLoading: () => setStatus("loading"),
        onReady: () => setStatus("ready"),
      },
      load: loadSimModule,
      now: shellNow,
    });
  }

  useEffect(() => {
    const host = hostRef.current;
    const container = containerRef.current;
    if (host === null || container === null) return;
    // Düello adresi (`/duello/<id>`) ekran bildirimiyle ezilmemeli: düelloda kanal verilmez.
    const navigation = challengeId === undefined ? createBrowserSimNavigation(simId, screenKeyRef.current) : null;
    // T281a: 4. mod kartı ("Meydan Okuma") için gerçek hash değişimi; geri tuşu
    // mod seçimine döner. Ziyaretçide ve düello modunda kanal verilmez.
    const openChallenges =
      audience === "visitor" || challengeId !== undefined
        ? undefined
        : () => {
            const scope = globalThis as { location?: { hash: string } };
            if (scope.location !== undefined) scope.location.hash = simScreenHref(simId, "meydan-okuma");
          };
    // Mount da mikro göreve ertelenir: önceki simin (ör. Opaca React kökü)
    // kapanışı React render'ı sırasında değil, ondan sonra olur. Sıra korunur:
    // önceki cleanup'ın `release`ı bu mount'tan önce kuyruğa girer.
    const mounted = Promise.resolve().then(async () => {
      // Oyunlaştırma hattı (puansız öğrenme kaydı, sunucu özeti) yalnız öğrenciye kurulur (T171/T172).
      // A4 (ADR-009): puanlı deneme gönderilmez; denemeyi sunucu oturumu yazar.
      const gamified = audienceShowsGamification(audience);
      const learnReporter = apiBaseUrl === null || !gamified ? null : createBrowserLearnReporter(apiBaseUrl);
      const reportLearn =
        learnReporter === null
          ? undefined
          : (activity: ReportedLearnActivity) => {
              void learnReporter(simId, activity).catch(() => undefined);
            };
      const gamification = apiBaseUrl === null || !gamified ? null : createBrowserGamification(apiBaseUrl, simId);
      const sessions = await sessionSourceFor(simId, audience, apiBaseUrl);
      const learn = await learnPortFor(simId, audience, apiBaseUrl, learnUnlocked === true);
      const options = {
        ...(actorId === undefined ? {} : { actorId }),
        ...(reportLearn === undefined ? {} : { reportLearn }),
        ...(gamification === null ? {} : { gamification }),
        setChrome: (chrome: SimChrome | null) => chromeRef.current?.(chrome),
        audience,
        requestSignIn: () => signInRef.current?.(),
        ...(sessions === null ? {} : { sessions }),
        ...(learn === null ? {} : { learn }),
        ...(navigation === null ? {} : { navigation: navigation.navigation }),
        ...(openChallenges === undefined ? {} : { openChallenges }),
        ...(audience === "visitor" || shellSources === null ? {} : { rewards: shellSources.rewardStore.forSim(simId) }),
        ...(challengeId === undefined || sessions === null
          ? {}
          : {
              challengeId,
              onChallengeFinished: (finishedId: string) => {
                const scope = globalThis as { location?: { hash: string } };
                if (scope.location !== undefined) scope.location.hash = challengeHref(simId, finishedId);
              },
            }),
      };
      return host.mount(container, simId, options);
    });
    return () => {
      // Gerçek React tabanlı modüller (Opaca) dispose'ta kendi kökünü
      // `unmount()` eder; bu, kabuğun bu bileşeni kaldırdığı AYNI commit
      // sırasında senkron çağrılırsa React "zaten render ediliyor" uyarısı
      // verir (iç içe kök). Promise mikro görevine öteleme, çağrıyı geçerli
      // commit tamamlandıktan sonraya taşır; host zaten idempotenttir.
      // (`queueMicrotask` yerine `Promise.resolve().then` kullanılır: kök
      // tsconfig programı DOM lib'i içermez ve `queueMicrotask` global'i
      // orada çözümlenemez; `Promise` ES2022'nin bir parçasıdır.)
      // Ertelenmiş cleanup yalnız KENDİ mount'unu bırakır: sim doğrudan
      // değiştirildiğinde yeni mount'u iptal etmez (PLATFORM-01).
      void mounted.then((token) => host.release(token));
      navigation?.dispose();
      chromeRef.current?.(null);
    };
  }, [simId, actorId, apiBaseUrl, audience, challengeId, learnUnlocked, attempt]);

  // Başlık (h1) ve konum birleşik bardadır; sim tam alanı çerçevesiz kaplar.
  return (
    <section aria-busy={status === "loading"} aria-label={t(simTitleKey(simId))} className="eg-shell-sim-page">
      <div className="eg-shell-sim-page__stage">
        {/* Kök program DOM lib'i taşımaz (boş `HTMLDivElement`); gerçek düğüm
            çalışma zamanında host sözleşmesini karşılar. */}
        <div
          className={status === "ready" ? "eg-shell-sim-page__host eg-shell-sim-page__host--ready" : "eg-shell-sim-page__host"}
          ref={(node: unknown) => {
            containerRef.current = node as SimContainer | null;
          }}
        />
        {status === "loading" && (
          <div aria-hidden="true" className="eg-shell-sim-page__skeleton">
            <span className="eg-shell-sim-page__skeleton-block" />
            <span className="eg-shell-sim-page__skeleton-block" />
          </div>
        )}
        {status === "error" && <SimErrorNotice onRetry={() => setAttempt((value) => value + 1)} />}
      </div>
    </section>
  );
}

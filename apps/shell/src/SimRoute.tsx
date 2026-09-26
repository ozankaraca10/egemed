import { useEffect, useRef, useState, type JSX } from "react";
import { audienceShowsGamification, createSimHost, type SimAudience, type SimChrome, type SimHost, type SimulatorId } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { shellNow } from "./now";
import { routeHref, simTitleKey } from "./routes";
import { createBrowserAttemptReporter, createBrowserGamification, type ReportedAttempt } from "./reportAttempt";
import { loadSimModule } from "./sims/loaders";

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
  /** Birleşik bar kanalı: simin adım/çip/eylemleri kabuğun üst barına gider. */
  readonly onChrome?: ((chrome: SimChrome | null) => void) | undefined;
  /** Kitle (26 Eyl 2026): öğrenci / öğretim üyesi / ziyaretçi; yoksa öğrenci. */
  readonly audience?: SimAudience | undefined;
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly onRequestSignIn?: (() => void) | undefined;
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
export function SimRoute({ actorId, allowed = true, apiBaseUrl = null, audience, onChrome, onRequestSignIn, simId }: SimRouteProps): JSX.Element {
  if (!allowed) return <SimAccessDenied />;
  return (
    <SimRouteHost
      actorId={actorId}
      apiBaseUrl={apiBaseUrl}
      audience={audience}
      onChrome={onChrome}
      onRequestSignIn={onRequestSignIn}
      simId={simId}
    />
  );
}

function SimRouteHost({ actorId, apiBaseUrl = null, audience = "student", onChrome, onRequestSignIn, simId }: Omit<SimRouteProps, "allowed">): JSX.Element {
  // Kanal ref'te tutulur: üst bileşen yeniden çizilince sim yeniden mount edilmez.
  const chromeRef = useRef(onChrome);
  chromeRef.current = onChrome;
  const signInRef = useRef(onRequestSignIn);
  signInRef.current = onRequestSignIn;
  const containerRef = useRef<SimContainer | null>(null);
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
    // Mount da mikro göreve ertelenir: önceki simin (ör. Opaca React kökü)
    // kapanışı React render'ı sırasında değil, ondan sonra olur. Sıra korunur:
    // önceki cleanup'ın `release`ı bu mount'tan önce kuyruğa girer.
    const mounted = Promise.resolve().then(() => {
      // Oyunlaştırma hattı (deneme raporu, sunucu özeti) yalnız öğrenciye kurulur (T171/T172).
      const gamified = audienceShowsGamification(audience);
      const reporter = apiBaseUrl === null || !gamified ? null : createBrowserAttemptReporter(apiBaseUrl);
      const reportAttempt =
        reporter === null
          ? undefined
          : (attempt: ReportedAttempt) => {
              void reporter(simId, attempt).catch(() => undefined);
            };
      const gamification = apiBaseUrl === null || !gamified ? null : createBrowserGamification(apiBaseUrl, simId);
      const options = {
        ...(actorId === undefined ? {} : { actorId }),
        ...(reportAttempt === undefined ? {} : { reportAttempt }),
        ...(gamification === null ? {} : { gamification }),
        setChrome: (chrome: SimChrome | null) => chromeRef.current?.(chrome),
        audience,
        requestSignIn: () => signInRef.current?.(),
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
      chromeRef.current?.(null);
    };
  }, [simId, actorId, apiBaseUrl, audience, attempt]);

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

import { useEffect, useRef, useState, type JSX } from "react";
import { createSimHost, type SimHost, type SimulatorId } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { shellNow } from "./now";
import { routeHref, simTitleKey } from "./routes";
import { loadSimModule } from "./sims/loaders";

/** Sim host kapsayıcısı; kök tsconfig DOM lib'i taşımadığı için tip yapısaldır. */
interface SimContainer {
  appendChild(node: unknown): unknown;
}

/** Sim rotasının görünür durumu: yükleniyor → hazır | hata. */
type SimRouteStatus = "loading" | "ready" | "error";

export interface SimRouteProps {
  readonly simId: SimulatorId;
}

/**
 * Hata kutusu başlığı: sim adı + hata etiketi. Mevcut sözlük anahtarlarından
 * türetilir; "tekrar dene" düğmesi aynı kutuda yer alır. Özel bir "Tekrar
 * dene" anahtarı sözlükte yoktur (bkz. T38c summary — ayrı copy görevi).
 */
export function simErrorTitle(simId: SimulatorId): string {
  return `${t(simTitleKey(simId))} · ${t("badge.tone.danger")}`;
}

/**
 * Gömülü modda sayfa `<h1>`ini taşıyan sim modülleri. Hazır olduklarında
 * kabuk çubuğu aynı metni `<h1>` yerine düz metin çizer; sayfada tek `<h1>`
 * kalır (WCAG 2.4.6/1.3.1). Opaca (T15b-S25) gömülü modda ekran başlıklarını
 * `h2` olarak çizdiği için kabuk `<h1>`i korur — bu kümeye girmez. Pulse
 * (T14d) her ekranında (modlar/inceleme/uygulama/değerlendirme/hakkında) tek
 * bir `<h1>` çizer; kabuk çubuğu bu kümede olduğu için hazır durumda kendi
 * `<h1>`ini bırakır.
 */
const SIMS_WITH_OWN_HEADING: ReadonlySet<SimulatorId> = new Set(["pulse"]);

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
export function SimRoute({ simId }: SimRouteProps): JSX.Element {
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
    host.mount(container, simId);
    return () => {
      // Gerçek React tabanlı modüller (Opaca) dispose'ta kendi kökünü
      // `unmount()` eder; bu, kabuğun bu bileşeni kaldırdığı AYNI commit
      // sırasında senkron çağrılırsa React "zaten render ediliyor" uyarısı
      // verir (iç içe kök). Promise mikro görevine öteleme, çağrıyı geçerli
      // commit tamamlandıktan sonraya taşır; host zaten idempotenttir.
      // (`queueMicrotask` yerine `Promise.resolve().then` kullanılır: kök
      // tsconfig programı DOM lib'i içermez ve `queueMicrotask` global'i
      // orada çözümlenemez; `Promise` ES2022'nin bir parçasıdır.)
      void Promise.resolve().then(() => host.dispose());
    };
  }, [simId, attempt]);

  const title = t(simTitleKey(simId));
  const ownsHeading = status === "ready" && SIMS_WITH_OWN_HEADING.has(simId);
  return (
    <section aria-busy={status === "loading"} className="eg-shell-sim-page">
      <div className="eg-shell-sim-page__bar">
        {ownsHeading ? (
          <p className="eg-shell-sim-page__title">{title}</p>
        ) : (
          <h1 className="eg-shell-sim-page__title">{title}</h1>
        )}
        <a className="eg-shell-sim-page__exit" href={routeHref("simulators")}>
          {t("shell.nav.simulators")}
        </a>
      </div>
      <div className="eg-shell-sim-page__stage">
        {/* Kök program DOM lib'i taşımaz (boş `HTMLDivElement`); gerçek düğüm
            çalışma zamanında host sözleşmesini karşılar. */}
        <div
          className="eg-shell-sim-page__host"
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
        {status === "error" && (
          <div className="eg-shell-sim-page__error" role="alert">
            <p className="eg-shell-sim-page__error-title">{simErrorTitle(simId)}</p>
            <button
              className="eg-shell-sim-page__retry"
              onClick={() => setAttempt((value) => value + 1)}
              type="button"
            >
              {t("sims.open")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

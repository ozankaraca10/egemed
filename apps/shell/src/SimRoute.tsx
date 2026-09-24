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
 * Sim rotası React host'u (ADR-006): `SimHost` bileşen ömrü boyunca tek
 * örnektir; modül `useEffect` içinde kapsayıcıya mount edilir, cleanup'ta
 * dispose edilir. Sim değişiminde yeni oturum kurulurken host önceki oturumu
 * kendisi kapatır; "tekrar dene" aynı yolu yeniden çalıştırır. Saat tek
 * sağlayıcıdan (`shellNow`) enjekte edilir; `Date.now()` kullanılmaz.
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
    return () => host.dispose();
  }, [simId, attempt]);

  return (
    <section aria-busy={status === "loading"} className="eg-shell-sim-page">
      <div className="eg-shell-sim-page__bar">
        <h1 className="eg-shell-sim-page__title">{t(simTitleKey(simId))}</h1>
        <a className="eg-shell-sim-page__exit" href={routeHref("simulators")}>
          {t("shell.nav.simulators")}
        </a>
      </div>
      {/* Kök program DOM lib'i taşımaz (boş `HTMLDivElement`); gerçek düğüm
          çalışma zamanında host sözleşmesini karşılar. */}
      <div
        className="eg-shell-sim-page__host"
        ref={(node: unknown) => {
          containerRef.current = node as SimContainer | null;
        }}
      >
        {status === "loading" && (
          <div aria-hidden="true" className="eg-shell-sim-page__skeleton">
            <span className="eg-shell-sim-page__skeleton-block" />
            <span className="eg-shell-sim-page__skeleton-block" />
          </div>
        )}
        {status === "error" && (
          <div className="eg-shell-sim-page__error" role="alert">
            <p className="eg-shell-sim-page__error-title">{t("badge.tone.danger")}</p>
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

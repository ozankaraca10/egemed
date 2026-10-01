import { lazy, Suspense, useState, type JSX, type KeyboardEvent } from "react";
import { t } from "@egemed/ui/i18n";
import type { SimId } from "@egemed/contracts";

/**
 * T276b — Hakkında (depo sahibi kararı 1 Eki 2026): üç simin eski, ayrıntılı
 * Hakkında sayfaları (geliştiriciler, kurum, veri setleri/kaynaklar, uyarı) tek
 * sayfada sekmelerle. Simlerin içindeki Hakkında eylemi kaldırıldı. İçerik sim
 * paketlerinden tembel yüklenir; ana paket büyümez.
 */

const PulseAbout = lazy(() => import("@egemed/sim-pulse").then((mod) => ({ default: () => <mod.PulseAbout assetBase="/sims/pulse/" /> })));
const AuscultaAbout = lazy(() => import("@egemed/sim-ausculta").then((mod) => ({ default: mod.AuscultaAbout })));
const OpacaAbout = lazy(() => import("@egemed/sim-opaca").then((mod) => ({ default: mod.OpacaAbout })));

const SIMS: readonly SimId[] = ["pulse", "ausculta", "opaca"];
const CONTENT: Record<SimId, () => JSX.Element> = {
  pulse: () => <PulseAbout />,
  ausculta: () => <AuscultaAbout />,
  opaca: () => <OpacaAbout />,
};

export function AboutPage(): JSX.Element {
  const [active, setActive] = useState<SimId>("pulse");
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setActive((current) => SIMS[(SIMS.indexOf(current) + step + SIMS.length) % SIMS.length] ?? "pulse");
  };
  const Content = CONTENT[active];
  return (
    <section className="eg-shell-page eg-shell-about">
      <h1 className="eg-shell-page__title">{t("shell.about.title")}</h1>
      <p className="eg-shell-page__body">{t("shell.about.lead")}</p>
      <div aria-label={t("shell.about.tabs")} className="eg-shell-about__tabs" onKeyDown={onKey} role="tablist">
        {SIMS.map((simId) => (
          <button
            aria-controls="eg-about-panel"
            aria-selected={simId === active}
            className="eg-shell-about__tab"
            id={`eg-about-tab-${simId}`}
            key={simId}
            onClick={() => setActive(simId)}
            role="tab"
            tabIndex={simId === active ? 0 : -1}
            type="button"
          >
            <img alt="" className="eg-shell-about__tabIcon" height={24} src={`/brand/sims/${simId}-icon.png`} width={24} />
            {t(`sims.${simId}.name`)}
          </button>
        ))}
      </div>
      <div aria-labelledby={`eg-about-tab-${active}`} className="eg-shell-about__panel" id="eg-about-panel" role="tabpanel">
        <Suspense fallback={<p className="eg-shell-page__body">{t("shell.about.loading")}</p>}>
          <Content />
        </Suspense>
      </div>
    </section>
  );
}

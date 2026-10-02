import type { JSX } from "react";
import { icons } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { simHref } from "../routes";
import { sessionAllowsSim, type ShellSession } from "../session";
import { SIM_ICONS, SIM_IDS, type SimId } from "../SimCard";
import { useSimProgress, type SimProgress } from "../home/simProgress";
import { prefetchSimModule } from "./loaders";

/**
 * T296 — Simülatörler (depo sahibi onayı 1 Eki 2026): her sim için geniş vitrin
 * kartı (sim renginde sahne + gerçek beyaz ikon, içerik sayıları, dört mod,
 * öğrenme durumu, tek ana eylem) ve geliştirme aşamasındaki simler.
 */

/** İçerik sayıları; kaynak sim envanterleri (1 Eki 2026). `tests/shell/sim-facts.test.ts` sapmayı yakalar. */
export const SIM_FACTS: Record<SimId, readonly { readonly value: number; readonly labelKey: TrKey }[]> = {
  pulse: [
    { value: 23, labelKey: "sims.page.fact.ecg" },
    { value: 300, labelKey: "sims.page.fact.practice" },
    { value: 300, labelKey: "sims.page.fact.quiz" },
  ],
  ausculta: [
    { value: 24, labelKey: "sims.page.fact.sounds" },
    { value: 200, labelKey: "sims.page.fact.practice" },
    { value: 85, labelKey: "sims.page.fact.assessment" },
  ],
  opaca: [
    { value: 33, labelKey: "sims.page.fact.topics" },
    { value: 188, labelKey: "sims.page.fact.practice" },
    { value: 124, labelKey: "sims.page.fact.labeled" },
  ],
};

const MODES = ["learn", "practice", "assessment", "challenge"] as const;
type ModeKey = (typeof MODES)[number];

function modeState(mode: ModeKey, progress: SimProgress | null): "done" | "next" | "locked" | "open" {
  const complete = progress?.learnComplete ?? null;
  if (complete === null) return mode === "learn" ? "next" : "open";
  if (mode === "learn") return complete ? "done" : "next";
  if (!complete) return "locked";
  return mode === "practice" ? "next" : "open";
}

export function ModeChips({ progress }: { readonly progress: SimProgress | null }): JSX.Element {
  return (
    <ul aria-label={t("sims.page.modes")} className="eg-shell-modechips">
      {MODES.map((mode) => {
        const state = modeState(mode, progress);
        return (
          <li className={`eg-shell-modechip eg-shell-modechip--${state}${mode === "challenge" ? " eg-shell-modechip--challenge" : ""}`} key={mode}>
            {state === "done" ? "✓ " : state === "locked" ? "🔒 " : ""}
            {t(`entry.features.mode.${mode}`)}
            {state === "locked" ? <span className="eg-shell-visually-hidden"> · {t("sims.page.locked")}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function statusLine(progress: SimProgress | null): string | null {
  if (progress === null) return null;
  const parts: string[] = [];
  if (progress.bestScore !== null) parts.push(`${t("sims.page.best")} ${progress.bestScore}`);
  if (progress.rank !== null) parts.push(`${t("sims.page.rank")} ${progress.rank.rank}.`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function SimShowcase({ simId, progress, denied }: { readonly simId: SimId; readonly progress: SimProgress | null; readonly denied: boolean }): JSX.Element {
  const icon = SIM_ICONS[simId];
  const status = statusLine(progress);
  const learnLabel = progress?.learnComplete === true ? t("sims.page.learnDone") : progress?.learnComplete === false ? t("sims.page.learnOpen") : null;
  return (
    <article aria-labelledby={`eg-sim-${simId}`} className={`eg-shell-simshow eg-shell-simshow--${simId}`}>
      <div className="eg-shell-simshow__stage">
        <img alt="" className="eg-shell-simshow__icon" height={icon.height} src={icon.src} width={icon.width} />
        <div>
          <span className="eg-shell-simshow__brand">{t("entry.brand")}</span>
          <h2 className="eg-shell-simshow__name" id={`eg-sim-${simId}`}>{t(`sims.${simId}.name`)}</h2>
        </div>
        <p className="eg-shell-simshow__pitch">{t(`sims.${simId}.body`)}</p>
      </div>
      <div className="eg-shell-simshow__body">
        <div className="eg-shell-simshow__head">
          <p className="eg-shell-simshow__tagline">{t(`sims.${simId}.tagline`)}</p>
          {learnLabel !== null ? <span className={`eg-shell-simshow__state${progress?.learnComplete ? " eg-shell-simshow__state--done" : ""}`}>{learnLabel}</span> : null}
        </div>
        <dl className="eg-shell-simshow__facts">
          {SIM_FACTS[simId].map((fact) => (
            <div className="eg-shell-simshow__fact" key={fact.labelKey}>
              <dt>{t(fact.labelKey)}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <ModeChips progress={progress} />
        <div className="eg-shell-simshow__foot">
          <span className="eg-shell-simshow__status">{denied ? t("sims.access.none") : status ?? t(`sims.page.hint.${simId}`)}</span>
          <a className="eg-shell-simshow__cta" href={simHref(simId)} onFocus={() => prefetchSimModule(simId)} onPointerEnter={() => prefetchSimModule(simId)}>
            {t("sims.open")}
            <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
          </a>
        </div>
      </div>
    </article>
  );
}

const UPCOMING = ["discerna", "praxis"] as const;

function UpcomingSim({ id }: { readonly id: (typeof UPCOMING)[number] }): JSX.Element {
  return (
    <article aria-labelledby={`eg-sim-${id}`} className={`eg-shell-simshow eg-shell-simshow--upcoming eg-shell-simshow--${id}`}>
      <div className="eg-shell-simshow__stage">
        <span aria-hidden="true" className="eg-shell-simshow__glyph">
          {id === "discerna" ? (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="21" cy="21" r="12" /><path d="m30 30 10 10" /><path d="M15 21h12M21 15v12" /></svg>
          ) : (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 38 30 18" /><path d="m27 11 10 10-4 4-10-10z" /><path d="M8 40l4-1-3-3z" /></svg>
          )}
        </span>
        <div>
          <span className="eg-shell-simshow__brand">{t("entry.brand")}</span>
          <h2 className="eg-shell-simshow__name" id={`eg-sim-${id}`}>{t(`sims.upcoming.${id}.name`)}</h2>
        </div>
      </div>
      <div className="eg-shell-simshow__body">
        <div className="eg-shell-simshow__head">
          <p className="eg-shell-simshow__tagline">{t(`sims.upcoming.${id}.tagline`)}</p>
          <span className="eg-shell-simshow__state eg-shell-simshow__state--dev">{t("sims.upcoming.badge")}</span>
        </div>
        <p className="eg-shell-simshow__soon">{t("sims.upcoming.body")}</p>
      </div>
    </article>
  );
}

export function SimulatorsPage({ session = null }: { readonly session?: ShellSession | null }): JSX.Element {
  const progress = useSimProgress(session);
  return (
    <section className="eg-shell-page eg-shell-simspage">
      <header className="eg-shell-simspage__head">
        <p className="eg-shell-simspage__eyebrow">{t("sims.page.eyebrow")}</p>
        <h1 className="eg-shell-page__title">{t("shell.simulators.title")}</h1>
        <p className="eg-shell-page__body">{t("sims.page.lead")}</p>
      </header>
      <div className="eg-shell-simspage__list">
        {SIM_IDS.map((id) => (
          <SimShowcase denied={!sessionAllowsSim(session, id)} key={id} progress={progress?.[id] ?? null} simId={id} />
        ))}
      </div>
      <h2 className="eg-shell-section__title">{t("sims.upcoming.title")}</h2>
      <div className="eg-shell-simspage__upcoming">
        {UPCOMING.map((id) => <UpcomingSim id={id} key={id} />)}
      </div>
    </section>
  );
}

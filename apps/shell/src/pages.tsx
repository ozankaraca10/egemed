import { useMemo, type JSX, type ReactNode } from "react";
import { icons } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { ProgressSection } from "./home/ProgressSection";
import { ShowcaseSection } from "./home/ShowcaseSection";
import { useShellDataSources } from "./dataSources";
import { shellNow } from "./now";
import { entryHref, routeHref, simHref, type RouteId } from "./routes";
import { sessionAllowsSim, type ShellSession } from "./session";
import { SIM_IDS, type SimId } from "./SimCard";
import { resumeSim, useSimProgress, type SimProgress } from "./home/simProgress";
import { ModeChips } from "./sims/SimulatorsPage";
import { AboutPage } from "./about/AboutPage";
import { SimulatorsPage } from "./sims/SimulatorsPage";

export { SimulatorsPage };

const TRUST_KEYS = ["data", "faculty", "privacy"] as const;
const TRUST_SECTION_ID = "eg-neden-guvenilir";
const HOW_STEPS = ["learn", "practice", "assess", "challenge"] as const;
const HOW_SECTION_ID = "eg-nasil-calisir";
type EmptyPageProps = { titleKey: TrKey; bodyKey: TrKey; children?: ReactNode };

function EmptyPage({ titleKey, bodyKey, children }: EmptyPageProps): JSX.Element {
  return (
    <section className="eg-shell-page">
      <h1 className="eg-shell-page__title">{t(titleKey)}</h1>
      <p className="eg-shell-page__body">{t(bodyKey)}</p>
      {children}
    </section>
  );
}

/** Yumuşak kaydırma hedefinin en dar arayüzü; DOM lib'ine bağımlı değildir. */
interface ScrollTarget { scrollIntoView(): void }
interface ScrollDocument { getElementById(id: string): ScrollTarget | null }

/**
 * Sayfa içi bölüme kaydırır. `href="#..."` hash yönlendiriciyi tetikleyip
 * Bulunamadı sayfasına düşüreceği için gezinme iptal edilir (B1 deseni);
 * DOM'suz ortamda (SSR/test) kaydırma sessizce atlanır.
 */
export function scrollToSection(event: { preventDefault(): void }, id: string): void {
  event.preventDefault();
  const doc = (globalThis as { document?: ScrollDocument }).document;
  doc?.getElementById(id)?.scrollIntoView();
}

export interface HomePageProps {
  /** Oturum varsa başlığın üstünde "Hoş geldiniz" + rol etiketi çizilir. */
  readonly session?: ShellSession | null;
}

/** Ana sayfa: hero + "Nasıl çalışır?" adımları + üç sim kartı + ilerleme sekmeleri + güven kanıtları. */
/** İstanbul saatine göre ay anahtarı ('YYYY-MM') ve bir önceki ay. */
function istanbulMonths(now: number): { readonly month: string; readonly previous: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const monthNo = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    month: `${year}-${pad(monthNo)}`,
    previous: monthNo === 1 ? `${year - 1}-12` : `${year}-${pad(monthNo - 1)}`,
  };
}

/** 26 Eyl 2026: liderlik vitrini — kaynak kabuk veri bağlamından (oturumsuzken çizilmez). */
function HomeShowcase({ session }: { readonly session: ShellSession | null }): JSX.Element | null {
  const sources = useShellDataSources();
  const source = useMemo(() => (sources === null ? null : sources.showcase(session)), [sources, session]);
  const { month, previous } = istanbulMonths(shellNow());
  return <ShowcaseSection month={month} previousMonth={previous} source={source} />;
}

/** T296: sayı/tarih biçimleri (TR). */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(new Date(iso));
}

const SIM_TILE_ICONS: Record<SimId, string> = {
  pulse: "/brand/sims/pulse-icon.png",
  ausculta: "/brand/sims/ausculta-icon.png",
  opaca: "/brand/sims/opaca-icon.png",
};

function TodayCard({ progress }: { readonly progress: Record<SimId, SimProgress> | null }): JSX.Element {
  const resume = progress === null ? null : resumeSim(progress);
  const streak = progress === null ? 0 : Math.max(...SIM_IDS.map((id) => progress[id].streak));
  return (
    <aside aria-labelledby="eg-home-today" className="eg-shell-today">
      <h2 className="eg-shell-today__title" id="eg-home-today">{t("home.today.title")}</h2>
      {resume === null ? (
        <p className="eg-shell-today__empty">{t("home.today.empty")}</p>
      ) : (
        <a className="eg-shell-today__resume" href={simHref(resume.simId)}>
          <img alt="" className="eg-shell-today__icon" height={40} src={SIM_TILE_ICONS[resume.simId]} width={40} />
          <span className="eg-shell-today__what">
            <b>{t(`sims.${resume.simId}.name`)}</b>
            <span>{t("home.today.last")} {resume.lastActive === null ? "" : shortDate(resume.lastActive)}</span>
          </span>
          <span className="eg-shell-today__go">{t("home.today.go")} <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" /></span>
        </a>
      )}
      <dl className="eg-shell-today__stats">
        <div><dt>{t("home.today.streak")}</dt><dd>{streak} {t("home.today.streakUnit")}</dd></div>
        <div><dt>{t("home.today.weekly")}</dt><dd>{resume?.weekly ? `${resume.weekly.current}/${resume.weekly.target}` : "—"}</dd></div>
        <div><dt>{t("home.today.level")}</dt><dd>{resume?.level ?? "—"}</dd></div>
      </dl>
    </aside>
  );
}

function ModesCard(): JSX.Element {
  return (
    <aside aria-labelledby="eg-home-modes" className="eg-shell-today">
      <h2 className="eg-shell-today__title" id="eg-home-modes">{t("home.modes.title")}</h2>
      <ol className="eg-shell-today__modes">
        {HOW_STEPS.map((step, index) => (
          <li key={step}><span aria-hidden="true">{index + 1}</span>{t(`home.how.${step}.title`)}</li>
        ))}
      </ol>
    </aside>
  );
}

function HomeSimCard({ simId, progress, denied }: { readonly simId: SimId; readonly progress: SimProgress | null; readonly denied: boolean }): JSX.Element {
  const complete = progress?.learnComplete ?? null;
  const facts = [
    progress?.bestScore != null ? `${t("sims.page.best")} ${progress.bestScore}` : null,
    progress?.rank != null ? `${t("sims.page.rank")} ${progress.rank.rank}.` : null,
  ].filter((part): part is string => part !== null);
  return (
    <article aria-labelledby={`eg-home-sim-${simId}`} className={`eg-shell-homesim eg-shell-homesim--${simId}`}>
      <div className="eg-shell-homesim__top">
        <img alt="" className="eg-shell-homesim__icon" height={48} src={SIM_TILE_ICONS[simId]} width={48} />
        <div className="eg-shell-homesim__names">
          <h3 className="eg-shell-homesim__name" id={`eg-home-sim-${simId}`}>{t(`sims.${simId}.name`)}</h3>
          <p className="eg-shell-homesim__tag">{t(`sims.${simId}.tagline`)}</p>
        </div>
        {complete !== null ? (
          <span className={`eg-shell-homesim__ring${complete ? " eg-shell-homesim__ring--done" : ""}`}>{complete ? "✓" : t("sims.page.learnOpen")}</span>
        ) : null}
      </div>
      <ModeChips progress={progress} />
      <div className="eg-shell-homesim__foot">
        <span>{denied ? t("sims.access.none") : facts.length > 0 ? facts.join(" · ") : t(`sims.${simId}.body`)}</span>
        <a className="eg-shell-homesim__link" href={simHref(simId)}>
          {t("home.sims.continue")}
          <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
        </a>
      </div>
    </article>
  );
}

export function HomePage({ session = null }: HomePageProps): JSX.Element {
  const progress = useSimProgress(session);
  const resume = progress === null ? null : resumeSim(progress);
  const firstName = session?.displayName?.split(/\s+/)[0] ?? null;
  return (
    <div className="eg-shell-home">
      {/* T296 (depo sahibi onayı 1 Eki 2026): koyu karşılama + Bugün kartı; simler, vitrin, ilerleme, yolculuk, güven. */}
      <section className="eg-shell-homehero">
        <div className="eg-shell-homehero__copy">
          <p className="eg-shell-homehero__eyebrow">
            {session === null ? t("shell.brand.tagline") : firstName !== null ? `${t("home.greeting")}, ${firstName}` : t("home.greeting")}
          </p>
          <h1 className="eg-shell-homehero__title">{t("home.hero.title")}</h1>
          <p className="eg-shell-homehero__lead">{t("home.hero.lead")}</p>
          <p className="eg-shell-homehero__actions">
            {session === null ? (
              <a className="eg-shell-homehero__cta" href={entryHref("student")}>
                {t("home.hero.signin")}
                <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
              </a>
            ) : (
              <a className="eg-shell-homehero__cta" href={resume === null ? routeHref("simulators") : simHref(resume.simId)}>
                {t(resume === null ? "home.hero.cta" : "home.hero.resume")}
                <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
              </a>
            )}
            <a className="eg-shell-homehero__ghost" href={routeHref("simulators")}>{t("shell.simulators.title")}</a>
            <a
              className="eg-shell-homehero__ghost"
              href={`#${HOW_SECTION_ID}`}
              onClick={(event) => scrollToSection(event, HOW_SECTION_ID)}
            >
              {t("home.hero.secondary")}
            </a>
          </p>
        </div>
        {session === null ? <ModesCard /> : <TodayCard progress={progress} />}
      </section>
      <section aria-labelledby="eg-home-sims" className="eg-shell-home__section">
        <div className="eg-shell-home__sectionHead">
          <div>
            <h2 className="eg-shell-section__title" id="eg-home-sims">{t("home.sims.title")}</h2>
            <p className="eg-shell-home__sectionLead">{t("home.sims.lead")}</p>
          </div>
          <a className="eg-shell-homesim__link" href={routeHref("simulators")}>{t("home.sims.all")}<icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" /></a>
        </div>
        <div className="eg-shell-homesims">
          {SIM_IDS.map((id) => (
            <HomeSimCard denied={!sessionAllowsSim(session, id)} key={id} progress={progress?.[id] ?? null} simId={id} />
          ))}
        </div>
      </section>
      <HomeShowcase session={session} />
      <ProgressSection session={session} />
      <section
        aria-labelledby="eg-home-how"
        className="eg-shell-home__section"
        id={HOW_SECTION_ID}
      >
        <h2 className="eg-shell-section__title" id="eg-home-how">
          {t("home.how.title")}
        </h2>
        <ol className="eg-shell-how">
          {HOW_STEPS.map((step, index) => (
            <li className={`eg-shell-how__step eg-shell-how__step--${step}`} key={step}>
              <span aria-hidden="true" className="eg-shell-how__num">{index + 1}</span>
              <h3 className="eg-shell-how__title">{t(`home.how.${step}.title`)}</h3>
              <p className="eg-shell-how__body">{t(`home.how.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        aria-labelledby="eg-home-trust"
        className="eg-shell-home__section"
        id={TRUST_SECTION_ID}
      >
        <h2 className="eg-shell-section__title" id="eg-home-trust">
          {t("home.trust.title")}
        </h2>
        <ul className="eg-shell-trust">
          {TRUST_KEYS.map((key) => (
            <li className="eg-shell-trust__item" key={key}>
              <span aria-hidden="true" className="eg-shell-trust__figure">{t(`home.trust.${key}.figure`)}</span>
              <div>
                <h3 className="eg-shell-trust__title">{t(`home.trust.${key}.title`)}</h3>
                <p className="eg-shell-trust__body">{t(`home.trust.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function NotFoundPage(): JSX.Element {
  return (
    <EmptyPage bodyKey="shell.notFound.body" titleKey="shell.notFound.title">
      <a className="eg-shell-link" href={routeHref("home")}>{t("shell.notFound.link")}</a>
    </EmptyPage>
  );
}

export function pageFor(id: RouteId, session: ShellSession | null = null): JSX.Element {
  if (id === "home") return <HomePage session={session} />;
  if (id === "about") return <AboutPage />;
  return <SimulatorsPage session={session} />;
}

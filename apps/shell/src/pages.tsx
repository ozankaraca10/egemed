import type { JSX, ReactNode } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { ProgressSection } from "./home/ProgressSection";
import { routeHref, simHref, type RouteId } from "./routes";
import type { ShellSession } from "./session";
import { SIM_IDS, SimCard } from "./SimCard";

const TRUST_KEYS = ["data", "faculty", "privacy"] as const;
const TRUST_SECTION_ID = "eg-neden-guvenilir";
const HOW_STEPS = ["learn", "practice", "assess"] as const;
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
export function HomePage({ session = null }: HomePageProps): JSX.Element {
  const roleLabel =
    session === null
      ? null
      : t(session.role === "admin" ? "entry.role.admin" : "entry.role.student");
  return (
    <div className="eg-shell-home">
      <section className="eg-shell-hero">
        {roleLabel !== null && (
          <p className="eg-shell-hero__greeting">
            {t("home.greeting")} · <span className="eg-shell-hero__role">{roleLabel}</span>
          </p>
        )}
        <h1 className="eg-shell-hero__title">{t("home.hero.title")}</h1>
        <p className="eg-shell-hero__lead">{t("home.hero.lead")}</p>
        <p className="eg-shell-hero__actions">
          <a className="eg-shell-cta" href={routeHref("simulators")}>
            {t("home.hero.cta")}
          </a>
          <a
            className="eg-shell-hero__secondary"
            href={`#${HOW_SECTION_ID}`}
            onClick={(event) => scrollToSection(event, HOW_SECTION_ID)}
          >
            {t("home.hero.secondary")}
          </a>
        </p>
      </section>
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
      <section aria-labelledby="eg-home-sims" className="eg-shell-home__section">
        <h2 className="eg-shell-section__title" id="eg-home-sims">
          {t("shell.simulators.title")}
        </h2>
        <ul className="eg-shell-cards">
          {SIM_IDS.map((id) => (
            <li key={id}>
              <SimCard href={simHref(id)} id={id} />
            </li>
          ))}
        </ul>
      </section>
      <ProgressSection session={session} />
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
              <h3 className="eg-shell-trust__title">{t(`home.trust.${key}.title`)}</h3>
              <p className="eg-shell-trust__body">{t(`home.trust.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function TasksPage(): JSX.Element {
  return <EmptyPage bodyKey="shell.tasks.body" titleKey="shell.tasks.title" />;
}

export function NotebookPage(): JSX.Element {
  return (
    <EmptyPage bodyKey="shell.notebook.body" titleKey="shell.notebook.title">
      <p className="eg-shell-page__body">{t("shell.notebook.pending")}</p>
    </EmptyPage>
  );
}

export function NotFoundPage(): JSX.Element {
  return (
    <EmptyPage bodyKey="shell.notFound.body" titleKey="shell.notFound.title">
      <a className="eg-shell-link" href={routeHref("home")}>{t("shell.notFound.link")}</a>
    </EmptyPage>
  );
}

/** Kartlar yalnız logo/ad/tanıtım gösterir; iframe yoktur (gömme T09 sonrası). */
export function SimulatorsPage(): JSX.Element {
  return (
    <section className="eg-shell-page">
      <h1 className="eg-shell-page__title">{t("shell.simulators.title")}</h1>
      <p className="eg-shell-page__body">{t("shell.simulators.body")}</p>
      <ul className="eg-shell-cards">
        {SIM_IDS.map((id) => (
          <li key={id}>
            <SimCard headingLevel={2} href={simHref(id)} id={id} size="large" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ana sayfa dışındaki sayfalar; eksik sayfa derleme zamanında yakalanır. */
const PAGES: Record<Exclude<RouteId, "home">, () => JSX.Element> = {
  notebook: NotebookPage,
  simulators: SimulatorsPage,
  tasks: TasksPage,
};

export function pageFor(id: RouteId, session: ShellSession | null = null): JSX.Element {
  return id === "home" ? <HomePage session={session} /> : PAGES[id]();
}

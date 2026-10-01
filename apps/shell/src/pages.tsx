import { useMemo, type JSX, type ReactNode } from "react";
import { icons } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { ProgressSection } from "./home/ProgressSection";
import { ShowcaseSection } from "./home/ShowcaseSection";
import { useShellDataSources } from "./dataSources";
import { shellNow } from "./now";
import { routeHref, simHref, type RouteId } from "./routes";
import { sessionAllowsSim, type ShellSession } from "./session";
import { SIM_IDS, SimCard } from "./SimCard";
import { AboutPage } from "./about/AboutPage";

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

export function HomePage({ session = null }: HomePageProps): JSX.Element {
  const roleLabel =
    session === null
      ? null
      : t(session.role === "admin" ? "entry.role.admin" : "entry.role.student");
  return (
    <div className="eg-shell-home">
      {/* T162: oturum açmış öğrenci için kompakt karşılama; en çok kullanılan içerik (simler, ilerleme) önce. */}
      <section className="eg-shell-hero eg-shell-hero--compact">
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
            <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
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
      <section aria-labelledby="eg-home-sims" className="eg-shell-home__section">
        <h2 className="eg-shell-section__title" id="eg-home-sims">
          {t("shell.simulators.title")}
        </h2>
        <ul className="eg-shell-cards">
          {SIM_IDS.map((id) => (
            <li key={id}>
              <SimCard denied={!sessionAllowsSim(session, id)} href={simHref(id)} id={id} />
            </li>
          ))}
        </ul>
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
              <h3 className="eg-shell-trust__title">{t(`home.trust.${key}.title`)}</h3>
              <p className="eg-shell-trust__body">{t(`home.trust.${key}.body`)}</p>
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

/** Kartlar yalnız logo/ad/tanıtım gösterir; iframe yoktur (gömme T09 sonrası). */
export function SimulatorsPage({ session = null }: { readonly session?: ShellSession | null }): JSX.Element {
  return (
    <section className="eg-shell-page">
      <h1 className="eg-shell-page__title">{t("shell.simulators.title")}</h1>
      <p className="eg-shell-page__body">{t("shell.simulators.body")}</p>
      <ul className="eg-shell-cards">
        {SIM_IDS.map((id) => (
          <li key={id}>
            <SimCard denied={!sessionAllowsSim(session, id)} headingLevel={2} href={simHref(id)} id={id} size="large" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function pageFor(id: RouteId, session: ShellSession | null = null): JSX.Element {
  if (id === "home") return <HomePage session={session} />;
  if (id === "about") return <AboutPage />;
  return <SimulatorsPage session={session} />;
}

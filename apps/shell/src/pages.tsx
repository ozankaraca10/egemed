import type { JSX, ReactNode } from "react";
import { Badge, Card } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { SIM_PATHS, routeHref, type RouteId } from "./routes";

const SIM_IDS = ["pulse", "ausculta", "opaca"] as const;
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

export function HomePage(): JSX.Element {
  return <EmptyPage bodyKey="shell.home.body" titleKey="shell.home.title" />;
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

/** Kartlar ADR-003 yol uzayını yalnız METİN olarak gösterir; iframe yoktur (gömme T09 sonrası). */
export function SimulatorsPage(): JSX.Element {
  return (
    <EmptyPage bodyKey="shell.simulators.body" titleKey="shell.simulators.title">
      <ul className="eg-shell-cards">
        {SIM_IDS.map((id) => (
          <li key={id}>
            <Card footer={<Badge tone="info">{t("shell.soon")}</Badge>} title={t(`shell.sim.${id}`)}>
              <code>{SIM_PATHS[id]}</code>
            </Card>
          </li>
        ))}
      </ul>
    </EmptyPage>
  );
}

/** Sayfa tablosu; eksik sayfa derleme zamanında yakalanır. */
const PAGES: Record<RouteId, () => JSX.Element> = {
  home: HomePage,
  simulators: SimulatorsPage,
  tasks: TasksPage,
  notebook: NotebookPage,
};

export function pageFor(id: RouteId): JSX.Element {
  return PAGES[id]();
}

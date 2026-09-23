import type { JSX, ReactNode } from "react";
import { t } from "@egemed/ui/i18n";
import { ROUTES, routeHref, type ResolvedRoute } from "./routes";

export interface ShellLayoutProps {
  /** Çözümlenmiş rota; etkin bağlantı işaretlemesi bundan türetilir. */
  route: ResolvedRoute;
  children: ReactNode;
}

/**
 * Kabuk iskeleti: "İçeriğe geç", marka şeridi, tek `nav` ve `main#icerik`;
 * DOM'a dokunmaz. Tek `nav` CSS ile <768 px alt sekme, >=768 px üst bar olur.
 */
export function ShellLayout({ route, children }: ShellLayoutProps): JSX.Element {
  const activeId = route.kind === "page" ? route.route.id : undefined;
  return (
    <div className="eg-shell">
      <a className="eg-shell-skip" href="#icerik">{t("shell.skip")}</a>
      <header className="eg-shell-header">
        <p className="eg-shell-brand">{t("shell.brand")}</p>
        <nav aria-label={t("shell.nav.label")} className="eg-shell-nav">
          {ROUTES.map((item) => (
            <a
              aria-current={item.id === activeId ? "page" : undefined}
              className="eg-shell-nav__link" href={routeHref(item.id)} key={item.id}
            >
              {t(item.labelKey)}
            </a>
          ))}
        </nav>
      </header>
      <main className="eg-shell-main" id="icerik" tabIndex={-1}>{children}</main>
    </div>
  );
}

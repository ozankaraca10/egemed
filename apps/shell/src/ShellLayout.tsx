import type { JSX, ReactNode } from "react";
import { t } from "@egemed/ui/i18n";
import { ROUTES, routeHref, type ResolvedRoute, type RouteId } from "./routes";
import type { ShellSession } from "./session";
import { ShellFooter } from "./ShellFooter";
import { EgemedLogo } from "./brand/EgemedLogo";

export interface ShellLayoutProps {
  /** Çözümlenmiş rota; etkin bağlantı işaretlemesi bundan türetilir. */
  route: ResolvedRoute;
  /** Geçerli oturum (sahte ya da API); yoksa oturum göstergesi çizilmez. */
  session?: ShellSession | null;
  /** "Çıkış yap" işleyicisi; oturum silme ve yönlendirme `App`'te yapılır. */
  onLogout?: () => void;
  children: ReactNode;
}

/** Kabuk `main` öğesi için gereken en dar arayüz. */
interface FocusableMain { focus(): void }

/** Odak hedefini okuyan en dar belge arayüzü; DOM lib'ine bağımlı değildir. */
interface FocusDocument { getElementById(id: string): FocusableMain | null }

/**
 * "İçeriğe geç" işleyicisi (B1): `href="#icerik"` hash yönlendiriciyi tetikleyip
 * Bulunamadı sayfasına düşürdüğü için gezinme iptal edilir ve odak `main`e
 * taşınır (WCAG 2.4.1). `href` JS'siz geri dönüş olarak kalır; DOM'suz ortamda
 * (SSR/test) yalnız odak adımı sessizce atlanır.
 */
export function focusMain(event: { preventDefault(): void }): void {
  event.preventDefault();
  const doc = (globalThis as { document?: FocusDocument }).document;
  doc?.getElementById("icerik")?.focus();
}

/** Simge çizimi; renk `currentColor`'dan gelir, etiketi metin taşır (dekoratif). */
function navIcon(paths: readonly string[]): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="eg-shell-nav__svg"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      {paths.map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

const NAV_ICONS: Record<RouteId, ReactNode> = {
  home: navIcon(["M3 10.5 12 3l9 7.5", "M5.5 9.2V21h13V9.2"]),
  notebook: navIcon(["M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z", "M6 17h13"]),
  simulators: navIcon(["M3 12h4l2-5 3 10 2-5h7", "M3 20h18"]),
  tasks: navIcon(["M4 6h16", "M4 12h16", "M4 18h10"]),
};

/**
 * Kabuk iskeleti: "İçeriğe geç", lacivert marka üst barı, tek `nav` ve
 * `main#icerik`. Render DOM'a dokunmaz; yalnız atlama bağlantısının olay
 * işleyicisi dokunur. Tek `nav` CSS ile <768 px alt sekme, >=768 px üst bar olur.
 */
export function ShellLayout({ route, session, onLogout, children }: ShellLayoutProps): JSX.Element {
  const activeId = route.kind === "page" ? route.route.id : undefined;
  // API oturumunda görünen ad sunucudan gelir; sahte oturumda rol etiketi çizilir.
  const roleLabel = session === undefined || session === null
    ? null
    : session.displayName ?? t(session.role === "admin" ? "shell.session.admin" : "shell.session.student");
  // "Geliştirme oturumu" uyarısı yalnız sentetik oturum içindir (T35b); API
  // oturumu sunucuda kayıt üretir, bu yüzden uyarı çizilmez.
  const synthetic = session !== undefined && session !== null && session.displayName === null;
  return (
    <div className="eg-shell">
      <a className="eg-shell-skip" href="#icerik" onClick={focusMain}>{t("shell.skip")}</a>
      <header className="eg-shell-header">
        <a className="eg-shell-brand" href={routeHref("home")}>
          <EgemedLogo variant="on-dark" />
        </a>
        <div className="eg-shell-header__side">
          {roleLabel !== null && (
            <div className="eg-shell-session">
              <span className="eg-shell-session__role">{roleLabel}</span>
              <button className="eg-shell-session__logout" onClick={onLogout} type="button">
                {t("shell.session.logout")}
              </button>
            </div>
          )}
          <nav aria-label={t("shell.nav.label")} className="eg-shell-nav">
            {ROUTES.map((item) => (
              <a
                aria-current={item.id === activeId ? "page" : undefined}
                className="eg-shell-nav__link" href={routeHref(item.id)} key={item.id}
              >
                <span aria-hidden="true" className="eg-shell-nav__icon">{NAV_ICONS[item.id]}</span>
                <span className="eg-shell-nav__label">{t(item.labelKey)}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="eg-shell-main" id="icerik" tabIndex={-1}>
        {synthetic && <p className="eg-shell-session-banner">{t("shell.session.banner")}</p>}
        {children}
      </main>
      <ShellFooter />
    </div>
  );
}

import type { JSX, ReactNode } from "react";
import { t } from "@egemed/ui/i18n";
import { ADMIN_PATH, ROUTES, routeHref, type ResolvedRoute, type RouteId } from "./routes";
import type { ShellSession } from "./session";
import { ShellFooter } from "./ShellFooter";
import { EgemedLogo } from "./brand/EgemedLogo";
import type { SimChrome } from "@egemed/sim-host";
import { AccountMenu } from "./AccountMenu";
import { SimBar } from "./SimBar";

export interface ShellLayoutProps {
  /** Çözümlenmiş rota; etkin bağlantı işaretlemesi bundan türetilir. */
  route: ResolvedRoute;
  /** Geçerli oturum (sahte ya da API); yoksa oturum göstergesi çizilmez. */
  session?: ShellSession | null;
  /** "Çıkış yap" işleyicisi; oturum silme ve yönlendirme `App`'te yapılır. */
  onLogout?: () => void;
  /** Sim rotasında simin birleşik bara verdiği adım/çip/eylemler. */
  simChrome?: SimChrome | null;
  /** 26 Eyl 2026: hesapsız ziyaretçi; hesap menüsü yerine rozet + "Öğrenci girişi". */
  visitor?: boolean;
  onSignIn?: () => void;
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
  simulators: navIcon(["M3 12h4l2-5 3 10 2-5h7", "M3 20h18"]),
  challenges: navIcon(["M14.5 17.5 3 6V3h3l11.5 11.5", "M13 19l6-6", "M16 16l4 4", "M19 21l2-2", "M9.5 17.5 21 6V3h-3L6.5 14.5", "M11 19l-6-6", "M8 16l-4 4", "M5 21l-2-2"]),
};

/**
 * Kabuk iskeleti: "İçeriğe geç", lacivert marka üst barı, tek `nav` ve
 * `main#icerik`. Render DOM'a dokunmaz; yalnız atlama bağlantısının olay
 * işleyicisi dokunur. Tek `nav` CSS ile <768 px alt sekme, >=768 px üst bar olur.
 */
export function ShellLayout({ route, session, onLogout, simChrome = null, visitor = false, onSignIn, children }: ShellLayoutProps): JSX.Element {
  const activeId = route.kind === "page" ? route.route.id : undefined;
  // UX kararı (25 Eylül 2026): sim rotasında tek birleşik bar ve tam alan;
  // ana gezinme, sayfa başlığı ve kart çizilmez (footer 26 Eyl'den beri her sayfada).
  const simMode = route.kind === "sim";
  // API oturumunda görünen ad sunucudan gelir; sahte oturumda rol etiketi çizilir.
  const roleLabel = session === undefined || session === null
    ? null
    : session.displayName ?? t(session.role === "admin" ? "shell.session.admin" : "shell.session.student");
  // "Geliştirme oturumu" uyarısı yalnız sentetik oturum içindir (T35b); API
  // oturumu sunucuda kayıt üretir, bu yüzden uyarı çizilmez.
  const synthetic = session !== undefined && session !== null && session.displayName === null;
  // T152: API oturumunda ad altında rol; sahte oturumda ad zaten rol etiketidir.
  const accountRole = session !== undefined && session !== null && !synthetic
    ? t(
        session.role === "admin"
          ? "shell.account.role.admin"
          : session.resident === true
            ? "shell.account.role.resident"
            : session.faculty === true
              ? "shell.account.role.faculty"
              : "shell.account.role.student",
      )
    : undefined;
  const adminHref = session?.role === "admin" ? (`#${ADMIN_PATH}` as const) : null;
  const visitorBox = roleLabel === null && visitor && (
    <div className="eg-shell-visitor">
      <span className="eg-shell-visitor__badge">{t("shell.visitor.badge")}</span>
      <button className="eg-shell-visitor__signin" onClick={() => onSignIn?.()} type="button">
        {t("shell.visitor.signIn")}
      </button>
    </div>
  );
  const account = roleLabel !== null ? (
    <AccountMenu
      adminHref={adminHref}
      displayName={roleLabel}
      onLogout={onLogout}
      roleLabel={accountRole}
      synthetic={synthetic}
    />
  ) : visitorBox;
  return (
    <div className="eg-shell">
      <a className="eg-shell-skip" href="#icerik" onClick={focusMain}>{t("shell.skip")}</a>
      <header className={simMode ? "eg-shell-header eg-shell-header--sim" : "eg-shell-header"}>
        <a aria-label={simMode ? t("shell.brand") : undefined} className="eg-shell-brand" href={routeHref("home")}>
          <EgemedLogo compact={simMode} variant="on-dark" />
        </a>
        {route.kind === "sim" && <SimBar chrome={simChrome} simId={route.simId} title={t(route.titleKey)} />}
        {simMode ? (
          // T120: sim rotasında tek hesap düğmesi; menüde ad, not ve çıkış.
          account
        ) : (
          <div className="eg-shell-header__side">
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
            {/* T152: rol çipi + ayrı "Çıkış yap" düğmesi yerine tüm sayfalarda tek hesap menüsü. */}
            {account}
          </div>
        )}
      </header>
      <main className={simMode ? "eg-shell-main eg-shell-main--sim" : "eg-shell-main"} id="icerik" tabIndex={-1}>
        {synthetic && !simMode && <p className="eg-shell-session-banner">{t("shell.session.banner")}</p>}
        {children}
      </main>
      {/* 26 Eyl 2026: footer tek tiptir; sim sayfalarında da aynı platform footer'ı çizilir. */}
      <ShellFooter />
    </div>
  );
}

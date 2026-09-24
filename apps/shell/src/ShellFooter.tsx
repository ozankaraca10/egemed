import type { JSX } from "react";
import { t } from "@egemed/ui/i18n";

export interface ShellFooterProps {
  /** Giriş ekranında sağ panel altında kullanılan küçük varyant. */
  readonly small?: boolean;
}

/**
 * Alt bilgi (framework `components/footer.html` deseni): Ege Tıp amblemi,
 * kurum adı ve telif satırı ortalanmış tek blokta. Amblem dekoratiftir
 * (`alt=""`): kurum adı yanındaki görünür metinde geçer, tek kaynak kalır.
 */
export function ShellFooter({ small = false }: ShellFooterProps): JSX.Element {
  const classes = small ? "eg-shell-footer eg-shell-footer--small" : "eg-shell-footer";
  return (
    <footer aria-label={t("footer.nav.label")} className={classes}>
      <img
        alt=""
        className="eg-shell-footer__seal"
        height={32}
        src="/brand/ege-tip-logo.png"
        width={32}
      />
      <p className="eg-shell-footer__text">
        <span className="eg-shell-footer__institution">{t("footer.institution")}</span>
        <span className="eg-shell-footer__rights">{t("footer.rights")}</span>
      </p>
    </footer>
  );
}

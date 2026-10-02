import type { JSX, ReactNode } from "react";
import { icons } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { ADMIN_PATH, adminAuditHref, adminImportHref, adminRewardsHref, adminRolesHref, adminUsersHref } from "../routes";

type AdminSection = "overview" | "users" | "import" | "roles" | "audit" | "rewards";

interface AdminLink {
  readonly id: AdminSection;
  readonly href: `#${string}`;
  readonly labelKey: TrKey;
  readonly icon: ReactNode;
}

const LINKS: readonly AdminLink[] = [
  { id: "overview", href: `#${ADMIN_PATH}`, labelKey: "admin.nav.overview", icon: <icons.LayoutDashboard /> },
  { id: "users", href: adminUsersHref(), labelKey: "admin.nav.users", icon: <icons.Users /> },
  { id: "import", href: adminImportHref(), labelKey: "admin.nav.import", icon: <icons.Upload /> },
  { id: "roles", href: adminRolesHref(), labelKey: "admin.nav.roles", icon: <icons.ShieldCheck /> },
  { id: "rewards", href: adminRewardsHref(), labelKey: "admin.nav.rewards", icon: <icons.Trophy /> },
  { id: "audit", href: adminAuditHref(), labelKey: "admin.nav.audit", icon: <icons.ScrollText /> },
];

/**
 * T152 — yönetim alanı çerçevesi: masaüstünde sol kenar menüsü, dar ekranda içerik
 * üstünde beş sütunlu sekme şeridi (yatay kaydırma yok). Ana gezinmeden ayrı `nav`
 * (farklı erişilebilir ad); etkin bölüm `aria-current="page"`.
 */
export function AdminFrame({ active, children }: { readonly active: AdminSection; readonly children: ReactNode }): JSX.Element {
  return (
    <div className="eg-shell-adminframe">
      <nav aria-label={t("admin.nav.label")} className="eg-shell-adminframe__nav">
        <ul className="eg-shell-adminframe__list">
          {LINKS.map((link) => (
            <li key={link.id}>
              <a aria-current={link.id === active ? "page" : undefined} className="eg-shell-adminframe__link" href={link.href}>
                <span aria-hidden="true" className="eg-shell-adminframe__icon">{link.icon}</span>
                <span className="eg-shell-adminframe__label">{t(link.labelKey)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="eg-shell-adminframe__content">{children}</div>
    </div>
  );
}

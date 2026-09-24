import type { JSX } from "react";
import { Badge, Card } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { adminImportHref, adminUsersHref } from "./routes";

/** Yönetici paneli bölümleri; "Kullanıcılar" T69a'da, "Toplu içe aktarma" T71'de bağlanır, diğerleri "Yakında" kalır. */
const ADMIN_SECTIONS: readonly { titleKey: TrKey; descKey: TrKey; href?: `#${string}`; openKey?: TrKey }[] = [
  { descKey: "admin.section.overview.desc", titleKey: "admin.section.overview" },
  { descKey: "admin.section.users.desc", href: adminUsersHref(), titleKey: "admin.section.users" },
  {
    descKey: "admin.section.roles.desc",
    href: adminImportHref(),
    openKey: "admin.import.open",
    titleKey: "admin.section.roles",
  },
  { descKey: "admin.section.sims.desc", titleKey: "admin.section.sims" },
  { descKey: "admin.section.integrations.desc", titleKey: "admin.section.integrations" },
  { descKey: "admin.section.audit.desc", titleKey: "admin.section.audit" },
];

/** Yönetici alanı: altı bölüm kartı; "Kullanıcılar" listeye bağlanır, kalanı "Yakında" rozetli. */
export function AdminPage(): JSX.Element {
  return (
    <section className="eg-shell-page">
      <h1 className="eg-shell-page__title">{t("admin.title")}</h1>
      <p className="eg-shell-page__body">{t("admin.intro")}</p>
      <ul className="eg-shell-cards">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.titleKey}>
            <Card
              footer={
                section.href === undefined ? (
                  <Badge tone="info">{t("admin.soon")}</Badge>
                ) : (
                  <a className="eg-shell-admin__link" href={section.href}>{t(section.openKey ?? "admin.users.open")}</a>
                )
              }
              title={t(section.titleKey)}
            >
              <p className="eg-shell-admin__desc">{t(section.descKey)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

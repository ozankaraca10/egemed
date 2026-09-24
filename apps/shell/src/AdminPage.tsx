import type { JSX } from "react";
import { Badge, Card } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";

/** Yönetici paneli bölümleri; hepsi "Yakında" — tıklanabilir işlev yoktur (K1/K4 sonrası). */
const ADMIN_SECTIONS: readonly { titleKey: TrKey; descKey: TrKey }[] = [
  { descKey: "admin.section.overview.desc", titleKey: "admin.section.overview" },
  { descKey: "admin.section.users.desc", titleKey: "admin.section.users" },
  { descKey: "admin.section.roles.desc", titleKey: "admin.section.roles" },
  { descKey: "admin.section.sims.desc", titleKey: "admin.section.sims" },
  { descKey: "admin.section.integrations.desc", titleKey: "admin.section.integrations" },
  { descKey: "admin.section.audit.desc", titleKey: "admin.section.audit" },
];

/** Yönetici alanı taslağı: altı bölüm kartı ve "Yakında" rozetleri; eylem yoktur. */
export function AdminPage(): JSX.Element {
  return (
    <section className="eg-shell-page">
      <h1 className="eg-shell-page__title">{t("admin.title")}</h1>
      <p className="eg-shell-page__body">{t("admin.intro")}</p>
      <ul className="eg-shell-cards">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.titleKey}>
            <Card footer={<Badge tone="info">{t("admin.soon")}</Badge>} title={t(section.titleKey)}>
              <p className="eg-shell-admin__desc">{t(section.descKey)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useEffect, useState, type JSX } from "react";
import { Card, Table } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { useShellSource } from "../dataSources";
import { adminUsersHref } from "../routes";
import { ADMIN_UNITS, createMockUsersSource, DEFAULT_MOCK_SEED, SIM_IDS, type UsersDataSource, type UsersSummary } from "./usersDataSource";

export type RolesLoadStatus = "loading" | "ready" | "error";

interface MatrixRow {
  readonly key: string;
  readonly labelKey: TrKey;
  readonly admin: boolean;
  readonly kullanici: boolean;
  /** Öğretim üyesi sütunu (T184): simleri tam kullanır, oyunlaştırmaya katılmaz. */
  readonly ogretimUyesi: boolean;
  /** Uzmanlık öğrencisi sütunu (T219): öğretim üyesi gibi davranır. */
  readonly uzmanlikOgrencisi: boolean;
}

/** E3 §b/T184/T219 yetki matrisinin salt okunur özeti; atama bu ekrandan yapılmaz (tek yol ilkesi). */
const MATRIX_ROWS: readonly MatrixRow[] = [
  { admin: true, key: "userList", kullanici: false, labelKey: "admin.roles.matrix.userList", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "userManage", kullanici: false, labelKey: "admin.roles.matrix.userManage", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "roleAssign", kullanici: false, labelKey: "admin.roles.matrix.roleAssign", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "simAccess", kullanici: false, labelKey: "admin.roles.matrix.simAccess", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "import", kullanici: false, labelKey: "admin.roles.matrix.import", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "bulk", kullanici: false, labelKey: "admin.roles.matrix.bulk", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: true, key: "audit", kullanici: false, labelKey: "admin.roles.matrix.audit", ogretimUyesi: false, uzmanlikOgrencisi: false },
  { admin: false, key: "simUsage", kullanici: true, labelKey: "admin.roles.matrix.simUsage", ogretimUyesi: true, uzmanlikOgrencisi: true },
  { admin: false, key: "ownSummary", kullanici: true, labelKey: "admin.roles.matrix.ownSummary", ogretimUyesi: true, uzmanlikOgrencisi: true },
  { admin: false, key: "gamification", kullanici: true, labelKey: "admin.roles.matrix.gamification", ogretimUyesi: false, uzmanlikOgrencisi: false },
];

function matrixCell(value: boolean): string {
  return value ? t("admin.roles.matrix.yes") : t("admin.roles.matrix.no");
}

export interface RolesViewProps {
  readonly status: RolesLoadStatus;
  readonly summary: UsersSummary | null;
}

/**
 * Roller ve erişim ekranının durumsuz görünümü (E3 §e.6). Rol kartları,
 * salt okunur yetki matrisi, birimler (sınıflandırma) ve sim erişimi
 * özetinden oluşur; mutasyon yoktur, kullanıcı ayrıntısına bağlantı verilir.
 */
export function RolesView({ status, summary }: RolesViewProps): JSX.Element {
  return (
    <section className="eg-shell-page eg-shell-roles">
      <h1 className="eg-shell-page__title">{t("admin.roles.title")}</h1>
      <p className="eg-shell-page__body">{t("admin.roles.intro")}</p>
      {status === "loading" && (
        <div aria-hidden="true" className="eg-shell-users__skeleton">
          <span className="eg-shell-users__skeleton-row" />
          <span className="eg-shell-users__skeleton-row" />
        </div>
      )}
      {status === "error" && (
        <div className="eg-shell-users__error" role="alert">
          <p className="eg-shell-users__error-title">{t("admin.roles.error.title")}</p>
          <p className="eg-shell-users__error-body">{t("admin.roles.error.body")}</p>
        </div>
      )}
      {status === "ready" && summary !== null && (
        <>
          <div className="eg-shell-roles__cards">
            <Card title={t("admin.roles.card.admin")}>
              <p className="eg-shell-roles__count">
                {summary.roleCounts.admin} {t("admin.roles.card.suffix")}
              </p>
            </Card>
            <Card title={t("admin.roles.card.kullanici")}>
              <p className="eg-shell-roles__count">
                {summary.roleCounts.kullanici} {t("admin.roles.card.suffix")}
              </p>
            </Card>
            <Card title={t("admin.roles.card.ogretim_uyesi")}>
              <p className="eg-shell-roles__count">
                {summary.roleCounts.ogretim_uyesi} {t("admin.roles.card.suffix")}
              </p>
            </Card>
            <Card title={t("admin.roles.card.uzmanlik_ogrencisi")}>
              <p className="eg-shell-roles__count">
                {summary.roleCounts.uzmanlik_ogrencisi} {t("admin.roles.card.suffix")}
              </p>
            </Card>
          </div>
          <h2 className="eg-shell-roles__sectionTitle">{t("admin.roles.matrix.title")}</h2>
          <Table
            caption={t("admin.roles.matrix.title")}
            columns={[
              { cell: (row) => t(row.labelKey), header: t("admin.roles.matrix.capability"), key: "capability" },
              { cell: (row) => matrixCell(row.admin), header: t("admin.roles.matrix.admin"), key: "admin" },
              { cell: (row) => matrixCell(row.kullanici), header: t("admin.roles.matrix.kullanici"), key: "kullanici" },
              {
                cell: (row) => matrixCell(row.ogretimUyesi),
                header: t("admin.roles.matrix.ogretim_uyesi"),
                key: "ogretimUyesi",
              },
              {
                cell: (row) => matrixCell(row.uzmanlikOgrencisi),
                header: t("admin.roles.matrix.uzmanlik_ogrencisi"),
                key: "uzmanlikOgrencisi",
              },
            ]}
            rowKey={(row) => row.key}
            rows={MATRIX_ROWS}
          />
          <h2 className="eg-shell-roles__sectionTitle">{t("admin.roles.units.title")}</h2>
          <ul className="eg-shell-roles__unitList">
            {ADMIN_UNITS.map((unit) => <li key={unit.id}>{unit.name}</li>)}
          </ul>
          <h2 className="eg-shell-roles__sectionTitle">{t("admin.roles.sims.title")}</h2>
          <ul className="eg-shell-roles__simList">
            {SIM_IDS.map((simId) => (
              <li key={simId}>
                {t(`sims.${simId}.name`)}: {summary.simCounts[simId]} {t("admin.roles.sims.count")}
              </li>
            ))}
          </ul>
          <a className="eg-shell-admin__link" href={adminUsersHref()}>{t("admin.roles.usersLink")}</a>
        </>
      )}
    </section>
  );
}

export interface RolesPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
}

/**
 * Roller ve erişim kabuk rotası (`#/admin/roller`, T73). Özet
 * `UsersDataSource.summary()` üzerinden enjekte edilir; çizim `RolesView`'dedir.
 */
export function RolesPage({ dataSource }: RolesPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.users, () => createMockUsersSource(DEFAULT_MOCK_SEED));

  const [status, setStatus] = useState<RolesLoadStatus>("loading");
  const [summary, setSummary] = useState<UsersSummary | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    source.summary().then(
      (next) => {
        if (!active) return;
        setSummary(next);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return <RolesView status={status} summary={summary} />;
}

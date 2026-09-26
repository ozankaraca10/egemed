import { useEffect, useState, type JSX } from "react";
import { Badge, Button, DataTable, DateField, Dialog, EmptyState, Field, Modal, Pagination, Select, TextInput, icons, type DataTableColumn } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { useShellSource } from "../dataSources";
import { shellNow } from "../now";
import { formatTrDateTime } from "./trFormat";

/**
 * `shellNow()`'ı (AGENTS.md: `Date.now()` YOK) Europe/Istanbul duvar tarihine (ISO
 * "YYYY-MM-DD") çevirir; yalnız `DateField`in "bugün" vurgusu için kullanılır
 * (sabit UTC+3 — `trFormat.ts` ile aynı varsayım, DST yok).
 */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
function nowIsoDate(nowMs: number): string {
  const wall = new Date(nowMs + TR_OFFSET_MS);
  const year = wall.getUTCFullYear();
  const month = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wall.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
import {
  AUDIT_ACTIONS,
  createMockAuditSource,
  hasActiveAuditFilters,
  type AuditAction,
  type AuditDataSource,
  type AuditEntry,
  type AuditListQuery,
  type AuditListResult,
} from "./auditDataSource";

export type AuditLoadStatus = "loading" | "ready" | "error";

/** Kök tsconfig DOM lib'i taşımadığı için değişim olayı en dar arayüzle okunur (UsersPage.tsx deseni). */
interface ChangeLike { target: unknown }
function changeValue(event: ChangeLike): string {
  return (event.target as unknown as { value: string }).value;
}

const ACTION_KEYS: Record<AuditAction, TrKey> = {
  "import.apply": "admin.audit.action.import.apply",
  "purge.run": "admin.audit.action.purge.run",
  "role.grant": "admin.audit.action.role.grant",
  "role.revoke": "admin.audit.action.role.revoke",
  "user.activate": "admin.audit.action.user.activate",
  "user.create": "admin.audit.action.user.create",
  "user.delete": "admin.audit.action.user.delete",
  "user.suspend": "admin.audit.action.user.suspend",
};

const DEFAULT_QUERY: AuditListQuery = { page: 1, pageSize: 20 };

/** Yalnız aktör/eylem/hedef/tarih filtrelerinden etkin olanları sayar (mobil "Filtreler" rozeti). */
function countActiveAuditFilters(query: AuditListQuery): number {
  let count = 0;
  if ((query.actor?.trim().length ?? 0) > 0) count += 1;
  if (query.action !== undefined) count += 1;
  if ((query.target?.trim().length ?? 0) > 0) count += 1;
  if (query.from !== undefined) count += 1;
  if (query.to !== undefined) count += 1;
  return count;
}

function buildAuditColumns(onOpenDetail: (entry: AuditEntry) => void): readonly DataTableColumn<AuditEntry>[] {
  return [
    { cell: (entry) => formatTrDateTime(entry.occurredAt), header: t("admin.audit.table.occurredAt"), key: "occurredAt" },
    { cell: (entry) => entry.actorName, header: t("admin.audit.table.actor"), key: "actor" },
    { cell: (entry) => t(ACTION_KEYS[entry.action]), header: t("admin.audit.table.action"), key: "action" },
    { cell: (entry) => entry.targetName ?? t("admin.audit.noTarget"), header: t("admin.audit.table.target"), key: "target" },
    {
      cell: (entry) => (
        <Button onClick={() => onOpenDetail(entry)} variant="secondary">{t("admin.audit.table.detail")}</Button>
      ),
      header: t("admin.audit.table.detail"),
      key: "detail",
    },
  ];
}

interface FilterFieldsProps {
  readonly query: AuditListQuery;
  readonly onFilterChange: (patch: Partial<AuditListQuery>) => void;
  readonly today: string;
}

/** Filtre alanları: masaüstünde yatay çubukta, 360/768'te "Filtreler" diyaloğu içinde aynı
 *  bileşen iki kez çizilir (kırılım yalnız CSS'te, T156). Tarih alanları @egemed/ui
 *  `DateField` (T157/T161); değer biçimi ISO "YYYY-MM-DD" olarak kalır. */
function AuditFilterFields({ query, onFilterChange, today }: FilterFieldsProps): JSX.Element {
  return (
    <>
      <Field label={t("admin.audit.filter.actor")}>
        {(control) => (
          <TextInput {...control} onChange={(event: ChangeLike) => onFilterChange({ actor: changeValue(event) || undefined })} type="search" value={query.actor ?? ""} />
        )}
      </Field>
      <Field label={t("admin.audit.filter.action")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onFilterChange({ action: value === "" ? undefined : (value as AuditAction) })}
            options={[
              { label: t("admin.audit.filter.action.all"), value: "" },
              ...AUDIT_ACTIONS.map((action) => ({ label: t(ACTION_KEYS[action]), value: action })),
            ]}
            value={query.action ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.audit.filter.target")}>
        {(control) => (
          <TextInput {...control} onChange={(event: ChangeLike) => onFilterChange({ target: changeValue(event) || undefined })} type="search" value={query.target ?? ""} />
        )}
      </Field>
      <Field label={t("admin.audit.filter.from")}>
        {(control) => (
          <DateField
            {...control}
            onValueChange={(value) => onFilterChange({ from: value === "" ? undefined : value })}
            today={today}
            value={query.from ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.audit.filter.to")}>
        {(control) => (
          <DateField
            {...control}
            onValueChange={(value) => onFilterChange({ to: value === "" ? undefined : value })}
            today={today}
            value={query.to ?? ""}
          />
        )}
      </Field>
    </>
  );
}

export interface AuditViewProps {
  readonly status: AuditLoadStatus;
  readonly query: AuditListQuery;
  readonly result: AuditListResult | null;
  readonly detailEntry: AuditEntry | null;
  readonly onFilterChange: (patch: Partial<AuditListQuery>) => void;
  readonly onClearFilters: () => void;
  readonly onPageChange: (page: number) => void;
  readonly onOpenDetail: (entry: AuditEntry) => void;
  readonly onCloseDetail: () => void;
  readonly onRetry: () => void;
  /** <768 px "Filtreler" diyaloğunun açık/kapalı durumu; salt görsel olduğu için
   *  `AuditPage` üzerinde tutulur (view saf props'tan beslenir, T156). */
  readonly filtersOpen: boolean;
  readonly onFiltersOpenChange: (open: boolean) => void;
  /** `DateField`in "bugün" vurgusu için ISO tarih (Date.now() KULLANILMAZ, AGENTS.md);
   *  `AuditPage` enjekte edilen `shellNow`'dan üretir. */
  readonly today: string;
}

/**
 * Denetim günlüğü ekranının durumsuz (props'tan beslenen) görünümü (E3 §e.7).
 * Salt okunur: onay/mutasyon yoktur. `AuditPage` veri getirmeyi sarar.
 */
export function AuditView({
  status,
  query,
  result,
  detailEntry,
  onFilterChange,
  onClearFilters,
  onPageChange,
  onOpenDetail,
  onCloseDetail,
  onRetry,
  filtersOpen,
  onFiltersOpenChange,
  today,
}: AuditViewProps): JSX.Element {
  const filtered = hasActiveAuditFilters(query);
  const activeCount = countActiveAuditFilters(query);
  const columns = buildAuditColumns(onOpenDetail);

  const emptyState = filtered ? (
    <EmptyState
      action={<Button onClick={onClearFilters} variant="secondary">{t("admin.audit.filter.clear")}</Button>}
      icon={<icons.ScrollText />}
      title={t("admin.audit.filtered.empty")}
    />
  ) : (
    <EmptyState icon={<icons.ScrollText />} title={t("table.empty")} />
  );

  return (
    <section className="eg-shell-page eg-shell-users">
      <div className="eg-shell-users__head">
        <h1 className="eg-shell-page__title">{t("admin.audit.title")}</h1>
        <div className="eg-shell-adminlist__actions">
          <Button onClick={onClearFilters} variant="ghost">{t("admin.audit.filter.clear")}</Button>
        </div>
      </div>
      <div className="eg-shell-adminlist__filterbar">
        <AuditFilterFields onFilterChange={onFilterChange} query={query} today={today} />
      </div>
      <div className="eg-shell-adminlist__filtertrigger">
        <Button icon={<icons.Filter />} onClick={() => onFiltersOpenChange(true)} variant="secondary">
          {t("admin.audit.filter.open")}
          {activeCount > 0 ? <Badge tone="info">{String(activeCount)}</Badge> : null}
        </Button>
      </div>
      <Dialog
        footer={<Button onClick={onClearFilters} variant="ghost">{t("admin.audit.filter.clear")}</Button>}
        onOpenChange={onFiltersOpenChange}
        open={filtersOpen}
        title={t("admin.audit.filter.open")}
      >
        <div className="eg-shell-adminlist__filterfields">
          <AuditFilterFields onFilterChange={onFilterChange} query={query} today={today} />
        </div>
      </Dialog>
      {status === "error" ? (
        <div className="eg-shell-users__error" role="alert">
          <p className="eg-shell-users__error-title">{t("admin.audit.error.title")}</p>
          <p className="eg-shell-users__error-body">{t("admin.audit.error.body")}</p>
          <Button onClick={onRetry} variant="secondary">{t("admin.audit.error.retry")}</Button>
        </div>
      ) : (
        <>
          <DataTable<AuditEntry>
            caption={t("admin.audit.table.caption")}
            columns={columns}
            empty={emptyState}
            loading={status === "loading"}
            rowKey={(entry) => entry.id}
            rows={status === "ready" && result !== null ? result.data : []}
          />
          {status === "ready" && result !== null && result.meta.total > 0 && (
            <Pagination
              onPageChange={onPageChange}
              page={result.meta.page}
              pageCount={Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize))}
              pageSize={result.meta.pageSize}
              total={result.meta.total}
            />
          )}
        </>
      )}
      <Modal onClose={onCloseDetail} open={detailEntry !== null} title={t("admin.audit.detail.title")}>
        {detailEntry !== null && (
          <div className="eg-shell-userform__confirm">
            <p>{formatTrDateTime(detailEntry.occurredAt)} · {detailEntry.actorName}</p>
            <p>{t(ACTION_KEYS[detailEntry.action])} · {detailEntry.targetName ?? t("admin.audit.noTarget")}</p>
            <p>{detailEntry.summary}</p>
            <div className="eg-shell-userform__actions">
              <button onClick={onCloseDetail} type="button">{t("admin.audit.detail.close")}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

export interface AuditPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: AuditDataSource;
}

/**
 * Denetim günlüğü kabuk rotası (`#/admin/denetim`, T73). Veri
 * `AuditDataSource` üzerinden enjekte edilir; çizim `AuditView`'dedir.
 */
export function AuditPage({ dataSource }: AuditPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.audit, () => createMockAuditSource());

  const [query, setQuery] = useState<AuditListQuery>(DEFAULT_QUERY);
  const [status, setStatus] = useState<AuditLoadStatus>("loading");
  const [result, setResult] = useState<AuditListResult | null>(null);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [today] = useState(() => nowIsoDate(shellNow()));

  useEffect(() => {
    let active = true;
    setStatus("loading");
    source.list(query).then(
      (next) => {
        if (!active) return;
        setResult(next);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [query, attempt]);

  function updateQuery(patch: Partial<AuditListQuery>): void {
    setQuery((prev) => ({ ...prev, ...patch, page: 1 }));
  }

  return (
    <AuditView
      detailEntry={detailEntry}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
      onClearFilters={() => setQuery(DEFAULT_QUERY)}
      onCloseDetail={() => setDetailEntry(null)}
      onFilterChange={(patch) => updateQuery(patch)}
      onOpenDetail={setDetailEntry}
      onPageChange={(page) => setQuery((prev) => ({ ...prev, page }))}
      onRetry={() => setAttempt((value) => value + 1)}
      query={query}
      result={result}
      status={status}
      today={today}
    />
  );
}

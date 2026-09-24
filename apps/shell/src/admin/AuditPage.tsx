import { useEffect, useRef, useState, type JSX } from "react";
import { Modal } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { formatTrDateTime } from "./trFormat";
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

interface RowsProps {
  readonly entries: readonly AuditEntry[];
  readonly onOpenDetail: (entry: AuditEntry) => void;
}

/** ≥768 px tablo görünümü (E3 §e.7); 360 px'te CSS ile gizlenir. */
function AuditTable({ entries, onOpenDetail }: RowsProps): JSX.Element {
  return (
    <table className="eg-shell-users__table" role="table">
      <caption className="eg-shell-users__caption">{t("admin.audit.table.caption")}</caption>
      <thead>
        <tr role="row">
          <th role="columnheader" scope="col">{t("admin.audit.table.occurredAt")}</th>
          <th role="columnheader" scope="col">{t("admin.audit.table.actor")}</th>
          <th role="columnheader" scope="col">{t("admin.audit.table.action")}</th>
          <th role="columnheader" scope="col">{t("admin.audit.table.target")}</th>
          <th role="columnheader" scope="col">
            <span className="eg-visually-hidden">{t("admin.audit.table.detail")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} role="row">
            <td role="cell">{formatTrDateTime(entry.occurredAt)}</td>
            <td role="cell">{entry.actorName}</td>
            <td role="cell">{t(ACTION_KEYS[entry.action])}</td>
            <td role="cell">{entry.targetName ?? t("admin.audit.noTarget")}</td>
            <td role="cell">
              <button className="eg-shell-audit__detail" onClick={() => onOpenDetail(entry)} type="button">
                {t("admin.audit.table.detail")}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 360 px kart listesi (E3 §e.7); ≥768 px'te CSS ile gizlenir. */
function AuditCards({ entries, onOpenDetail }: RowsProps): JSX.Element {
  return (
    <ul aria-label={t("admin.audit.cards.label")} className="eg-shell-users__cards">
      {entries.map((entry) => (
        <li className="eg-shell-users__card" key={entry.id}>
          <div className="eg-shell-users__card-body">
            <p className="eg-shell-users__card-name">{formatTrDateTime(entry.occurredAt)}</p>
            <p className="eg-shell-users__card-meta">{entry.actorName} · {t(ACTION_KEYS[entry.action])}</p>
            <p className="eg-shell-users__card-meta">{entry.targetName ?? t("admin.audit.noTarget")}</p>
            <button className="eg-shell-audit__detail" onClick={() => onOpenDetail(entry)} type="button">
              {t("admin.audit.table.detail")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface FiltersProps {
  readonly query: AuditListQuery;
  readonly onFilterChange: (patch: Partial<AuditListQuery>) => void;
  readonly onClearFilters: () => void;
}

/** 360/768'te katlanır panel, 1440'ta tek satır; kırılım yalnız CSS'tedir (UsersFilters deseniyle aynı). */
function AuditFilters({ query, onFilterChange, onClearFilters }: FiltersProps): JSX.Element {
  return (
    <div className="eg-shell-users__filters">
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.audit.filter.actor")}</span>
        <input
          onChange={(event: ChangeLike) => onFilterChange({ actor: changeValue(event) || undefined })}
          type="search"
          value={query.actor ?? ""}
        />
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.audit.filter.action")}</span>
        <select
          onChange={(event: ChangeLike) => {
            const value = changeValue(event);
            onFilterChange({ action: value === "" ? undefined : (value as AuditAction) });
          }}
          value={query.action ?? ""}
        >
          <option value="">{t("admin.audit.filter.action.all")}</option>
          {AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{t(ACTION_KEYS[action])}</option>)}
        </select>
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.audit.filter.target")}</span>
        <input
          onChange={(event: ChangeLike) => onFilterChange({ target: changeValue(event) || undefined })}
          type="search"
          value={query.target ?? ""}
        />
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.audit.filter.from")}</span>
        <input
          onChange={(event: ChangeLike) => onFilterChange({ from: changeValue(event) || undefined })}
          type="date"
          value={query.from ?? ""}
        />
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.audit.filter.to")}</span>
        <input
          onChange={(event: ChangeLike) => onFilterChange({ to: changeValue(event) || undefined })}
          type="date"
          value={query.to ?? ""}
        />
      </label>
      <button className="eg-shell-users__clear" onClick={onClearFilters} type="button">
        {t("admin.audit.filter.clear")}
      </button>
    </div>
  );
}

function AuditPagination({
  result,
  onPageChange,
}: {
  readonly result: AuditListResult;
  readonly onPageChange: (page: number) => void;
}): JSX.Element {
  const { meta } = result;
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="eg-shell-users__pagination">
      <button disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} type="button">
        {t("admin.audit.pagination.prev")}
      </button>
      <span>{`${t("admin.audit.pagination.page")} ${meta.page}/${totalPages}`}</span>
      <button disabled={meta.page >= totalPages} onClick={() => onPageChange(meta.page + 1)} type="button">
        {t("admin.audit.pagination.next")}
      </button>
      <span>{`${from}-${to}/${meta.total} ${t("admin.audit.pagination.records")}`}</span>
    </div>
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
}: AuditViewProps): JSX.Element {
  const filtered = hasActiveAuditFilters(query);
  return (
    <section className="eg-shell-page eg-shell-users">
      <h1 className="eg-shell-page__title">{t("admin.audit.title")}</h1>
      <AuditFilters onClearFilters={onClearFilters} onFilterChange={onFilterChange} query={query} />
      {status === "loading" && (
        <div aria-hidden="true" className="eg-shell-users__skeleton">
          <span className="eg-shell-users__skeleton-row" />
          <span className="eg-shell-users__skeleton-row" />
          <span className="eg-shell-users__skeleton-row" />
        </div>
      )}
      {status === "error" && (
        <div className="eg-shell-users__error" role="alert">
          <p className="eg-shell-users__error-title">{t("admin.audit.error.title")}</p>
          <p className="eg-shell-users__error-body">{t("admin.audit.error.body")}</p>
          <button onClick={onRetry} type="button">{t("admin.audit.error.retry")}</button>
        </div>
      )}
      {status === "ready" && result !== null && result.meta.total === 0 && (
        <div className="eg-shell-users__empty">
          <p>{filtered ? t("admin.audit.filtered.empty") : t("table.empty")}</p>
          {filtered && <button onClick={onClearFilters} type="button">{t("admin.audit.filter.clear")}</button>}
        </div>
      )}
      {status === "ready" && result !== null && result.meta.total > 0 && (
        <>
          <AuditTable entries={result.data} onOpenDetail={onOpenDetail} />
          <AuditCards entries={result.data} onOpenDetail={onOpenDetail} />
          <AuditPagination onPageChange={onPageChange} result={result} />
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

function defaultSource(): AuditDataSource {
  return createMockAuditSource();
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
  const sourceRef = useRef<AuditDataSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = dataSource ?? defaultSource();

  const [query, setQuery] = useState<AuditListQuery>(DEFAULT_QUERY);
  const [status, setStatus] = useState<AuditLoadStatus>("loading");
  const [result, setResult] = useState<AuditListResult | null>(null);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    sourceRef.current?.list(query).then(
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
      onClearFilters={() => setQuery(DEFAULT_QUERY)}
      onCloseDetail={() => setDetailEntry(null)}
      onFilterChange={(patch) => updateQuery(patch)}
      onOpenDetail={setDetailEntry}
      onPageChange={(page) => setQuery((prev) => ({ ...prev, page }))}
      onRetry={() => setAttempt((value) => value + 1)}
      query={query}
      result={result}
      status={status}
    />
  );
}

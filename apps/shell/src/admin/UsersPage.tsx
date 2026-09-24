import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { Badge, Modal, type BadgeTone } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { adminUserCreateHref, adminUserDetailHref } from "../routes";
import {
  ADMIN_UNITS,
  BULK_OPERATIONS,
  BULK_STATUSES,
  createMockUsersSource,
  clampPage,
  DEFAULT_MOCK_SEED,
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  hasActiveFilters,
  SIM_IDS,
  toggleSelected,
  unitNameFor,
  USER_AUTH_METHODS,
  USER_ROLES,
  USER_STATUSES,
  type AdminUnit,
  type AdminUser,
  type BulkEditInput,
  type BulkEditResult,
  type BulkOperation,
  type BulkStatus,
  type SimId,
  type SortOrder,
  type UserAuthMethod,
  type UserRole,
  type UsersDataSource,
  type UsersListMeta,
  type UsersListQuery,
  type UsersListResult,
  type UserSort,
  type UserStatus,
} from "./usersDataSource";

/** Toplu düzenleme (E3 §e.5) işlem+değer birleşimine göre tip-güvenli `BulkEditInput` üretir. */
function buildBulkInput(userIds: readonly string[], operation: BulkOperation, value: string): BulkEditInput {
  if (operation === "assign_role" || operation === "revoke_role") return { operation, userIds, value: value as UserRole };
  if (operation === "set_unit") return { operation, userIds, value };
  if (operation === "set_status") return { operation, userIds, value: value as BulkStatus };
  return { operation, userIds, value: value as SimId };
}

/** İşlem değiştiğinde her operasyon için geçerli bir başlangıç değeri seçer. */
function defaultBulkValue(operation: BulkOperation): string {
  if (operation === "assign_role" || operation === "revoke_role") return "kullanici";
  if (operation === "set_unit") return ADMIN_UNITS[0]?.id ?? "";
  if (operation === "set_status") return "active";
  return SIM_IDS[0] ?? "pulse";
}

const BULK_OPERATION_KEYS: Record<BulkOperation, TrKey> = {
  assign_role: "admin.bulk.operation.assign_role",
  grant_sim: "admin.bulk.operation.grant_sim",
  revoke_role: "admin.bulk.operation.revoke_role",
  revoke_sim: "admin.bulk.operation.revoke_sim",
  set_status: "admin.bulk.operation.set_status",
  set_unit: "admin.bulk.operation.set_unit",
};
const BULK_STATUS_KEYS: Record<BulkStatus, TrKey> = {
  active: "admin.bulk.status.active",
  suspended: "admin.bulk.status.suspended",
};
const BULK_SKIP_REASON_KEYS: Record<string, TrKey> = {
  no_change: "admin.bulk.result.skip.no_change",
  would_orphan_roles: "admin.bulk.result.skip.would_orphan_roles",
};

/** Ekran durumu: yükleniyor → hazır | hata (SimRoute deseniyle aynı). */
export type UsersLoadStatus = "loading" | "ready" | "error";

/** Kök tsconfig DOM lib'i taşımadığı için değişim olayı en dar arayüzle okunur (EntryPage.tsx deseni). */
interface ChangeLike { target: unknown }

function changeValue(event: ChangeLike): string {
  return (event.target as unknown as { value: string }).value;
}

const ROLE_KEYS: Record<UserRole, TrKey> = {
  admin: "admin.users.role.admin",
  kullanici: "admin.users.role.kullanici",
};
const STATUS_KEYS: Record<UserStatus, TrKey> = {
  active: "admin.users.status.active",
  deleted: "admin.users.status.deleted",
  invited: "admin.users.status.invited",
  suspended: "admin.users.status.suspended",
};
const STATUS_TONE: Record<UserStatus, BadgeTone> = {
  active: "success",
  deleted: "danger",
  invited: "info",
  suspended: "warning",
};
const AUTH_KEYS: Record<UserAuthMethod, TrKey> = {
  dev: "admin.users.authMethod.dev",
  sso: "admin.users.authMethod.sso",
};

/** Sıralama alanı + yönü birleşik seçim değeri (tek `<select>`). */
type SortChoice = `${UserSort}-${SortOrder}`;

const SORT_CHOICES: readonly { readonly value: SortChoice; readonly labelKey: TrKey }[] = [
  { labelKey: "admin.users.sort.displayNameAsc", value: "displayName-asc" },
  { labelKey: "admin.users.sort.displayNameDesc", value: "displayName-desc" },
  { labelKey: "admin.users.sort.createdAtDesc", value: "createdAt-desc" },
  { labelKey: "admin.users.sort.createdAtAsc", value: "createdAt-asc" },
  { labelKey: "admin.users.sort.lastLoginDesc", value: "lastLoginAt-desc" },
  { labelKey: "admin.users.sort.lastLoginAsc", value: "lastLoginAt-asc" },
];

export function sortChoiceFor(sort: UserSort = DEFAULT_SORT, order: SortOrder = DEFAULT_ORDER): SortChoice {
  return `${sort}-${order}`;
}

export function parseSortChoice(value: string): { sort: UserSort; order: SortOrder } {
  const [sort, order] = value.split("-") as [UserSort, SortOrder];
  return { order, sort };
}

const DEFAULT_QUERY: UsersListQuery = {
  order: DEFAULT_ORDER,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: DEFAULT_SORT,
};

/** Seçim satırı erişilebilir adı: "{ad} — Seç". */
function selectLabel(displayName: string): string {
  return `${displayName} — ${t("admin.users.table.select")}`;
}

function UserStatusBadge({ status }: { readonly status: UserStatus }): JSX.Element {
  return <Badge tone={STATUS_TONE[status]}>{t(STATUS_KEYS[status])}</Badge>;
}

interface RowsProps {
  readonly users: readonly AdminUser[];
  readonly units: readonly AdminUnit[];
  readonly selected: ReadonlySet<string>;
  readonly onToggleSelect: (id: string) => void;
}

/** ≥768 px tablo görünümü (E3 §e.1); 360 px'te CSS ile gizlenir. */
export function UsersTable({ users, units, selected, onToggleSelect }: RowsProps): JSX.Element {
  return (
    <table className="eg-shell-users__table" role="table">
      <caption className="eg-shell-users__caption">{t("admin.users.table.caption")}</caption>
      <thead>
        <tr role="row">
          <th role="columnheader" scope="col">
            <span className="eg-visually-hidden">{t("admin.users.table.select")}</span>
          </th>
          <th role="columnheader" scope="col">{t("admin.users.table.name")}</th>
          <th role="columnheader" scope="col">{t("admin.users.table.username")}</th>
          <th role="columnheader" scope="col">{t("admin.users.table.role")}</th>
          <th role="columnheader" scope="col">{t("admin.users.table.unit")}</th>
          <th role="columnheader" scope="col">{t("admin.users.table.status")}</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} role="row">
            <td role="cell">
              <input
                aria-label={selectLabel(user.displayName)}
                checked={selected.has(user.id)}
                onChange={() => onToggleSelect(user.id)}
                type="checkbox"
              />
            </td>
            <td role="cell">
              <a className="eg-shell-users__name-link" href={adminUserDetailHref(user.id)}>
                {user.displayName}
              </a>
            </td>
            <td role="cell">{user.username}</td>
            <td role="cell">{t(ROLE_KEYS[user.role])}</td>
            <td role="cell">{unitNameFor(user.unitId, units)}</td>
            <td role="cell">
              <UserStatusBadge status={user.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 360 px kart listesi (E3 §e.1); ≥768 px'te CSS ile gizlenir. */
export function UsersCards({ users, units, selected, onToggleSelect }: RowsProps): JSX.Element {
  return (
    <ul aria-label={t("admin.users.cards.label")} className="eg-shell-users__cards">
      {users.map((user) => (
        <li className="eg-shell-users__card" key={user.id}>
          <input
            aria-label={selectLabel(user.displayName)}
            checked={selected.has(user.id)}
            className="eg-shell-users__card-select"
            onChange={() => onToggleSelect(user.id)}
            type="checkbox"
          />
          <div className="eg-shell-users__card-body">
            <a className="eg-shell-users__card-name" href={adminUserDetailHref(user.id)}>
              {user.displayName}
            </a>
            <p className="eg-shell-users__card-meta">
              {t(ROLE_KEYS[user.role])} · {unitNameFor(user.unitId, units)}
            </p>
            <div className="eg-shell-users__card-badges">
              <UserStatusBadge status={user.status} />
              <Badge>{t(AUTH_KEYS[user.authMethod])}</Badge>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface FiltersProps {
  readonly query: UsersListQuery;
  readonly units: readonly AdminUnit[];
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (patch: Partial<UsersListQuery>) => void;
  readonly onSortChange: (choice: SortChoice) => void;
  readonly onClearFilters: () => void;
}

/** 360/768'te katlanır panel, 1440'ta tek satır; kırılım yalnız CSS'tedir (E3 §e.1). */
function UsersFilters({
  query,
  units,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onClearFilters,
}: FiltersProps): JSX.Element {
  return (
    <div className="eg-shell-users__filters">
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.filter.search")}</span>
        <input
          onChange={(event: ChangeLike) => onSearchChange(changeValue(event))}
          type="search"
          value={query.q ?? ""}
        />
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.filter.role")}</span>
        <select
          onChange={(event: ChangeLike) => {
            const value = changeValue(event);
            onFilterChange({ role: value === "" ? undefined : (value as UserRole) });
          }}
          value={query.role ?? ""}
        >
          <option value="">{t("admin.users.filter.role.all")}</option>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>{t(ROLE_KEYS[role])}</option>
          ))}
        </select>
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.filter.unit")}</span>
        <select
          onChange={(event: ChangeLike) => {
            const value = changeValue(event);
            onFilterChange({ unitId: value === "" ? undefined : value });
          }}
          value={query.unitId ?? ""}
        >
          <option value="">{t("admin.users.filter.unit.all")}</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.name}</option>
          ))}
        </select>
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.filter.status")}</span>
        <select
          onChange={(event: ChangeLike) => {
            const value = changeValue(event);
            onFilterChange({ status: value === "" ? undefined : (value as UserStatus) });
          }}
          value={query.status ?? ""}
        >
          <option value="">{t("admin.users.filter.status.all")}</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>{t(STATUS_KEYS[status])}</option>
          ))}
        </select>
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.filter.authMethod")}</span>
        <select
          onChange={(event: ChangeLike) => {
            const value = changeValue(event);
            onFilterChange({ authMethod: value === "" ? undefined : (value as UserAuthMethod) });
          }}
          value={query.authMethod ?? ""}
        >
          <option value="">{t("admin.users.filter.authMethod.all")}</option>
          {USER_AUTH_METHODS.map((method) => (
            <option key={method} value={method}>{t(AUTH_KEYS[method])}</option>
          ))}
        </select>
      </label>
      <label className="eg-shell-users__field">
        <span className="eg-shell-users__field-label">{t("admin.users.sort.label")}</span>
        <select
          onChange={(event: ChangeLike) => onSortChange(changeValue(event) as SortChoice)}
          value={sortChoiceFor(query.sort, query.order)}
        >
          {SORT_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{t(choice.labelKey)}</option>
          ))}
        </select>
      </label>
      <button className="eg-shell-users__clear" onClick={onClearFilters} type="button">
        {t("admin.users.filter.clear")}
      </button>
    </div>
  );
}

function UsersPagination({
  meta,
  onPageChange,
}: {
  readonly meta: UsersListMeta;
  readonly onPageChange: (page: number) => void;
}): JSX.Element {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="eg-shell-users__pagination">
      <button disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} type="button">
        {t("admin.users.pagination.prev")}
      </button>
      <span>{`${t("admin.users.pagination.page")} ${meta.page}/${totalPages}`}</span>
      <button disabled={meta.page >= totalPages} onClick={() => onPageChange(meta.page + 1)} type="button">
        {t("admin.users.pagination.next")}
      </button>
      <span>{`${from}-${to}/${meta.total} ${t("admin.users.pagination.records")}`}</span>
    </div>
  );
}

interface BulkEditDialogProps {
  readonly open: boolean;
  readonly count: number;
  readonly units: readonly AdminUnit[];
  readonly operation: BulkOperation;
  readonly value: string;
  readonly preview: BulkEditResult | null;
  readonly previewStatus: "idle" | "loading" | "error";
  readonly applyStatus: "idle" | "loading" | "error";
  readonly applyResult: BulkEditResult | null;
  readonly onClose: () => void;
  readonly onOperationChange: (operation: BulkOperation) => void;
  readonly onValueChange: (value: string) => void;
  readonly onApply: () => void;
}

/**
 * Toplu düzenleme diyaloğu (E3 §e.5): işlem + değer seçilir, `dryRun`
 * önizlemesi ("Etki: N kullanıcı · M atlanacak") gösterilir, onay üzerine
 * atomik uygulanır. `admin` rolü değer seçeneklerinde hiç sunulmaz (§b).
 */
function BulkEditDialog({
  open,
  count,
  units,
  operation,
  value,
  preview,
  previewStatus,
  applyStatus,
  applyResult,
  onClose,
  onOperationChange,
  onValueChange,
  onApply,
}: BulkEditDialogProps): JSX.Element {
  return (
    <Modal onClose={onClose} open={open} title={`${t("admin.bulk.title")} — ${count} ${t("admin.users.selection.suffix")}`}>
      {applyResult !== null ? (
        <div className="eg-shell-userform__confirm">
          <p className="eg-shell-userform__label">{t("admin.bulk.result.title")}</p>
          <p>{applyResult.updated} {t("admin.bulk.result.updated")}</p>
          {applyResult.skipped.length > 0 && (
            <ul className="eg-shell-import__errorList">
              {applyResult.skipped.map((row) => (
                <li key={row.userId}>{row.userId} — {t(BULK_SKIP_REASON_KEYS[row.reason] ?? "admin.bulk.result.skip.no_change")}</li>
              ))}
            </ul>
          )}
          <div className="eg-shell-userform__actions">
            <button onClick={onClose} type="button">{t("admin.bulk.result.close")}</button>
          </div>
        </div>
      ) : (
        <div className="eg-shell-userform__form">
          <label className="eg-shell-userform__field">
            <span className="eg-shell-userform__label">{t("admin.bulk.operation.label")}</span>
            <select
              onChange={(event: ChangeLike) => onOperationChange(changeValue(event) as BulkOperation)}
              value={operation}
            >
              {BULK_OPERATIONS.map((candidate) => <option key={candidate} value={candidate}>{t(BULK_OPERATION_KEYS[candidate])}</option>)}
            </select>
          </label>
          <label className="eg-shell-userform__field">
            <span className="eg-shell-userform__label">{t("admin.bulk.value.label")}</span>
            {(operation === "assign_role" || operation === "revoke_role") && <p>{t("admin.bulk.value.roleForbidden")}</p>}
            {operation === "set_unit" && (
              <select onChange={(event: ChangeLike) => onValueChange(changeValue(event))} value={value}>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            )}
            {operation === "set_status" && (
              <select onChange={(event: ChangeLike) => onValueChange(changeValue(event))} value={value}>
                {BULK_STATUSES.map((status) => <option key={status} value={status}>{t(BULK_STATUS_KEYS[status])}</option>)}
              </select>
            )}
            {(operation === "grant_sim" || operation === "revoke_sim") && (
              <select onChange={(event: ChangeLike) => onValueChange(changeValue(event))} value={value}>
                {SIM_IDS.map((simId) => <option key={simId} value={simId}>{t(`sims.${simId}.name`)}</option>)}
              </select>
            )}
          </label>
          {previewStatus === "error" && <p className="eg-shell-userform__error" role="alert">{t("admin.bulk.error.generic")}</p>}
          {previewStatus === "idle" && preview !== null && (
            <p>
              {t("admin.bulk.effect.label")} {preview.updated + preview.skipped.length} {t("admin.bulk.effect")}
              {" "}
              {preview.skipped.length} {t("admin.bulk.effect.skip")}
            </p>
          )}
          <p className="eg-shell-userform__notice">{t("admin.bulk.notice")}</p>
          {applyStatus === "error" && <p className="eg-shell-userform__error" role="alert">{t("admin.bulk.error.generic")}</p>}
          <div className="eg-shell-userform__actions">
            <button onClick={onClose} type="button">{t("admin.bulk.action.cancel")}</button>
            <button disabled={applyStatus === "loading" || preview === null} onClick={onApply} type="button">
              {t("admin.bulk.action.apply")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export interface UsersListViewProps {
  readonly status: UsersLoadStatus;
  readonly query: UsersListQuery;
  readonly result: UsersListResult | null;
  readonly units: readonly AdminUnit[];
  readonly selected: ReadonlySet<string>;
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (patch: Partial<UsersListQuery>) => void;
  readonly onClearFilters: () => void;
  readonly onSortChange: (choice: SortChoice) => void;
  readonly onPageChange: (page: number) => void;
  readonly onToggleSelect: (id: string) => void;
  readonly onClearSelection: () => void;
  readonly onRetry: () => void;
  /** Toplu düzenleme diyaloğu (E3 §e.5, T73). */
  readonly bulkOpen: boolean;
  readonly bulkOperation: BulkOperation;
  readonly bulkValue: string;
  readonly bulkPreview: BulkEditResult | null;
  readonly bulkPreviewStatus: "idle" | "loading" | "error";
  readonly bulkApplyStatus: "idle" | "loading" | "error";
  readonly bulkApplyResult: BulkEditResult | null;
  readonly onOpenBulk: () => void;
  readonly onCloseBulk: () => void;
  readonly onBulkOperationChange: (operation: BulkOperation) => void;
  readonly onBulkValueChange: (value: string) => void;
  readonly onBulkApply: () => void;
}

/**
 * Kullanıcılar listesinin durumsuz (props'tan beslenen) görünümü. `UsersPage`
 * veri getirmeyi sarar; bu bileşen DOM'suz testlerde doğrudan render edilir
 * (SSR efekt çalıştırmaz, bu yüzden durum burada açıkça props'tan gelir).
 */
export function UsersListView({
  status,
  query,
  result,
  units,
  selected,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  onSortChange,
  onPageChange,
  onToggleSelect,
  onClearSelection,
  onRetry,
  bulkOpen,
  bulkOperation,
  bulkValue,
  bulkPreview,
  bulkPreviewStatus,
  bulkApplyStatus,
  bulkApplyResult,
  onOpenBulk,
  onCloseBulk,
  onBulkOperationChange,
  onBulkValueChange,
  onBulkApply,
}: UsersListViewProps): JSX.Element {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") onClearSelection();
  }
  const filtered = hasActiveFilters(query);
  const selectionText = selected.size > 0 ? `${selected.size} ${t("admin.users.selection.suffix")}` : "";

  return (
    <section className="eg-shell-page eg-shell-users">
      <div className="eg-shell-users__head">
        <h1 className="eg-shell-page__title">{t("admin.users.title")}</h1>
        <a className="eg-shell-users__add" href={adminUserCreateHref()}>
          {t("admin.users.action.add")}
        </a>
      </div>
      <UsersFilters
        onClearFilters={onClearFilters}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onSortChange={onSortChange}
        query={query}
        units={units}
      />
      <div className="eg-shell-users__body" onKeyDown={onKeyDown}>
        {status === "loading" && (
          <div aria-hidden="true" className="eg-shell-users__skeleton">
            <span className="eg-shell-users__skeleton-row" />
            <span className="eg-shell-users__skeleton-row" />
            <span className="eg-shell-users__skeleton-row" />
          </div>
        )}
        {status === "error" && (
          <div className="eg-shell-users__error" role="alert">
            <p className="eg-shell-users__error-title">{t("admin.users.error.title")}</p>
            <p className="eg-shell-users__error-body">{t("admin.users.error.body")}</p>
            <button className="eg-shell-users__retry" onClick={onRetry} type="button">
              {t("admin.users.error.retry")}
            </button>
          </div>
        )}
        {status === "ready" && result !== null && result.meta.total === 0 && !filtered && (
          <div className="eg-shell-users__empty">
            <p>{t("table.empty")}</p>
            <a href={adminUserCreateHref()}>{t("admin.users.action.add")}</a>
          </div>
        )}
        {status === "ready" && result !== null && result.meta.total === 0 && filtered && (
          <div className="eg-shell-users__empty">
            <p>{t("admin.users.filtered.empty")}</p>
            <button onClick={onClearFilters} type="button">
              {t("admin.users.filter.clear")}
            </button>
          </div>
        )}
        {status === "ready" && result !== null && result.meta.total > 0 && (
          <>
            <UsersTable onToggleSelect={onToggleSelect} selected={selected} units={units} users={result.data} />
            <UsersCards onToggleSelect={onToggleSelect} selected={selected} units={units} users={result.data} />
            <UsersPagination meta={result.meta} onPageChange={onPageChange} />
          </>
        )}
      </div>
      <p aria-live="polite" className="eg-visually-hidden">{selectionText}</p>
      {selected.size > 0 && (
        <div className="eg-shell-users__bulkbar">
          <span aria-hidden="true">{selectionText}</span>
          <button onClick={onOpenBulk} type="button">{t("admin.users.bulk.open")}</button>
          <button onClick={onClearSelection} type="button">{t("admin.users.selection.clear")}</button>
        </div>
      )}
      <BulkEditDialog
        applyResult={bulkApplyResult}
        applyStatus={bulkApplyStatus}
        count={selected.size}
        onApply={onBulkApply}
        onClose={onCloseBulk}
        onOperationChange={onBulkOperationChange}
        onValueChange={onBulkValueChange}
        open={bulkOpen}
        operation={bulkOperation}
        preview={bulkPreview}
        previewStatus={bulkPreviewStatus}
        units={units}
        value={bulkValue}
      />
    </section>
  );
}

/** Sentetik kaynağın gerçek çağrısı; `UsersPage` yaşam döngüsü boyunca tek örnek tutar. */
function defaultSource(): UsersDataSource {
  return createMockUsersSource(DEFAULT_MOCK_SEED);
}

export interface UsersPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
}

/**
 * Kullanıcılar listesi kabuk rotası (`#/admin/kullanicilar`, T69a). Veri
 * `UsersDataSource` üzerinden enjekte edilir; sayfa yalnız istek yaşam
 * döngüsünü (yükleniyor/hazır/hata) ve sorgu durumunu yönetir, çizim
 * `UsersListView`'dedir.
 */
export function UsersPage({ dataSource }: UsersPageProps): JSX.Element {
  const sourceRef = useRef<UsersDataSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = dataSource ?? defaultSource();

  const [query, setQuery] = useState<UsersListQuery>(DEFAULT_QUERY);
  const [status, setStatus] = useState<UsersLoadStatus>("loading");
  const [result, setResult] = useState<UsersListResult | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOperation, setBulkOperation] = useState<BulkOperation>("set_status");
  const [bulkValue, setBulkValue] = useState<string>(defaultBulkValue("set_status"));
  const [bulkPreview, setBulkPreview] = useState<BulkEditResult | null>(null);
  const [bulkPreviewStatus, setBulkPreviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [bulkApplyStatus, setBulkApplyStatus] = useState<"idle" | "loading" | "error">("idle");
  const [bulkApplyResult, setBulkApplyResult] = useState<BulkEditResult | null>(null);

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

  function updateQuery(patch: Partial<UsersListQuery>): void {
    setQuery((prev) => ({ ...prev, ...patch, page: clampPage(patch.page) }));
    setSelected(new Set());
  }

  useEffect(() => {
    if (!bulkOpen || selected.size === 0) return;
    let active = true;
    setBulkPreviewStatus("loading");
    sourceRef.current?.bulkPreview(buildBulkInput([...selected], bulkOperation, bulkValue)).then(
      (preview) => {
        if (!active) return;
        setBulkPreview(preview);
        setBulkPreviewStatus("idle");
      },
      () => {
        if (active) {
          setBulkPreview(null);
          setBulkPreviewStatus("error");
        }
      },
    );
    return () => {
      active = false;
    };
    // `selected` bir `Set`tir; boyut değişince (seçim değişince) yeniden hesaplanır.
  }, [bulkOpen, bulkOperation, bulkValue, selected.size]);

  function closeBulk(): void {
    setBulkOpen(false);
    setBulkApplyResult(null);
    setBulkApplyStatus("idle");
  }

  function applyBulk(): void {
    setBulkApplyStatus("loading");
    sourceRef.current?.bulkApply(buildBulkInput([...selected], bulkOperation, bulkValue)).then(
      (applyResult) => {
        setBulkApplyResult(applyResult);
        setBulkApplyStatus("idle");
        setSelected(new Set());
        setAttempt((value) => value + 1);
      },
      () => setBulkApplyStatus("error"),
    );
  }

  return (
    <UsersListView
      bulkApplyResult={bulkApplyResult}
      bulkApplyStatus={bulkApplyStatus}
      bulkOpen={bulkOpen}
      bulkOperation={bulkOperation}
      bulkPreview={bulkPreview}
      bulkPreviewStatus={bulkPreviewStatus}
      bulkValue={bulkValue}
      onBulkApply={applyBulk}
      onBulkOperationChange={(operation) => {
        setBulkOperation(operation);
        setBulkValue(defaultBulkValue(operation));
      }}
      onBulkValueChange={setBulkValue}
      onClearFilters={() => updateQuery({ authMethod: undefined, q: undefined, role: undefined, status: undefined, unitId: undefined })}
      onClearSelection={() => setSelected(new Set())}
      onCloseBulk={closeBulk}
      onFilterChange={(patch) => updateQuery(patch)}
      onOpenBulk={() => setBulkOpen(true)}
      onPageChange={(page) => setQuery((prev) => ({ ...prev, page: clampPage(page) }))}
      onRetry={() => setAttempt((value) => value + 1)}
      onSearchChange={(value) => updateQuery({ q: value.length === 0 ? undefined : value })}
      onSortChange={(choice) => {
        const { order, sort } = parseSortChoice(choice);
        updateQuery({ order, sort });
      }}
      onToggleSelect={(id) => setSelected((prev) => toggleSelected(prev, id))}
      query={query}
      result={result}
      selected={selected}
      status={status}
      units={ADMIN_UNITS}
    />
  );
}

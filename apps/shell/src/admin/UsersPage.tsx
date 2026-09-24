import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { Badge, type BadgeTone } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { adminUserCreateHref, adminUserDetailHref } from "../routes";
import {
  ADMIN_UNITS,
  createMockUsersSource,
  clampPage,
  DEFAULT_MOCK_SEED,
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  hasActiveFilters,
  toggleSelected,
  unitNameFor,
  USER_AUTH_METHODS,
  USER_ROLES,
  USER_STATUSES,
  type AdminUnit,
  type AdminUser,
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
          <button disabled type="button">{t("admin.users.bulk.activate")}</button>
          <button disabled type="button">{t("admin.users.bulk.suspend")}</button>
          <button onClick={onClearSelection} type="button">{t("admin.users.selection.clear")}</button>
        </div>
      )}
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

  return (
    <UsersListView
      onClearFilters={() => updateQuery({ authMethod: undefined, q: undefined, role: undefined, status: undefined, unitId: undefined })}
      onClearSelection={() => setSelected(new Set())}
      onFilterChange={(patch) => updateQuery(patch)}
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

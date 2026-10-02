import { useEffect, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Pagination,
  Select,
  TextInput,
  useToast,
  icons,
  type BadgeTone,
  type DataTableColumn,
  type DataTableSort,
} from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { useShellSource } from "../dataSources";
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
  ogretim_uyesi: "admin.users.role.ogretim_uyesi",
  uzmanlik_ogrencisi: "admin.users.role.uzmanlik_ogrencisi",
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

/** Sıralama alanı + yönü birleşik seçim değeri (tek seçim denetimi). */
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

/** Yalnız arama/rol/birim/durum/giriş filtrelerinden etkin olanları sayar (mobil "Filtreler" rozeti). */
function countActiveFilters(query: UsersListQuery): number {
  let count = 0;
  if ((query.q?.trim().length ?? 0) > 0) count += 1;
  if (query.role !== undefined) count += 1;
  if (query.unitId !== undefined) count += 1;
  if (query.status !== undefined) count += 1;
  if (query.authMethod !== undefined) count += 1;
  return count;
}

/** Seçim satırı erişilebilir adı: "{ad} — Seç"; kendi hesabında not eklenir (T150). */
function selectLabel(displayName: string, isSelf: boolean): string {
  const base = `${displayName} — ${t("admin.users.table.select")}`;
  return isSelf ? `${base} — ${t("admin.users.detail.selfNote")}` : base;
}

function UserStatusBadge({ status }: { readonly status: UserStatus }): JSX.Element {
  return <Badge tone={STATUS_TONE[status]}>{t(STATUS_KEYS[status])}</Badge>;
}

/** Kullanıcı ekle bağlantısı: gezinme gerektiği için `Button`ın (yalnız `<button>`) yerine
 *  onun görsel diliyle çizilen bir `<a>` kullanılır (T156). */
function AddUserLink({ variant = "primary", className }: { readonly variant?: "primary" | "secondary"; readonly className?: string }): JSX.Element {
  return (
    <a className={["eg-btn", `eg-btn--${variant}`, "eg-btn--md", className].filter(Boolean).join(" ")} href={adminUserCreateHref()}>
      <span className="eg-btn__icon" aria-hidden="true"><icons.Plus /></span>
      <span className="eg-btn__label">{t("admin.users.action.add")}</span>
    </a>
  );
}

/** Tablo seçim sütunu, DataTable'ın kendi `selection` API'sinin yerine geçer: T150 kuralı
 *  (oturumdaki adminin kendi satırı seçilemez + not) yalnız bu satırda uygulanır. */
function buildUserColumns(
  units: readonly AdminUnit[],
  selected: ReadonlySet<string>,
  onToggleSelect: (id: string) => void,
  currentUserId: string | null,
): readonly DataTableColumn<AdminUser>[] {
  return [
    {
      cell: (user) => {
        const isSelf = user.id === currentUserId;
        return (
          <Checkbox
            checked={selected.has(user.id)}
            disabled={isSelf}
            hideLabel
            label={selectLabel(user.displayName, isSelf)}
            onCheckedChange={() => onToggleSelect(user.id)}
          />
        );
      },
      header: t("admin.users.table.select"),
      key: "select",
      width: "3rem",
    },
    {
      cell: (user) => (
        <a className="eg-shell-users__name-link" href={adminUserDetailHref(user.id)}>
          {user.displayName}
        </a>
      ),
      header: t("admin.users.table.name"),
      key: "displayName",
      sortable: true,
    },
    { cell: (user) => user.username, header: t("admin.users.table.username"), key: "username" },
    { cell: (user) => t(ROLE_KEYS[user.role]), header: t("admin.users.table.role"), key: "role" },
    { cell: (user) => unitNameFor(user.unitId, units), header: t("admin.users.table.unit"), key: "unit" },
    { cell: (user) => <UserStatusBadge status={user.status} />, header: t("admin.users.table.status"), key: "status" },
  ];
}

interface FilterFieldsProps {
  readonly query: UsersListQuery;
  readonly units: readonly AdminUnit[];
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (patch: Partial<UsersListQuery>) => void;
  readonly onSortChange: (choice: SortChoice) => void;
}

/** Filtre alanları: masaüstünde yatay çubukta, 360/768'te "Filtreler" diyaloğu içinde aynı
 *  bileşen iki kez çizilir (kırılım yalnız CSS'te, T156). */
function UsersFilterFields({ query, units, onSearchChange, onFilterChange, onSortChange }: FilterFieldsProps): JSX.Element {
  return (
    <>
      <Field label={t("admin.users.filter.search")}>
        {(control) => (
          <TextInput {...control} onChange={(event: ChangeLike) => onSearchChange(changeValue(event))} type="search" value={query.q ?? ""} />
        )}
      </Field>
      <Field label={t("admin.users.filter.role")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onFilterChange({ role: value === "" ? undefined : (value as UserRole) })}
            options={[
              { label: t("admin.users.filter.role.all"), value: "" },
              ...USER_ROLES.map((role) => ({ label: t(ROLE_KEYS[role]), value: role })),
            ]}
            value={query.role ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.users.filter.unit")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onFilterChange({ unitId: value === "" ? undefined : value })}
            options={[
              { label: t("admin.users.filter.unit.all"), value: "" },
              ...units.map((unit) => ({ label: unit.name, value: unit.id })),
            ]}
            value={query.unitId ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.users.filter.status")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onFilterChange({ status: value === "" ? undefined : (value as UserStatus) })}
            options={[
              { label: t("admin.users.filter.status.all"), value: "" },
              ...USER_STATUSES.map((status) => ({ label: t(STATUS_KEYS[status]), value: status })),
            ]}
            value={query.status ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.users.filter.authMethod")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onFilterChange({ authMethod: value === "" ? undefined : (value as UserAuthMethod) })}
            options={[
              { label: t("admin.users.filter.authMethod.all"), value: "" },
              ...USER_AUTH_METHODS.map((method) => ({ label: t(AUTH_KEYS[method]), value: method })),
            ]}
            value={query.authMethod ?? ""}
          />
        )}
      </Field>
      <Field label={t("admin.users.sort.label")}>
        {(control) => (
          <Select
            {...control}
            onValueChange={(value) => onSortChange(value as SortChoice)}
            options={SORT_CHOICES.map((choice) => ({ label: t(choice.labelKey), value: choice.value }))}
            value={sortChoiceFor(query.sort, query.order)}
          />
        )}
      </Field>
    </>
  );
}

/** Test'lerde `Dialog` (Radix Portal) DOM'suz ortamda boş çizildiği için doğrudan
 *  içe aktarılıp çağrılabilsin diye dışa açılır (T163). */
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
 * (Bu diyalog T156 kapsamı dışıdır; `Dialog` ile çizilir, T163.)
 */
export function BulkEditDialog({
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
  const title = `${t("admin.bulk.title")} — ${count} ${t("admin.users.selection.suffix")}`;
  return (
    <Dialog
      footer={
        applyResult !== null ? (
          <Button onClick={onClose} variant="secondary">{t("admin.bulk.result.close")}</Button>
        ) : (
          <>
            <Button onClick={onClose} variant="secondary">{t("admin.bulk.action.cancel")}</Button>
            <Button disabled={applyStatus === "loading" || preview === null} loading={applyStatus === "loading"} onClick={onApply}>
              {t("admin.bulk.action.apply")}
            </Button>
          </>
        )
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open={open}
      title={title}
    >
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
        </div>
      ) : (
        <div className="eg-shell-userform__form">
          <Field label={t("admin.bulk.operation.label")}>
            {(control) => (
              <Select
                {...control}
                onValueChange={(next) => onOperationChange(next as BulkOperation)}
                options={BULK_OPERATIONS.map((candidate) => ({ label: t(BULK_OPERATION_KEYS[candidate]), value: candidate }))}
                value={operation}
              />
            )}
          </Field>
          <Field label={t("admin.bulk.value.label")}>
            {(control) => {
              if (operation === "assign_role" || operation === "revoke_role") {
                return <p>{t("admin.bulk.value.roleForbidden")}</p>;
              }
              if (operation === "set_unit") {
                return (
                  <Select
                    {...control}
                    onValueChange={onValueChange}
                    options={units.map((unit) => ({ label: unit.name, value: unit.id }))}
                    value={value}
                  />
                );
              }
              if (operation === "set_status") {
                return (
                  <Select
                    {...control}
                    onValueChange={onValueChange}
                    options={BULK_STATUSES.map((status) => ({ label: t(BULK_STATUS_KEYS[status]), value: status }))}
                    value={value}
                  />
                );
              }
              return (
                <Select
                  {...control}
                  onValueChange={onValueChange}
                  options={SIM_IDS.map((simId) => ({ label: t(`sims.${simId}.name`), value: simId }))}
                  value={value}
                />
              );
            }}
          </Field>
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
        </div>
      )}
    </Dialog>
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
  /** Geçerli oturumun kimliği; kendi hesabını toplu seçimde devre dışı bırakmak için (T150, `App.tsx` `session.actorId` geçirir). */
  readonly currentUserId?: string | null;
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
  /** <768 px "Filtreler" diyaloğunun açık/kapalı durumu; salt görsel olduğu için
   *  `UsersPage` üzerinde tutulur (view saf props'tan beslenir, T156). */
  readonly filtersOpen: boolean;
  readonly onFiltersOpenChange: (open: boolean) => void;
}

/**
 * Kullanıcılar listesinin durumsuz (props'tan beslenen) görünümü. `UsersPage`
 * veri getirmeyi sarar; bu bileşen DOM'suz testlerde doğrudan render edilir
 * (SSR efekt çalıştırmaz, bu yüzden durum burada açıkça props'tan gelir).
 * Mobil filtre diyaloğunun açık/kapalı durumu salt görsel olduğundan yerel
 * `useState` ile tutulur (T156).
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
  currentUserId = null,
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
  filtersOpen,
  onFiltersOpenChange,
}: UsersListViewProps): JSX.Element {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") onClearSelection();
  }
  const filtered = hasActiveFilters(query);
  const activeCount = countActiveFilters(query);
  const selectionText = selected.size > 0 ? `${selected.size} ${t("admin.users.selection.suffix")}` : "";
  const columns = buildUserColumns(units, selected, onToggleSelect, currentUserId);
  const sort: DataTableSort | undefined =
    query.sort === "displayName" ? { direction: query.order ?? DEFAULT_ORDER, key: "displayName" } : undefined;

  function onTableSortChange(next: DataTableSort | undefined): void {
    onSortChange(next === undefined ? sortChoiceFor(DEFAULT_SORT, DEFAULT_ORDER) : sortChoiceFor("displayName", next.direction));
  }

  const emptyState: ReactNode = filtered ? (
    <EmptyState
      action={<Button onClick={onClearFilters} variant="secondary">{t("admin.users.filter.clear")}</Button>}
      icon={<icons.Users />}
      title={t("admin.users.filtered.empty")}
    />
  ) : (
    <EmptyState action={<AddUserLink variant="secondary" />} icon={<icons.Users />} title={t("table.empty")} />
  );

  return (
    <section className="eg-shell-page eg-shell-users">
      <div className="eg-shell-users__head">
        <h1 className="eg-shell-page__title">{t("admin.users.title")}</h1>
        <div className="eg-shell-adminlist__actions">
          <Button onClick={onClearFilters} variant="ghost">{t("admin.users.filter.clear")}</Button>
          <AddUserLink />
        </div>
      </div>
      <div className="eg-shell-adminlist__filterbar">
        <UsersFilterFields onFilterChange={onFilterChange} onSearchChange={onSearchChange} onSortChange={onSortChange} query={query} units={units} />
      </div>
      <div className="eg-shell-adminlist__filtertrigger">
        <Button icon={<icons.Filter />} onClick={() => onFiltersOpenChange(true)} variant="secondary">
          {t("admin.users.filter.open")}
          {activeCount > 0 ? <Badge tone="info">{String(activeCount)}</Badge> : null}
        </Button>
      </div>
      <Dialog
        footer={<Button onClick={onClearFilters} variant="ghost">{t("admin.users.filter.clear")}</Button>}
        onOpenChange={onFiltersOpenChange}
        open={filtersOpen}
        title={t("admin.users.filter.open")}
      >
        <div className="eg-shell-adminlist__filterfields">
          <UsersFilterFields onFilterChange={onFilterChange} onSearchChange={onSearchChange} onSortChange={onSortChange} query={query} units={units} />
        </div>
      </Dialog>
      <div className="eg-shell-users__body" onKeyDown={onKeyDown}>
        {status === "error" ? (
          <div className="eg-shell-users__error" role="alert">
            <p className="eg-shell-users__error-title">{t("admin.users.error.title")}</p>
            <p className="eg-shell-users__error-body">{t("admin.users.error.body")}</p>
            <Button onClick={onRetry} variant="secondary">{t("admin.users.error.retry")}</Button>
          </div>
        ) : (
          <>
            <DataTable<AdminUser>
              caption={t("admin.users.table.caption")}
              columns={columns}
              empty={emptyState}
              loading={status === "loading"}
              onSortChange={onTableSortChange}
              rowKey={(user) => user.id}
              rows={status === "ready" && result !== null ? result.data : []}
              {...(sort !== undefined ? { sort } : {})}
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
      </div>
      <p aria-live="polite" className="eg-visually-hidden">{selectionText}</p>
      {selected.size > 0 && (
        <div className="eg-shell-users__bulkbar">
          <span aria-hidden="true">{selectionText}</span>
          <Button onClick={onOpenBulk} variant="primary">{t("admin.users.bulk.open")}</Button>
          <Button onClick={onClearSelection} variant="ghost">{t("admin.users.selection.clear")}</Button>
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

interface UsersPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
  /** Geçerli oturumun kimliği; kendi hesabını toplu seçimde devre dışı bırakmak için (T150, `App.tsx` `session.actorId` geçirir). */
  readonly currentUserId?: string | null;
}

/**
 * Kullanıcılar listesi kabuk rotası (`#/admin/kullanicilar`, T69a). Veri
 * `UsersDataSource` üzerinden enjekte edilir; sayfa yalnız istek yaşam
 * döngüsünü (yükleniyor/hazır/hata) ve sorgu durumunu yönetir, çizim
 * `UsersListView`'dedir.
 */
export function UsersPage({ dataSource, currentUserId = null }: UsersPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.users, () => createMockUsersSource(DEFAULT_MOCK_SEED));
  const toast = useToast();

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  function updateQuery(patch: Partial<UsersListQuery>): void {
    setQuery((prev) => ({ ...prev, ...patch, page: clampPage(patch.page) }));
    setSelected(new Set());
  }

  useEffect(() => {
    if (!bulkOpen || selected.size === 0) return;
    let active = true;
    setBulkPreviewStatus("loading");
    source.bulkPreview(buildBulkInput([...selected], bulkOperation, bulkValue)).then(
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
    source.bulkApply(buildBulkInput([...selected], bulkOperation, bulkValue)).then(
      (applyResult) => {
        setBulkApplyResult(applyResult);
        setBulkApplyStatus("idle");
        setSelected(new Set());
        setAttempt((value) => value + 1);
        toast({ title: t("admin.bulk.toast.success"), tone: "success" });
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
      currentUserId={currentUserId}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
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

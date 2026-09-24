import { useEffect, useRef, useState, type JSX } from "react";
import { Badge, Modal, Tabs, type BadgeTone, type TabItem } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { adminUsersHref } from "../routes";
import { formatTrDateTime } from "./trFormat";
import {
  ADMIN_UNITS,
  createMockUsersSource,
  DEFAULT_MOCK_SEED,
  unitNameFor,
  type AdminUserDetail,
  type UserAuthMethod,
  type UserRole,
  type UserStatus,
  type UsersDataSource,
} from "./usersDataSource";

/** Kök tsconfig DOM lib'i taşımadığı için değişim olayı en dar arayüzle okunur (UsersPage.tsx deseni). */
interface ChangeLike { target: unknown }
function changeValue(event: ChangeLike): string {
  return (event.target as unknown as { value: string }).value;
}

export type UserDetailLoadStatus = "loading" | "ready" | "notFound" | "error";
export type UserDetailAction = "suspend" | "activate" | "delete";

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
const CONFIRM_TITLE_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.confirm.activate.title",
  delete: "admin.users.detail.confirm.delete.title",
  suspend: "admin.users.detail.confirm.suspend.title",
};
const CONFIRM_BODY_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.confirm.activate.body",
  delete: "admin.users.detail.confirm.delete.body",
  suspend: "admin.users.detail.confirm.suspend.body",
};
const CONFIRM_APPLY_ACTION_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.action.activate",
  delete: "admin.users.detail.action.delete",
  suspend: "admin.users.detail.action.suspend",
};

function GeneralPanel({ detail }: { readonly detail: AdminUserDetail }): JSX.Element {
  return (
    <dl className="eg-shell-userdetail__summary">
      <dt>{t("admin.users.detail.general.username")}</dt>
      <dd>{detail.username}</dd>
      <dt>{t("admin.users.detail.general.email")}</dt>
      <dd>{detail.email ?? t("admin.users.detail.general.notSet")}</dd>
      <dt>{t("admin.users.detail.general.displayName")}</dt>
      <dd>{detail.displayName}</dd>
      <dt>{t("admin.users.detail.general.unit")}</dt>
      <dd>{unitNameFor(detail.unitId, ADMIN_UNITS)}</dd>
      <dt>{t("admin.users.detail.general.authMethod")}</dt>
      <dd>{t(AUTH_KEYS[detail.authMethod])}</dd>
      <dt>{t("admin.users.detail.general.status")}</dt>
      <dd><Badge tone={STATUS_TONE[detail.status]}>{t(STATUS_KEYS[detail.status])}</Badge></dd>
      <dt>{t("admin.users.detail.general.lastLogin")}</dt>
      <dd>{detail.lastLoginAt === null ? t("admin.users.detail.general.lastLogin.never") : formatTrDateTime(detail.lastLoginAt)}</dd>
    </dl>
  );
}

function RolesPanel({ detail }: { readonly detail: AdminUserDetail }): JSX.Element {
  return (
    <div className="eg-shell-userdetail__roles">
      <p className="eg-shell-userdetail__rolesTitle">{t("admin.users.detail.roles.title")}</p>
      <ul className="eg-shell-userdetail__badgeList">
        {detail.roles.map((role) => <li key={role}><Badge>{t(ROLE_KEYS[role])}</Badge></li>)}
      </ul>
      <p className="eg-shell-userdetail__rolesTitle">{t("admin.users.detail.roles.access")}</p>
      {detail.simAccess.length === 0 ? (
        <p>{t("admin.users.detail.roles.access.empty")}</p>
      ) : (
        <ul className="eg-shell-userdetail__badgeList">
          {detail.simAccess.map((simId) => <li key={simId}><Badge tone="info">{t(`sims.${simId}.name`)}</Badge></li>)}
        </ul>
      )}
    </div>
  );
}

function GamificationPanel({ detail }: { readonly detail: AdminUserDetail }): JSX.Element {
  if (detail.gamification.length === 0) return <p>{t("admin.users.detail.gamification.empty")}</p>;
  return (
    <ul className="eg-shell-userdetail__gamiList">
      {detail.gamification.map((summary) => (
        <li className="eg-shell-userdetail__gamiCard" key={summary.simId}>
          <p className="eg-shell-userdetail__gamiSim">{t(`sims.${summary.simId}.name`)}</p>
          <p>{t("admin.users.detail.gamification.xp")} {summary.xp} · {t("admin.users.detail.gamification.level")} {summary.level} · {t("admin.users.detail.gamification.streak")} {summary.streakCurrent}</p>
        </li>
      ))}
    </ul>
  );
}

function HistoryPanel({ detail }: { readonly detail: AdminUserDetail }): JSX.Element {
  if (detail.history.length === 0) return <p>{t("admin.users.detail.history.empty")}</p>;
  return (
    <ul className="eg-shell-userdetail__history">
      {detail.history.map((entry) => (
        <li key={entry.id}>
          <span>{formatTrDateTime(entry.occurredAt)}</span>
          <span>{t(`admin.users.detail.history.action.${entry.action}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface UserDetailViewProps {
  readonly status: UserDetailLoadStatus;
  readonly detail: AdminUserDetail | null;
  readonly pendingAction: UserDetailAction | null;
  readonly deleteConfirmText: string;
  readonly actionError: boolean;
  readonly onRequestAction: (action: UserDetailAction) => void;
  readonly onCancelAction: () => void;
  readonly onConfirmAction: () => void;
  readonly onDeleteConfirmTextChange: (value: string) => void;
  readonly onRetry: () => void;
}

/**
 * Kullanıcı ayrıntı/düzenle ekranının durumsuz görünümü (E3 §e.3). Sekmeler
 * `@egemed/ui` `Tabs` ile; askıya alma/etkinleştirme/silme `Modal` onayı ister
 * (silme kullanıcı adını yazarak doğrulanır — "tehlikeli" akış).
 */
export function UserDetailView({
  status,
  detail,
  pendingAction,
  deleteConfirmText,
  actionError,
  onRequestAction,
  onCancelAction,
  onConfirmAction,
  onDeleteConfirmTextChange,
  onRetry,
}: UserDetailViewProps): JSX.Element {
  return (
    <section className="eg-shell-page eg-shell-userdetail">
      <a className="eg-shell-userdetail__back" href={adminUsersHref()}>← {t("admin.users.detail.back")}</a>
      {status === "loading" && (
        <div aria-hidden="true" className="eg-shell-userdetail__skeleton">
          <span className="eg-shell-userdetail__skeleton-row" />
          <span className="eg-shell-userdetail__skeleton-row" />
        </div>
      )}
      {status === "notFound" && (
        <div className="eg-shell-userdetail__empty">
          <p className="eg-shell-userdetail__errorTitle">{t("admin.users.detail.notFound.title")}</p>
          <p>{t("admin.users.detail.notFound.body")}</p>
        </div>
      )}
      {status === "error" && (
        <div className="eg-shell-userdetail__error" role="alert">
          <p className="eg-shell-userdetail__errorTitle">{t("admin.users.detail.error.title")}</p>
          <p>{t("admin.users.detail.error.body")}</p>
          <button onClick={onRetry} type="button">{t("admin.users.error.retry")}</button>
        </div>
      )}
      {status === "ready" && detail !== null && (
        <>
          <div className="eg-shell-userdetail__head">
            <h1 className="eg-shell-page__title">{detail.displayName}</h1>
            {detail.status !== "deleted" && (
              <div className="eg-shell-userdetail__actions">
                {detail.status === "suspended" ? (
                  <button onClick={() => onRequestAction("activate")} type="button">
                    {t("admin.users.detail.action.activate")}
                  </button>
                ) : (
                  <button onClick={() => onRequestAction("suspend")} type="button">
                    {t("admin.users.detail.action.suspend")}
                  </button>
                )}
                <button className="eg-shell-userdetail__delete" onClick={() => onRequestAction("delete")} type="button">
                  {t("admin.users.detail.action.delete")}
                </button>
              </div>
            )}
          </div>
          <Tabs
            items={[
              { id: "general", label: t("admin.users.detail.tab.general"), panel: <GeneralPanel detail={detail} /> },
              { id: "roles", label: t("admin.users.detail.tab.roles"), panel: <RolesPanel detail={detail} /> },
              { id: "gamification", label: t("admin.users.detail.tab.gamification"), panel: <GamificationPanel detail={detail} /> },
              { id: "history", label: t("admin.users.detail.tab.history"), panel: <HistoryPanel detail={detail} /> },
            ] satisfies readonly TabItem[]}
            label={t("admin.users.detail.tabs.label")}
          />
          <Modal onClose={onCancelAction} open={pendingAction !== null} title={pendingAction === null ? "" : t(CONFIRM_TITLE_KEYS[pendingAction])}>
            {pendingAction !== null && (
              <div className="eg-shell-userdetail__confirm">
                <p>{t(CONFIRM_BODY_KEYS[pendingAction])}</p>
                {pendingAction === "delete" && (
                  <label className="eg-shell-userdetail__confirmField">
                    <span>{t("admin.users.detail.confirm.delete.inputLabel")}</span>
                    <input
                      onChange={(event: ChangeLike) => onDeleteConfirmTextChange(changeValue(event))}
                      type="text"
                      value={deleteConfirmText}
                    />
                    {deleteConfirmText.length > 0 && deleteConfirmText !== detail.username && (
                      <p role="alert">{t("admin.users.detail.confirm.delete.mismatch")}</p>
                    )}
                  </label>
                )}
                {actionError && <p role="alert">{t("admin.users.detail.actionError")}</p>}
                <div className="eg-shell-userdetail__actions">
                  <button onClick={onCancelAction} type="button">{t("admin.users.detail.action.cancel")}</button>
                  <button
                    disabled={pendingAction === "delete" && deleteConfirmText !== detail.username}
                    onClick={onConfirmAction}
                    type="button"
                  >
                    {t(CONFIRM_APPLY_ACTION_KEYS[pendingAction])}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </section>
  );
}

function defaultSource(): UsersDataSource {
  return createMockUsersSource(DEFAULT_MOCK_SEED);
}

export interface UserDetailPageProps {
  readonly userId: string;
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
}

const ACTION_TO_STATUS: Record<UserDetailAction, UserStatus> = {
  activate: "active",
  delete: "deleted",
  suspend: "suspended",
};

/**
 * Kullanıcı ayrıntı/düzenle kabuk rotası (`#/admin/kullanicilar/:id`, T70). Veri
 * `UsersDataSource.get`/`update` üzerinden enjekte edilir; çizim `UserDetailView`'dedir.
 */
export function UserDetailPage({ userId, dataSource }: UserDetailPageProps): JSX.Element {
  const sourceRef = useRef<UsersDataSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = dataSource ?? defaultSource();

  const [status, setStatus] = useState<UserDetailLoadStatus>("loading");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [pendingAction, setPendingAction] = useState<UserDetailAction | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionError, setActionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    sourceRef.current?.get(userId).then(
      (found) => {
        if (!active) return;
        if (found === null) {
          setStatus("notFound");
          return;
        }
        setDetail(found);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  function cancelAction(): void {
    setPendingAction(null);
    setDeleteConfirmText("");
    setActionError(false);
  }

  function confirmAction(): void {
    if (pendingAction === null || detail === null) return;
    setActionError(false);
    sourceRef.current?.update(detail.id, { status: ACTION_TO_STATUS[pendingAction] }).then(
      (updated) => {
        setDetail(updated);
        setPendingAction(null);
        setDeleteConfirmText("");
      },
      () => setActionError(true),
    );
  }

  return (
    <UserDetailView
      actionError={actionError}
      deleteConfirmText={deleteConfirmText}
      detail={detail}
      onCancelAction={cancelAction}
      onConfirmAction={confirmAction}
      onDeleteConfirmTextChange={setDeleteConfirmText}
      onRequestAction={setPendingAction}
      onRetry={() => setAttempt((value) => value + 1)}
      pendingAction={pendingAction}
      status={status}
    />
  );
}

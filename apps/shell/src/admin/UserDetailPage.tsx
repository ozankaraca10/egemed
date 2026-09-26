import { useEffect, useState, type JSX } from "react";
import { Badge, Button, Dialog, Field, Tabs, TextInput, useToast, type BadgeTone, type TabItem } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { useShellSource } from "../dataSources";
import { adminUsersHref } from "../routes";
import { formatTrDateTime } from "./trFormat";
import {
  ADMIN_UNITS,
  createMockUsersSource,
  DEFAULT_MOCK_SEED,
  swapBaseRole,
  unitNameFor,
  type AdminUserDetail,
  type UserAuthMethod,
  type UserRole,
  type UserStatus,
  type UsersDataSource,
} from "./usersDataSource";

/** Rolü ekler/çıkarır; kümeyi değiştirmeden yeni bir dizi döndürür (E3 §b: aynı kullanıcıda birden çok rol olabilir). */
function toggleRole(roles: readonly UserRole[], role: UserRole): UserRole[] {
  return roles.includes(role) ? roles.filter((candidate) => candidate !== role) : [...roles, role];
}

export type UserDetailLoadStatus = "loading" | "ready" | "notFound" | "error";
/**
 * `grantAdmin`/`revokeAdmin` (T73, E3 §b/§e.6): admin rolünü elle ver/kaldır;
 * kendi rolünü kaldırma engellenir. `grantFaculty`/`revokeFaculty` (T184):
 * öğretim üyesi ↔ kullanıcı (temel rol) geçişi; aynı `PUT .../roles` ucuyla,
 * tam rol kümesi gönderilerek yapılır (`swapBaseRole`).
 */
export type UserDetailAction = "suspend" | "activate" | "delete" | "grantAdmin" | "revokeAdmin" | "grantFaculty" | "revokeFaculty";

const ROLE_KEYS: Record<UserRole, TrKey> = {
  admin: "admin.users.role.admin",
  kullanici: "admin.users.role.kullanici",
  ogretim_uyesi: "admin.users.role.ogretim_uyesi",
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
  grantAdmin: "admin.users.detail.confirm.grantAdmin.title",
  grantFaculty: "admin.users.detail.confirm.grantFaculty.title",
  revokeAdmin: "admin.users.detail.confirm.revokeAdmin.title",
  revokeFaculty: "admin.users.detail.confirm.revokeFaculty.title",
  suspend: "admin.users.detail.confirm.suspend.title",
};
const CONFIRM_BODY_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.confirm.activate.body",
  delete: "admin.users.detail.confirm.delete.body",
  grantAdmin: "admin.users.detail.confirm.grantAdmin.body",
  grantFaculty: "admin.users.detail.confirm.grantFaculty.body",
  revokeAdmin: "admin.users.detail.confirm.revokeAdmin.body",
  revokeFaculty: "admin.users.detail.confirm.revokeFaculty.body",
  suspend: "admin.users.detail.confirm.suspend.body",
};
const CONFIRM_APPLY_ACTION_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.action.activate",
  delete: "admin.users.detail.action.delete",
  grantAdmin: "admin.users.detail.action.grantAdmin",
  grantFaculty: "admin.users.detail.action.grantFaculty",
  revokeAdmin: "admin.users.detail.action.revokeAdmin",
  revokeFaculty: "admin.users.detail.action.revokeFaculty",
  suspend: "admin.users.detail.action.suspend",
};
const CONFIRM_TOAST_KEYS: Record<UserDetailAction, TrKey> = {
  activate: "admin.users.detail.toast.activate",
  delete: "admin.users.detail.toast.delete",
  grantAdmin: "admin.users.detail.toast.grantAdmin",
  grantFaculty: "admin.users.detail.toast.grantFaculty",
  revokeAdmin: "admin.users.detail.toast.revokeAdmin",
  revokeFaculty: "admin.users.detail.toast.revokeFaculty",
  suspend: "admin.users.detail.toast.suspend",
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

/**
 * Roller ve erişim sekmesi (E3 §b/§e.6): admin rolü burada elle
 * ver/kaldırılır (T73, `PUT /admin/users/:id/roles`); kendi admin rolünü
 * kaldırma girişimi engellenir (`isSelfAdmin`).
 */
function RolesPanel({
  detail,
  isSelfAdmin,
  onRequestAction,
}: {
  readonly detail: AdminUserDetail;
  readonly isSelfAdmin: boolean;
  readonly onRequestAction: (action: UserDetailAction) => void;
}): JSX.Element {
  const isAdmin = detail.roles.includes("admin");
  const isFaculty = detail.roles.includes("ogretim_uyesi");
  return (
    <div className="eg-shell-userdetail__roles">
      <p className="eg-shell-userdetail__rolesTitle">{t("admin.users.detail.roles.title")}</p>
      <ul className="eg-shell-userdetail__badgeList">
        {detail.roles.map((role) => <li key={role}><Badge>{t(ROLE_KEYS[role])}</Badge></li>)}
      </ul>
      <Button disabled={isAdmin && isSelfAdmin} onClick={() => onRequestAction(isAdmin ? "revokeAdmin" : "grantAdmin")} variant="secondary">
        {t(isAdmin ? "admin.users.detail.roles.revoke" : "admin.users.detail.roles.grant")}
      </Button>
      {isAdmin && isSelfAdmin && <p role="alert">{t("admin.users.detail.roles.selfGuard")}</p>}
      {/* T184: temel rol (kullanıcı ↔ öğretim üyesi) geçişi; admin biti bu düğmeden etkilenmez. */}
      <Button onClick={() => onRequestAction(isFaculty ? "revokeFaculty" : "grantFaculty")} variant="secondary">
        {t(isFaculty ? "admin.users.detail.roles.revokeFaculty" : "admin.users.detail.roles.grantFaculty")}
      </Button>
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
  /** Geçerli oturumun kimliği; kendi admin rolünü kaldırma düğmesini devre dışı bırakmak için (T73). */
  readonly currentUserId: string | null;
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
 * `@egemed/ui` `Tabs` ile; askıya alma/etkinleştirme/silme `Dialog` onayı ister
 * (silme kullanıcı adını yazarak doğrulanır — "tehlikeli" akış, danger düğme).
 */
export function UserDetailView({
  status,
  detail,
  currentUserId,
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
          <Button onClick={onRetry} variant="secondary">{t("admin.users.error.retry")}</Button>
        </div>
      )}
      {status === "ready" && detail !== null && (
        <>
          <div className="eg-shell-userdetail__head">
            <h1 className="eg-shell-page__title">{detail.displayName}</h1>
            {detail.status !== "deleted" && (
              <div className="eg-shell-userdetail__actions">
                {detail.status === "suspended" && (
                  <Button onClick={() => onRequestAction("activate")} variant="secondary">
                    {t("admin.users.detail.action.activate")}
                  </Button>
                )}
                {detail.status !== "suspended" && detail.id !== currentUserId && (
                  <Button onClick={() => onRequestAction("suspend")} variant="secondary">
                    {t("admin.users.detail.action.suspend")}
                  </Button>
                )}
                {detail.id !== currentUserId && (
                  <Button className="eg-shell-userdetail__delete" onClick={() => onRequestAction("delete")} variant="danger">
                    {t("admin.users.detail.action.delete")}
                  </Button>
                )}
              </div>
            )}
            {detail.status !== "deleted" && detail.id === currentUserId && (
              <p className="eg-shell-userform__note">{t("admin.users.detail.selfNote")}</p>
            )}
          </div>
          <Tabs
            items={[
              { id: "general", label: t("admin.users.detail.tab.general"), panel: <GeneralPanel detail={detail} /> },
              {
                id: "roles",
                label: t("admin.users.detail.tab.roles"),
                panel: (
                  <RolesPanel detail={detail} isSelfAdmin={detail.id === currentUserId} onRequestAction={onRequestAction} />
                ),
              },
              { id: "gamification", label: t("admin.users.detail.tab.gamification"), panel: <GamificationPanel detail={detail} /> },
              { id: "history", label: t("admin.users.detail.tab.history"), panel: <HistoryPanel detail={detail} /> },
            ] satisfies readonly TabItem[]}
            label={t("admin.users.detail.tabs.label")}
          />
          <Dialog
            footer={
              pendingAction === null ? null : (
                <>
                  <Button onClick={onCancelAction} variant="secondary">{t("admin.users.detail.action.cancel")}</Button>
                  <Button
                    disabled={pendingAction === "delete" && deleteConfirmText !== detail.username}
                    onClick={onConfirmAction}
                    variant={pendingAction === "delete" ? "danger" : "primary"}
                  >
                    {t(CONFIRM_APPLY_ACTION_KEYS[pendingAction])}
                  </Button>
                </>
              )
            }
            onOpenChange={(open) => {
              if (!open) onCancelAction();
            }}
            open={pendingAction !== null}
            title={pendingAction === null ? "" : t(CONFIRM_TITLE_KEYS[pendingAction])}
          >
            {pendingAction !== null && (
              <div className="eg-shell-userdetail__confirm">
                <p>{t(CONFIRM_BODY_KEYS[pendingAction])}</p>
                {pendingAction === "delete" && (
                  <Field label={t("admin.users.detail.confirm.delete.inputLabel")}>
                    {(control) => (
                      <TextInput
                        {...control}
                        onChange={(event) => onDeleteConfirmTextChange(event.target.value)}
                        type="text"
                        value={deleteConfirmText}
                      />
                    )}
                  </Field>
                )}
                {pendingAction === "delete" && deleteConfirmText.length > 0 && deleteConfirmText !== detail.username && (
                  <p role="alert">{t("admin.users.detail.confirm.delete.mismatch")}</p>
                )}
                {actionError && <p role="alert">{t("admin.users.detail.actionError")}</p>}
              </div>
            )}
          </Dialog>
        </>
      )}
    </section>
  );
}

export interface UserDetailPageProps {
  readonly userId: string;
  /** Geçerli oturumun kimliği; kendi admin rolünü kaldırma engeli için (T73, `App.tsx` `session.actorId` geçirir). */
  readonly currentUserId?: string | null;
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
}

/** `grantAdmin`/`revokeAdmin` `ACTION_TO_STATUS`te yoktur; `confirmAction` bunları `setRoles` ile ayrı işler. */
const ACTION_TO_STATUS: Partial<Record<UserDetailAction, UserStatus>> = {
  activate: "active",
  delete: "deleted",
  suspend: "suspended",
};

/**
 * Kullanıcı ayrıntı/düzenle kabuk rotası (`#/admin/kullanicilar/:id`, T70). Veri
 * `UsersDataSource.get`/`update` üzerinden enjekte edilir; çizim `UserDetailView`'dedir.
 */
export function UserDetailPage({ userId, currentUserId = null, dataSource }: UserDetailPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.users, () => createMockUsersSource(DEFAULT_MOCK_SEED));
  const toast = useToast();

  const [status, setStatus] = useState<UserDetailLoadStatus>("loading");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [pendingAction, setPendingAction] = useState<UserDetailAction | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionError, setActionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    source.get(userId).then(
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
    const action = pendingAction;
    setActionError(false);
    function onSuccess(updated: AdminUserDetail): void {
      setDetail(updated);
      setPendingAction(null);
      setDeleteConfirmText("");
      toast({ title: t(CONFIRM_TOAST_KEYS[action]), tone: "success" });
    }
    function onError(): void {
      setActionError(true);
    }
    if (pendingAction === "grantAdmin" || pendingAction === "revokeAdmin") {
      source.setRoles(detail.id, toggleRole(detail.roles, "admin"), currentUserId).then(onSuccess, onError);
      return;
    }
    if (pendingAction === "grantFaculty" || pendingAction === "revokeFaculty") {
      const target = pendingAction === "grantFaculty" ? "ogretim_uyesi" : "kullanici";
      source.setRoles(detail.id, swapBaseRole(detail.roles, target), currentUserId).then(onSuccess, onError);
      return;
    }
    const status = ACTION_TO_STATUS[pendingAction];
    if (status === undefined) return;
    source.update(detail.id, { status }).then(onSuccess, onError);
  }

  return (
    <UserDetailView
      actionError={actionError}
      currentUserId={currentUserId}
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

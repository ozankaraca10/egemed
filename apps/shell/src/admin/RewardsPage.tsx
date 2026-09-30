import { useEffect, useState, type JSX } from "react";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Select,
  Switch,
  TextArea,
  TextInput,
  useToast,
  icons,
  type DataTableColumn,
} from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { monthKeyTr } from "@egemed/gamification-core";
import { useShellDataSources, useShellSource } from "../dataSources";
import { shellNow } from "../now";
import {
  REWARD_COHORTS,
  REWARD_SIM_IDS,
  createMockRewardsSource,
  hasRewardFormErrors,
  initialRewardFormValues,
  isMonthClosed,
  monthLabelTr,
  nextMonthKey,
  rewardFormValuesFrom,
  rewardStatusFor,
  toRewardUpsertRequest,
  toggleCohort,
  validateRewardForm,
  type AdminReward,
  type RewardFieldErrorCode,
  type RewardFieldErrors,
  type RewardFormValues,
  type RewardsDataSource,
  type RewardStatus,
  type SimId,
} from "./rewardsDataSource";

export type RewardsLoadStatus = "loading" | "ready" | "error";

/** Kök tsconfig DOM lib'i taşımadığı için değişim olayı en dar arayüzle okunur (UsersPage.tsx deseni). */
interface ChangeLike { target: unknown }
function changeValue(event: ChangeLike): string {
  return (event.target as unknown as { value: string }).value;
}

const STATUS_KEYS: Record<RewardStatus, TrKey> = {
  current: "admin.rewards.status.current",
  draft: "admin.rewards.status.draft",
  finalized: "admin.rewards.status.finalized",
};
const STATUS_TONE: Record<RewardStatus, "info" | "success" | "warning"> = {
  current: "info",
  draft: "warning",
  finalized: "success",
};
const FIELD_ERROR_KEYS: Record<RewardFieldErrorCode, TrKey> = {
  cohortsRequired: "admin.rewards.form.error.cohortsRequired",
  descriptionInvalid: "admin.rewards.form.error.descriptionInvalid",
  minAssessmentsInvalid: "admin.rewards.form.error.minAssessmentsInvalid",
  monthInvalid: "admin.rewards.form.error.monthInvalid",
  sponsorInvalid: "admin.rewards.form.error.sponsorInvalid",
  termsInvalid: "admin.rewards.form.error.termsInvalid",
  titleInvalid: "admin.rewards.form.error.titleInvalid",
  winnersCountInvalid: "admin.rewards.form.error.winnersCountInvalid",
};
const COHORT_KEYS: Record<1 | 2 | 3 | 4 | 5 | 6, TrKey> = {
  1: "admin.rewards.cohort.1",
  2: "admin.rewards.cohort.2",
  3: "admin.rewards.cohort.3",
  4: "admin.rewards.cohort.4",
  5: "admin.rewards.cohort.5",
  6: "admin.rewards.cohort.6",
};

function winnersSummary(reward: AdminReward): string {
  if (reward.finalizedAt === null || reward.winners.length === 0) return t("admin.rewards.winners.none");
  return reward.winners
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((winner) => `${winner.rank}. ${winner.displayName}`)
    .join(", ");
}

function buildRewardColumns(
  currentMonthKey: string,
  onEdit: (reward: AdminReward) => void,
  onDeleteRequest: (reward: AdminReward) => void,
  onFinalizeRequest: (reward: AdminReward) => void,
): readonly DataTableColumn<AdminReward>[] {
  return [
    { cell: (reward) => monthLabelTr(reward.month), header: t("admin.rewards.table.month"), key: "month" },
    { cell: (reward) => reward.title, header: t("admin.rewards.table.title"), key: "title" },
    { cell: (reward) => reward.sponsor, header: t("admin.rewards.table.sponsor"), key: "sponsor" },
    { cell: (reward) => String(reward.winnersCount), header: t("admin.rewards.table.winnersCount"), key: "winnersCount" },
    {
      cell: (reward) => {
        const status = rewardStatusFor(reward, currentMonthKey);
        return <Badge tone={STATUS_TONE[status]}>{t(STATUS_KEYS[status])}</Badge>;
      },
      header: t("admin.rewards.table.status"),
      key: "status",
    },
    { cell: (reward) => winnersSummary(reward), header: t("admin.rewards.table.winners"), key: "winners" },
    {
      cell: (reward) => {
        const finalized = reward.finalizedAt !== null;
        const closed = isMonthClosed(reward.month, currentMonthKey);
        return (
          <div className="eg-shell-rewards__rowActions">
            {!finalized && (
              <Button onClick={() => onEdit(reward)} variant="secondary">{t("admin.rewards.action.edit")}</Button>
            )}
            {!finalized && (
              <Button onClick={() => onDeleteRequest(reward)} variant="ghost">{t("admin.rewards.action.delete")}</Button>
            )}
            {!finalized && closed && (
              <Button onClick={() => onFinalizeRequest(reward)} variant="primary">{t("admin.rewards.action.finalize")}</Button>
            )}
          </div>
        );
      },
      header: t("admin.rewards.table.actions"),
      key: "actions",
    },
  ];
}

export interface RewardFormProps {
  readonly open: boolean;
  readonly mode: "create" | "edit";
  readonly values: RewardFormValues;
  readonly errors: RewardFieldErrors;
  readonly submitting: boolean;
  readonly submitErrorKey: TrKey | null;
  readonly onValuesChange: (patch: Partial<RewardFormValues>) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

export function RewardFormDialog({ open, mode, values, errors, submitting, submitErrorKey, onValuesChange, onSubmit, onClose }: RewardFormProps): JSX.Element {
  const formId = "eg-shell-rewardform-body";
  return (
    <Dialog
      size="lg"
      footer={
        <>
          <Button onClick={onClose} variant="secondary">{t("admin.rewards.form.action.cancel")}</Button>
          <Button form={formId} loading={submitting} type="submit" variant="primary">{t("admin.rewards.form.action.save")}</Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open={open}
      title={t(mode === "create" ? "admin.rewards.form.title.create" : "admin.rewards.form.title.edit")}
    >
      <form
        className="eg-shell-userform__form"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field error={errors.month === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.month])} label={t("admin.rewards.form.field.month")}>
          {(control) => (
            <TextInput
              {...control}
              disabled={mode === "edit"}
              onChange={(event: ChangeLike) => onValuesChange({ month: changeValue(event) })}
              type="month"
              value={values.month}
            />
          )}
        </Field>
        <Field error={errors.title === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.title])} label={t("admin.rewards.form.field.title")}>
          {(control) => (
            <TextInput {...control} maxLength={160} onChange={(event: ChangeLike) => onValuesChange({ title: changeValue(event) })} type="text" value={values.title} />
          )}
        </Field>
        <Field error={errors.description === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.description])} label={t("admin.rewards.form.field.description")}>
          {(control) => (
            <TextArea {...control} maxLength={800} onChange={(event: ChangeLike) => onValuesChange({ description: changeValue(event) })} rows={3} value={values.description} />
          )}
        </Field>
        <Field error={errors.sponsor === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.sponsor])} label={t("admin.rewards.form.field.sponsor")}>
          {(control) => (
            <TextInput {...control} maxLength={160} onChange={(event: ChangeLike) => onValuesChange({ sponsor: changeValue(event) })} type="text" value={values.sponsor} />
          )}
        </Field>
        <Field error={errors.winnersCount === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.winnersCount])} label={t("admin.rewards.form.field.winnersCount")}>
          {(control) => (
            <TextInput {...control} max={10} min={1} onChange={(event: ChangeLike) => onValuesChange({ winnersCount: changeValue(event) })} type="number" value={values.winnersCount} />
          )}
        </Field>
        <fieldset className="eg-shell-userform__field">
          <legend className="eg-field__label">{t("admin.rewards.form.field.cohorts")}</legend>
          {REWARD_COHORTS.map((cohort) => (
            <Checkbox
              checked={values.cohorts.includes(cohort)}
              key={cohort}
              label={t(COHORT_KEYS[cohort])}
              onCheckedChange={() => onValuesChange({ cohorts: toggleCohort(values.cohorts, cohort) })}
            />
          ))}
          {errors.cohorts !== undefined && <p className="eg-field__error">{t(FIELD_ERROR_KEYS[errors.cohorts])}</p>}
        </fieldset>
        <Field error={errors.minAssessments === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.minAssessments])} label={t("admin.rewards.form.field.minAssessments")}>
          {(control) => (
            <TextInput {...control} max={100} min={0} onChange={(event: ChangeLike) => onValuesChange({ minAssessments: changeValue(event) })} type="number" value={values.minAssessments} />
          )}
        </Field>
        <Switch
          checked={values.requirePublicName}
          label={t("admin.rewards.form.field.requirePublicName")}
          onCheckedChange={(checked) => onValuesChange({ requirePublicName: checked })}
        />
        <Field error={errors.terms === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.terms])} label={t("admin.rewards.form.field.terms")}>
          {(control) => (
            <TextArea {...control} onChange={(event: ChangeLike) => onValuesChange({ termsText: changeValue(event) })} rows={5} value={values.termsText} />
          )}
        </Field>
        {submitErrorKey !== null && <p className="eg-shell-userform__error" role="alert">{t(submitErrorKey)}</p>}
      </form>
    </Dialog>
  );
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly titleKey: TrKey;
  readonly bodyKey: TrKey;
  readonly confirmKey: TrKey;
  readonly cancelKey: TrKey;
  readonly busy: boolean;
  readonly errorKey: TrKey | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({ open, titleKey, bodyKey, confirmKey, cancelKey, busy, errorKey, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog
      footer={
        <>
          <Button onClick={onCancel} variant="secondary">{t(cancelKey)}</Button>
          <Button loading={busy} onClick={onConfirm} variant="primary">{t(confirmKey)}</Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      open={open}
      title={t(titleKey)}
    >
      <p>{t(bodyKey)}</p>
      {errorKey !== null && <p className="eg-shell-userform__error" role="alert">{t(errorKey)}</p>}
    </Dialog>
  );
}

export interface RewardsViewProps {
  readonly status: RewardsLoadStatus;
  readonly simId: SimId;
  readonly rewards: readonly AdminReward[] | null;
  readonly currentMonthKey: string;
  readonly onSimChange: (simId: SimId) => void;
  readonly onRetry: () => void;
  readonly onCreate: () => void;
  readonly onEdit: (reward: AdminReward) => void;
  readonly onDeleteRequest: (reward: AdminReward) => void;
  readonly onFinalizeRequest: (reward: AdminReward) => void;
  readonly form: RewardFormProps;
  readonly deleteDialog: ConfirmDialogProps;
  readonly finalizeDialog: ConfirmDialogProps;
}

/** Aylık ödüller ekranının durumsuz (props'tan beslenen) görünümü (T186). */
export function RewardsView({
  status,
  simId,
  rewards,
  onSimChange,
  onRetry,
  onCreate,
  onEdit,
  onDeleteRequest,
  onFinalizeRequest,
  currentMonthKey,
  form,
  deleteDialog,
  finalizeDialog,
}: RewardsViewProps): JSX.Element {
  const columns = buildRewardColumns(currentMonthKey, onEdit, onDeleteRequest, onFinalizeRequest);

  return (
    <section className="eg-shell-page eg-shell-rewards">
      <div className="eg-shell-users__head">
        <h1 className="eg-shell-page__title">{t("admin.rewards.title")}</h1>
        <div className="eg-shell-adminlist__actions">
          <Button icon={<icons.Plus />} onClick={onCreate} variant="primary">{t("admin.rewards.action.add")}</Button>
        </div>
      </div>
      <div className="eg-shell-rewards__simSelect">
        <Field label={t("admin.rewards.sim.label")}>
          {(control) => (
            <Select
              {...control}
              onValueChange={(value) => onSimChange(value as SimId)}
              options={REWARD_SIM_IDS.map((id) => ({ label: t(`sims.${id}.name`), value: id }))}
              value={simId}
            />
          )}
        </Field>
      </div>
      {status === "error" ? (
        <div className="eg-shell-users__error" role="alert">
          <p className="eg-shell-users__error-title">{t("admin.rewards.error.title")}</p>
          <p className="eg-shell-users__error-body">{t("admin.rewards.error.body")}</p>
          <Button onClick={onRetry} variant="secondary">{t("admin.rewards.error.retry")}</Button>
        </div>
      ) : (
        <DataTable<AdminReward>
          caption={t("admin.rewards.table.caption")}
          columns={columns}
          empty={<EmptyState icon={<icons.Trophy />} title={t("admin.rewards.empty")} />}
          loading={status === "loading"}
          rowKey={(reward) => `${reward.simId}:${reward.month}`}
          rows={status === "ready" && rewards !== null ? rewards : []}
        />
      )}
      <RewardFormDialog {...form} />
      <ConfirmDialog {...deleteDialog} />
      <ConfirmDialog {...finalizeDialog} />
    </section>
  );
}

export interface RewardsPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: RewardsDataSource;
}

/**
 * Aylık ödül yönetimi kabuk rotası (`#/admin/oduller`, T186). Veri
 * `RewardsDataSource` üzerinden enjekte edilir; çizim `RewardsView`'dedir.
 */
export function RewardsPage({ dataSource }: RewardsPageProps): JSX.Element {
  const shellSources = useShellDataSources();
  const source = useShellSource(dataSource, (sources) => sources.rewards, () => createMockRewardsSource());
  const toast = useToast();
  const [currentMonthKey] = useState(() => monthKeyTr(new Date(shellNow())));

  const [simId, setSimId] = useState<SimId>("pulse");
  const [status, setStatus] = useState<RewardsLoadStatus>("loading");
  const [rewards, setRewards] = useState<readonly AdminReward[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formValues, setFormValues] = useState<RewardFormValues>(initialRewardFormValues(nextMonthKey(currentMonthKey)));
  const [formErrors, setFormErrors] = useState<RewardFieldErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitErrorKey, setFormSubmitErrorKey] = useState<TrKey | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminReward | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<TrKey | null>(null);

  const [finalizeTarget, setFinalizeTarget] = useState<AdminReward | null>(null);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeErrorKey, setFinalizeErrorKey] = useState<TrKey | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    source.list(simId).then(
      (next) => {
        if (!active) return;
        setRewards(next);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [simId, attempt]);

  function refetch(): void {
    setAttempt((value) => value + 1);
  }

  function openCreate(): void {
    setFormMode("create");
    setFormValues(initialRewardFormValues(nextMonthKey(currentMonthKey)));
    setFormErrors({});
    setFormSubmitErrorKey(null);
    setFormOpen(true);
  }

  function openEdit(reward: AdminReward): void {
    setFormMode("edit");
    setFormValues(rewardFormValuesFrom(reward));
    setFormErrors({});
    setFormSubmitErrorKey(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setFormSubmitting(false);
    setFormSubmitErrorKey(null);
  }

  function submitForm(): void {
    const validation = validateRewardForm(formValues);
    setFormErrors(validation);
    if (hasRewardFormErrors(validation)) return;
    setFormSubmitting(true);
    setFormSubmitErrorKey(null);
    source.upsert(simId, formValues.month, toRewardUpsertRequest(formValues)).then(
      () => {
        setFormSubmitting(false);
        setFormOpen(false);
        void shellSources?.rewardStore.invalidate();
        toast({ title: t("admin.rewards.form.toast.success"), tone: "success" });
        refetch();
      },
      (error: unknown) => {
        setFormSubmitting(false);
        if (error instanceof Error && error.message === "reward_finalized") {
          setFormSubmitErrorKey("admin.rewards.form.error.finalized");
        } else {
          setFormSubmitErrorKey("admin.rewards.form.error.submit");
        }
      },
    );
  }

  function requestDelete(reward: AdminReward): void {
    setDeleteTarget(reward);
    setDeleteErrorKey(null);
  }

  function confirmDelete(): void {
    if (deleteTarget === null) return;
    setDeleteBusy(true);
    source.remove(deleteTarget.simId, deleteTarget.month).then(
      () => {
        setDeleteBusy(false);
        setDeleteTarget(null);
        void shellSources?.rewardStore.invalidate();
        toast({ title: t("admin.rewards.delete.toast.success"), tone: "success" });
        refetch();
      },
      (error: unknown) => {
        setDeleteBusy(false);
        setDeleteErrorKey(
          error instanceof Error && error.message === "reward_finalized" ? "admin.rewards.delete.error.finalized" : "admin.rewards.finalize.error.generic",
        );
      },
    );
  }

  function requestFinalize(reward: AdminReward): void {
    setFinalizeTarget(reward);
    setFinalizeErrorKey(null);
  }

  function confirmFinalize(): void {
    if (finalizeTarget === null) return;
    setFinalizeBusy(true);
    source.finalize(finalizeTarget.simId, finalizeTarget.month, currentMonthKey).then(
      () => {
        setFinalizeBusy(false);
        setFinalizeTarget(null);
        void shellSources?.rewardStore.invalidate();
        toast({ title: t("admin.rewards.finalize.toast.success"), tone: "success" });
        refetch();
      },
      (error: unknown) => {
        setFinalizeBusy(false);
        if (error instanceof Error && error.message === "month_not_closed") {
          setFinalizeErrorKey("admin.rewards.finalize.error.monthNotClosed");
        } else if (error instanceof Error && error.message === "already_finalized") {
          setFinalizeErrorKey("admin.rewards.finalize.error.alreadyFinalized");
        } else {
          setFinalizeErrorKey("admin.rewards.finalize.error.generic");
        }
      },
    );
  }

  const form: RewardFormProps = {
    errors: formErrors,
    mode: formMode,
    onClose: closeForm,
    onSubmit: submitForm,
    onValuesChange: (patch) => setFormValues((prev) => ({ ...prev, ...patch })),
    open: formOpen,
    submitErrorKey: formSubmitErrorKey,
    submitting: formSubmitting,
    values: formValues,
  };

  const deleteDialog: ConfirmDialogProps = {
    bodyKey: "admin.rewards.delete.body",
    busy: deleteBusy,
    cancelKey: "admin.rewards.delete.cancel",
    confirmKey: "admin.rewards.delete.confirm",
    errorKey: deleteErrorKey,
    onCancel: () => setDeleteTarget(null),
    onConfirm: confirmDelete,
    open: deleteTarget !== null,
    titleKey: "admin.rewards.delete.title",
  };

  const finalizeDialog: ConfirmDialogProps = {
    bodyKey: "admin.rewards.finalize.body",
    busy: finalizeBusy,
    cancelKey: "admin.rewards.finalize.cancel",
    confirmKey: "admin.rewards.finalize.confirm",
    errorKey: finalizeErrorKey,
    onCancel: () => setFinalizeTarget(null),
    onConfirm: confirmFinalize,
    open: finalizeTarget !== null,
    titleKey: "admin.rewards.finalize.title",
  };

  return (
    <RewardsView
      currentMonthKey={currentMonthKey}
      deleteDialog={deleteDialog}
      finalizeDialog={finalizeDialog}
      form={form}
      onCreate={openCreate}
      onDeleteRequest={requestDelete}
      onEdit={openEdit}
      onFinalizeRequest={requestFinalize}
      onRetry={refetch}
      onSimChange={setSimId}
      rewards={rewards}
      simId={simId}
      status={status}
    />
  );
}

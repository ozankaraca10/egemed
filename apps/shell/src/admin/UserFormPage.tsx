import { Fragment, useState, type JSX } from "react";
import { Button, Checkbox, Dialog, Field, RadioGroup, Select, TextInput, useToast } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import { useShellSource } from "../dataSources";
import { adminUsersHref } from "../routes";
import {
  hasFormErrors,
  INITIAL_CREATE_USER_VALUES,
  isFormDirty,
  toggleSimAccess,
  validateCreateUserForm,
  type CreateUserFieldErrorCode,
  type CreateUserFieldErrors,
  type CreateUserFormValues,
} from "./userForm";
import {
  ADMIN_UNITS,
  createMockUsersSource,
  DEFAULT_MOCK_SEED,
  SIM_IDS,
  type AssignableRole,
  type CreateUserInput,
  type MappingKeyType,
  type SimId,
  type UserAuthMethod,
  type UsersDataSource,
} from "./usersDataSource";

export type UserFormStep = "form" | "confirm";

const FIELD_ERROR_KEYS: Record<CreateUserFieldErrorCode, TrKey> = {
  displayNameInvalid: "admin.users.form.error.displayNameInvalid",
  duplicateMappingKey: "admin.users.form.error.duplicateMappingKey",
  emailInvalid: "admin.users.form.error.emailInvalid",
  mappingValueRequired: "admin.users.form.error.mappingValueRequired",
  unitRequired: "admin.users.form.error.unitRequired",
  usernameInvalid: "admin.users.form.error.usernameInvalid",
};

const AUTH_METHOD_KEYS: Record<UserAuthMethod, TrKey> = {
  dev: "admin.users.authMethod.dev",
  sso: "admin.users.authMethod.sso",
};

/** Form/onay adımında sunulan roller (§b: `admin` hariç, T184). */
const ASSIGNABLE_ROLE_KEYS: Record<AssignableRole, TrKey> = {
  kullanici: "admin.users.role.kullanici",
  ogretim_uyesi: "admin.users.role.ogretim_uyesi",
};

export interface UserFormViewProps {
  readonly step: UserFormStep;
  readonly values: CreateUserFormValues;
  readonly errors: CreateUserFieldErrors;
  readonly submitting: boolean;
  readonly submitError: boolean;
  readonly confirmDiscard: boolean;
  readonly onMappingTypeChange: (type: MappingKeyType) => void;
  readonly onMappingValueChange: (value: string) => void;
  readonly onDisplayNameChange: (value: string) => void;
  readonly onAuthMethodChange: (value: UserAuthMethod) => void;
  readonly onRoleChange: (value: AssignableRole) => void;
  readonly onUnitChange: (value: string) => void;
  readonly onSimAccessToggle: (simId: SimId) => void;
  readonly onSubmitRequest: () => void;
  readonly onConfirm: () => void;
  readonly onBackToForm: () => void;
  readonly onRequestClose: () => void;
}

/**
 * "Kullanıcı ekle" ekranının durumsuz (props'tan beslenen) görünümü (E3 §e.2).
 * `Dialog` tüm adım boyunca açık kalır; `step` "form" → "confirm" arasında
 * geçiş yapar (kaydetmeden önce özet diyaloğu). `UserFormPage` veri getirmeyi
 * ve durumu sarar; bu bileşen DOM'suz testlerde doğrudan render edilir.
 */
export function UserFormView({
  step,
  values,
  errors,
  submitting,
  submitError,
  confirmDiscard,
  onMappingTypeChange,
  onMappingValueChange,
  onDisplayNameChange,
  onAuthMethodChange,
  onRoleChange,
  onUnitChange,
  onSimAccessToggle,
  onSubmitRequest,
  onConfirm,
  onBackToForm,
  onRequestClose,
}: UserFormViewProps): JSX.Element {
  const formId = "eg-shell-userform-body";
  const title = t(step === "form" ? "admin.users.form.title" : "admin.users.form.confirm.title");
  const mappingLabel = t(values.mappingKeyType === "email" ? "admin.users.form.mappingKey.email" : "admin.users.form.mappingKey.username");

  // Adım geçişinde iki ayrı `Button` çifti aynı ağaç konumunu paylaşır; anahtarsız
  // olsa React DOM düğümünü yeniden kullanır ve `type="submit"`e geçen düğme, önceki
  // tıklamanın odağını üstlenip formu ikinci kez gönderebilir (T163). `key={step}`
  // adım değişince tam yeniden kurulumu garantiler.
  const formFooter = (
    <Fragment key="form">
      <Button onClick={onRequestClose} variant="secondary">{t("admin.users.form.action.cancel")}</Button>
      <Button form={formId} type="submit" variant="primary">{t("admin.users.form.action.save")}</Button>
    </Fragment>
  );
  const confirmFooter = (
    <Fragment key="confirm">
      <Button disabled={submitting} onClick={onBackToForm} variant="secondary">{t("admin.users.form.action.back")}</Button>
      <Button loading={submitting} onClick={onConfirm} variant="primary">{t("admin.users.form.action.confirm")}</Button>
    </Fragment>
  );

  return (
    <Dialog
      className="eg-shell-userform"
      footer={step === "form" ? formFooter : confirmFooter}
      onOpenChange={(open) => {
        if (!open) onRequestClose();
      }}
      open
      title={title}
    >
      {step === "form" ? (
        <form
          className="eg-shell-userform__form"
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitRequest();
          }}
        >
          <RadioGroup
            legend={t("admin.users.form.mappingKey.label")}
            onValueChange={(value) => onMappingTypeChange(value as MappingKeyType)}
            options={[
              { label: t("admin.users.form.mappingKey.username"), value: "username" },
              { label: t("admin.users.form.mappingKey.email"), value: "email" },
            ]}
            orientation="horizontal"
            value={values.mappingKeyType}
          />
          <Field
            error={errors.mappingKeyValue === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.mappingKeyValue])}
            label={mappingLabel}
          >
            {(control) => (
              <TextInput
                {...control}
                onChange={(event) => onMappingValueChange(event.target.value)}
                type="text"
                value={values.mappingKeyValue}
              />
            )}
          </Field>
          <Field
            error={errors.displayName === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.displayName])}
            label={t("admin.users.form.field.displayName")}
          >
            {(control) => (
              <TextInput
                {...control}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                type="text"
                value={values.displayName}
              />
            )}
          </Field>
          <Field hint={t("admin.users.form.field.authMethod.hint")} label={t("admin.users.form.field.authMethod")}>
            {(control) => (
              <Select
                {...control}
                onValueChange={(value) => onAuthMethodChange(value as UserAuthMethod)}
                options={[
                  { label: t("admin.users.authMethod.sso"), value: "sso" },
                  { label: t("admin.users.authMethod.dev"), value: "dev" },
                ]}
                value={values.authMethod}
              />
            )}
          </Field>
          <Field hint={t("admin.users.form.field.role.hint")} label={t("admin.users.form.field.role")}>
            {(control) => (
              <Select
                {...control}
                onValueChange={(value) => onRoleChange(value as AssignableRole)}
                options={[
                  { label: t("admin.users.role.kullanici"), value: "kullanici" },
                  { label: t("admin.users.role.ogretim_uyesi"), value: "ogretim_uyesi" },
                ]}
                value={values.role}
              />
            )}
          </Field>
          <Field
            error={errors.unitId === undefined ? undefined : t(FIELD_ERROR_KEYS[errors.unitId])}
            label={t("admin.users.form.field.unit")}
          >
            {(control) => (
              <Select
                {...control}
                onValueChange={onUnitChange}
                options={[
                  { label: t("admin.users.form.field.unit.placeholder"), value: "" },
                  ...ADMIN_UNITS.map((unit) => ({ label: unit.name, value: unit.id })),
                ]}
                value={values.unitId}
              />
            )}
          </Field>
          <fieldset className="eg-shell-userform__field">
            <legend className="eg-field__label">{t("admin.users.form.field.simAccess")}</legend>
            {SIM_IDS.map((simId) => (
              <Checkbox
                checked={values.simAccess.includes(simId)}
                key={simId}
                label={t(`sims.${simId}.name`)}
                onCheckedChange={() => onSimAccessToggle(simId)}
              />
            ))}
          </fieldset>
          <p className="eg-shell-userform__notice" role="note">{t("admin.users.form.notice.sso")}</p>
          {confirmDiscard && <p className="eg-shell-userform__discard" role="alert">{t("admin.users.form.discard.confirm")}</p>}
        </form>
      ) : (
        <div className="eg-shell-userform__confirm">
          <p>{t("admin.users.form.confirm.body")}</p>
          <dl className="eg-shell-userform__summary">
            <dt>{t("admin.users.form.confirm.authMethod")}</dt>
            <dd>{t(AUTH_METHOD_KEYS[values.authMethod])}</dd>
            <dt>{t("admin.users.form.confirm.role")}</dt>
            <dd>{t(ASSIGNABLE_ROLE_KEYS[values.role])}</dd>
            <dt>{t("admin.users.form.confirm.simAccess")}</dt>
            <dd>
              {values.simAccess.length === 0
                ? t("admin.users.form.confirm.simAccess.none")
                : values.simAccess.map((simId) => t(`sims.${simId}.name`)).join(", ")}
            </dd>
          </dl>
          {submitError && <p className="eg-shell-userform__error" role="alert">{t("admin.users.form.error.submit")}</p>}
        </div>
      )}
    </Dialog>
  );
}

export interface UserFormPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: UsersDataSource;
}

function toCreateUserInput(values: CreateUserFormValues): CreateUserInput {
  return {
    authMethod: values.authMethod,
    displayName: values.displayName,
    mappingKeyType: values.mappingKeyType,
    mappingKeyValue: values.mappingKeyValue,
    role: values.role,
    simAccess: values.simAccess,
    unitId: values.unitId,
  };
}

/** Hash'i listeye döndürür; DOM'suz ortamda (SSR/test) sessizce atlanır. */
function navigateToUsersList(): void {
  const win = (globalThis as { window?: { location: { hash: string } } }).window;
  if (win !== undefined) win.location.hash = adminUsersHref();
}

/**
 * Kullanıcı ekle kabuk rotası (`#/admin/kullanicilar/yeni`, T70). Durum ve
 * gönderim burada yönetilir; çizim `UserFormView`'dedir.
 */
export function UserFormPage({ dataSource }: UserFormPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.users, () => createMockUsersSource(DEFAULT_MOCK_SEED));
  const toast = useToast();

  const [values, setValues] = useState<CreateUserFormValues>(INITIAL_CREATE_USER_VALUES);
  const [step, setStep] = useState<UserFormStep>("form");
  const [errors, setErrors] = useState<CreateUserFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function requestClose(): void {
    if (isFormDirty(values) && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    navigateToUsersList();
  }

  function updateValues(patch: Partial<CreateUserFormValues>): void {
    setValues((prev) => ({ ...prev, ...patch }));
    setConfirmDiscard(false);
  }

  function onSubmitRequest(): void {
    const validation = validateCreateUserForm(values);
    setErrors(validation);
    if (hasFormErrors(validation)) return;
    setStep("confirm");
  }

  function onConfirm(): void {
    setSubmitting(true);
    setSubmitError(false);
    source.create(toCreateUserInput(values)).then(
      () => {
        toast({ title: t("admin.users.form.toast.success"), tone: "success" });
        navigateToUsersList();
      },
      (error: unknown) => {
        setSubmitting(false);
        if (error instanceof Error && error.message === "duplicate_mapping_key") {
          setErrors({ mappingKeyValue: "duplicateMappingKey" });
          setStep("form");
        } else {
          setSubmitError(true);
        }
      },
    );
  }

  return (
    <UserFormView
      confirmDiscard={confirmDiscard}
      errors={errors}
      onAuthMethodChange={(authMethod) => updateValues({ authMethod })}
      onBackToForm={() => setStep("form")}
      onConfirm={onConfirm}
      onDisplayNameChange={(displayName) => updateValues({ displayName })}
      onMappingTypeChange={(mappingKeyType) => updateValues({ mappingKeyType, mappingKeyValue: "" })}
      onMappingValueChange={(mappingKeyValue) => updateValues({ mappingKeyValue })}
      onRequestClose={requestClose}
      onRoleChange={(role) => updateValues({ role })}
      onSimAccessToggle={(simId) => updateValues({ simAccess: toggleSimAccess(values.simAccess, simId) })}
      onSubmitRequest={onSubmitRequest}
      onUnitChange={(unitId) => updateValues({ unitId })}
      step={step}
      submitError={submitError}
      submitting={submitting}
      values={values}
    />
  );
}

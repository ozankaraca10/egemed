import { useId, useRef, useState, type JSX } from "react";
import { Modal } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
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
  type CreateUserInput,
  type MappingKeyType,
  type SimId,
  type UserAuthMethod,
  type UsersDataSource,
} from "./usersDataSource";

/** Kök tsconfig DOM lib'i taşımadığı için değişim olayı en dar arayüzle okunur (UsersPage.tsx deseni). */
interface ChangeLike { target: unknown }
function changeValue(event: ChangeLike): string {
  return (event.target as unknown as { value: string }).value;
}

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
  readonly onUnitChange: (value: string) => void;
  readonly onSimAccessToggle: (simId: SimId) => void;
  readonly onSubmitRequest: () => void;
  readonly onConfirm: () => void;
  readonly onBackToForm: () => void;
  readonly onRequestClose: () => void;
}

/**
 * "Kullanıcı ekle" ekranının durumsuz (props'tan beslenen) görünümü (E3 §e.2).
 * `Modal` tüm adım boyunca açık kalır; `step` "form" → "confirm" arasında
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
  onUnitChange,
  onSimAccessToggle,
  onSubmitRequest,
  onConfirm,
  onBackToForm,
  onRequestClose,
}: UserFormViewProps): JSX.Element {
  const mappingId = useId();
  const nameId = useId();
  const unitId = useId();
  const title = t(step === "form" ? "admin.users.form.title" : "admin.users.form.confirm.title");

  return (
    <Modal className="eg-shell-userform" onClose={onRequestClose} open title={title}>
      {step === "form" ? (
        <form
          className="eg-shell-userform__form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitRequest();
          }}
        >
          <fieldset className="eg-shell-userform__field">
            <legend className="eg-shell-userform__label">{t("admin.users.form.mappingKey.label")}</legend>
            <label className="eg-shell-userform__radio">
              <input
                checked={values.mappingKeyType === "username"}
                name="mappingKeyType"
                onChange={() => onMappingTypeChange("username")}
                type="radio"
                value="username"
              />
              {t("admin.users.form.mappingKey.username")}
            </label>
            <label className="eg-shell-userform__radio">
              <input
                checked={values.mappingKeyType === "email"}
                name="mappingKeyType"
                onChange={() => onMappingTypeChange("email")}
                type="radio"
                value="email"
              />
              {t("admin.users.form.mappingKey.email")}
            </label>
          </fieldset>
          <label className="eg-shell-userform__field" htmlFor={mappingId}>
            <span className="eg-shell-userform__label">
              {t(values.mappingKeyType === "email" ? "admin.users.form.mappingKey.email" : "admin.users.form.mappingKey.username")}
            </span>
            <input
              aria-describedby={errors.mappingKeyValue === undefined ? undefined : `${mappingId}-error`}
              aria-invalid={errors.mappingKeyValue !== undefined}
              id={mappingId}
              onChange={(event: ChangeLike) => onMappingValueChange(changeValue(event))}
              type="text"
              value={values.mappingKeyValue}
            />
          </label>
          {errors.mappingKeyValue !== undefined && (
            <p className="eg-shell-userform__error" id={`${mappingId}-error`} role="alert">
              {t(FIELD_ERROR_KEYS[errors.mappingKeyValue])}
            </p>
          )}
          <label className="eg-shell-userform__field" htmlFor={nameId}>
            <span className="eg-shell-userform__label">{t("admin.users.form.field.displayName")}</span>
            <input
              aria-describedby={errors.displayName === undefined ? undefined : `${nameId}-error`}
              aria-invalid={errors.displayName !== undefined}
              id={nameId}
              onChange={(event: ChangeLike) => onDisplayNameChange(changeValue(event))}
              type="text"
              value={values.displayName}
            />
          </label>
          {errors.displayName !== undefined && (
            <p className="eg-shell-userform__error" id={`${nameId}-error`} role="alert">
              {t(FIELD_ERROR_KEYS[errors.displayName])}
            </p>
          )}
          <label className="eg-shell-userform__field">
            <span className="eg-shell-userform__label">
              {t("admin.users.form.field.authMethod")} <small>({t("admin.users.form.field.authMethod.hint")})</small>
            </span>
            <select
              onChange={(event: ChangeLike) => onAuthMethodChange(changeValue(event) as UserAuthMethod)}
              value={values.authMethod}
            >
              <option value="sso">{t("admin.users.authMethod.sso")}</option>
              <option value="dev">{t("admin.users.authMethod.dev")}</option>
            </select>
          </label>
          <label className="eg-shell-userform__field">
            <span className="eg-shell-userform__label">
              {t("admin.users.form.field.role")} <small>({t("admin.users.form.field.role.hint")})</small>
            </span>
            <select disabled value="kullanici">
              <option value="kullanici">{t("admin.users.role.kullanici")}</option>
            </select>
          </label>
          <label className="eg-shell-userform__field" htmlFor={unitId}>
            <span className="eg-shell-userform__label">{t("admin.users.form.field.unit")}</span>
            <select
              aria-describedby={errors.unitId === undefined ? undefined : `${unitId}-error`}
              aria-invalid={errors.unitId !== undefined}
              id={unitId}
              onChange={(event: ChangeLike) => onUnitChange(changeValue(event))}
              value={values.unitId}
            >
              <option value="">{t("admin.users.form.field.unit.placeholder")}</option>
              {ADMIN_UNITS.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          {errors.unitId !== undefined && (
            <p className="eg-shell-userform__error" id={`${unitId}-error`} role="alert">
              {t(FIELD_ERROR_KEYS[errors.unitId])}
            </p>
          )}
          <fieldset className="eg-shell-userform__field">
            <legend className="eg-shell-userform__label">{t("admin.users.form.field.simAccess")}</legend>
            {SIM_IDS.map((simId) => (
              <label className="eg-shell-userform__checkbox" key={simId}>
                <input
                  checked={values.simAccess.includes(simId)}
                  onChange={() => onSimAccessToggle(simId)}
                  type="checkbox"
                />
                {t(`sims.${simId}.name`)}
              </label>
            ))}
          </fieldset>
          <p className="eg-shell-userform__notice" role="note">{t("admin.users.form.notice.sso")}</p>
          <div className="eg-shell-userform__actions">
            <button onClick={onRequestClose} type="button">{t("admin.users.form.action.cancel")}</button>
            <button type="submit">{t("admin.users.form.action.save")}</button>
          </div>
          {confirmDiscard && <p className="eg-shell-userform__discard" role="alert">{t("admin.users.form.discard.confirm")}</p>}
        </form>
      ) : (
        <div className="eg-shell-userform__confirm">
          <p>{t("admin.users.form.confirm.body")}</p>
          <dl className="eg-shell-userform__summary">
            <dt>{t("admin.users.form.confirm.authMethod")}</dt>
            <dd>{t(AUTH_METHOD_KEYS[values.authMethod])}</dd>
            <dt>{t("admin.users.form.confirm.role")}</dt>
            <dd>{t("admin.users.role.kullanici")}</dd>
            <dt>{t("admin.users.form.confirm.simAccess")}</dt>
            <dd>
              {values.simAccess.length === 0
                ? t("admin.users.form.confirm.simAccess.none")
                : values.simAccess.map((simId) => t(`sims.${simId}.name`)).join(", ")}
            </dd>
          </dl>
          {submitError && <p className="eg-shell-userform__error" role="alert">{t("admin.users.form.error.submit")}</p>}
          <div className="eg-shell-userform__actions">
            <button disabled={submitting} onClick={onBackToForm} type="button">{t("admin.users.form.action.back")}</button>
            <button disabled={submitting} onClick={onConfirm} type="button">{t("admin.users.form.action.confirm")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function defaultSource(): UsersDataSource {
  return createMockUsersSource(DEFAULT_MOCK_SEED);
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
  const sourceRef = useRef<UsersDataSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = dataSource ?? defaultSource();

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
    sourceRef.current?.create(toCreateUserInput(values)).then(
      () => navigateToUsersList(),
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

import { useState, type JSX } from "react";
import { Button, Dialog, Field, Select, TextArea, TextInput, useToast } from "@egemed/ui";
import { useShellSource } from "../dataSources";
import { t, type TrKey } from "@egemed/ui/i18n";
import {
  autoMapHeaders,
  buildErrorReportCsv,
  createMockImportsSource,
  TEMPLATE_COLUMNS,
  type ColumnMapping,
  type ImportApplyResult,
  type ImportBatch,
  type ImportMode,
  type ImportRow,
  type ImportsDataSource,
  type TemplateColumn,
} from "./importsDataSource";

/** DOM'suz ortamda (SSR/test) sessizce atlanan CSV indirme; yapısal tipler DOM lib gerektirmez (Modal.tsx deseni). */
interface DownloadAnchor { href: string; download: string; click(): void }
interface DownloadDocument { createElement(tag: string): DownloadAnchor }
interface DownloadUrl { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void }
function triggerCsvDownload(fileName: string, csv: string): void {
  const doc = (globalThis as { document?: DownloadDocument }).document;
  const BlobCtor = (globalThis as { Blob?: new (parts: string[], options?: { type?: string }) => unknown }).Blob;
  const url = (globalThis as { URL?: DownloadUrl }).URL;
  if (doc === undefined || BlobCtor === undefined || url === undefined) return;
  const objectUrl = url.createObjectURL(new BlobCtor([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = doc.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  url.revokeObjectURL(objectUrl);
}

export type ImportWizardStep = "template" | "upload" | "map" | "validate" | "preview" | "apply" | "result";
const STEP_ORDER: readonly ImportWizardStep[] = ["template", "upload", "map", "validate", "preview", "apply", "result"];
const STEP_LABEL_KEYS: Record<ImportWizardStep, TrKey> = {
  apply: "admin.import.step.apply",
  map: "admin.import.step.map",
  preview: "admin.import.step.preview",
  result: "admin.import.step.result",
  template: "admin.import.step.template",
  upload: "admin.import.step.upload",
  validate: "admin.import.step.validate",
};
const FIELD_LABEL_KEYS: Record<TemplateColumn, TrKey> = {
  ad_soyad: "admin.import.field.ad_soyad",
  birim_kodu: "admin.import.field.birim_kodu",
  eposta: "admin.import.field.eposta",
  giris_tipi: "admin.import.field.giris_tipi",
  kullanici_adi: "admin.import.field.kullanici_adi",
  rol: "admin.import.field.rol",
  sim_erisimi: "admin.import.field.sim_erisimi",
};
const UPLOAD_ERROR_KEYS: Record<string, TrKey> = {
  empty_file: "admin.import.upload.error.empty_file",
  file_too_large: "admin.import.upload.error.file_too_large",
  too_many_rows: "admin.import.upload.error.too_many_rows",
};
function uploadErrorKey(code: string | null): TrKey {
  if (code === null) return "admin.import.upload.error.generic";
  return UPLOAD_ERROR_KEYS[code] ?? "admin.import.upload.error.generic";
}

export type WizardAsyncStatus = "idle" | "loading" | "error";

function StepNav({ step }: { readonly step: ImportWizardStep }): JSX.Element {
  return (
    <ol aria-label={t("admin.import.steps.label")} className="eg-shell-import__steps">
      {STEP_ORDER.map((candidate, index) => (
        <li
          aria-current={candidate === step ? "step" : undefined}
          className="eg-shell-import__step"
          key={candidate}
        >
          <span aria-hidden="true" className="eg-shell-import__step-num">{index + 1}</span>
          {t(STEP_LABEL_KEYS[candidate])}
        </li>
      ))}
    </ol>
  );
}

export interface ImportWizardViewProps {
  readonly step: ImportWizardStep;
  readonly mode: ImportMode;
  readonly fileNameInput: string;
  readonly csvText: string;
  readonly uploadStatus: WizardAsyncStatus;
  readonly uploadErrorCode: string | null;
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly validateStatus: WizardAsyncStatus;
  readonly rows: readonly ImportRow[];
  readonly batch: ImportBatch | null;
  readonly applyStatus: WizardAsyncStatus;
  readonly applyConfirmOpen: boolean;
  readonly applyResult: ImportApplyResult | null;
  readonly onModeChange: (mode: ImportMode) => void;
  readonly onDownloadTemplate: () => void;
  readonly onFileNameChange: (value: string) => void;
  readonly onCsvTextChange: (value: string) => void;
  readonly onUploadRequest: () => void;
  readonly onMappingChange: (column: TemplateColumn, header: string) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onValidateRetry: () => void;
  readonly onRequestApply: () => void;
  readonly onCancelApply: () => void;
  readonly onConfirmApply: () => void;
  readonly onDownloadErrors: () => void;
  readonly onRestart: () => void;
}

/**
 * Toplu içe aktarma sihirbazının durumsuz (props'tan beslenen) görünümü (E3
 * §e.4). Yedi adım: şablon → yükle → eşle → doğrula → önizle → uygula →
 * sonuç; her adımda boş/yükleniyor/hata/onay durumları vardır. `ImportWizardPage`
 * veri getirmeyi sarar; bu bileşen DOM'suz testlerde doğrudan render edilir.
 */
export function ImportWizardView(props: ImportWizardViewProps): JSX.Element {
  const { step } = props;
  const validRows = props.rows.filter((row) => row.status === "valid");
  const errorRows = props.rows.filter((row) => row.status === "error");

  return (
    <section className="eg-shell-page eg-shell-import">
      <h1 className="eg-shell-page__title">{t("admin.import.title")}</h1>
      <StepNav step={step} />

      {step === "template" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.template.title")}</h2>
          <p>{t("admin.import.template.body")}</p>
          <Button onClick={props.onDownloadTemplate} variant="secondary">{t("admin.import.template.download")}</Button>
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onNext} variant="primary">{t("admin.import.action.next")}</Button>
          </div>
        </div>
      )}

      {step === "upload" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.upload.title")}</h2>
          <p className="eg-shell-users__field-label">{t("admin.import.upload.hint")}</p>
          <Field label={t("admin.import.upload.mode.label")}>
            {(control) => (
              <Select
                {...control}
                onValueChange={(value) => props.onModeChange(value as ImportMode)}
                options={[
                  { label: t("admin.import.upload.mode.ekle"), value: "ekle" },
                  { label: t("admin.import.upload.mode.guncelle"), value: "guncelle" },
                ]}
                value={props.mode}
              />
            )}
          </Field>
          <Field label={t("admin.import.upload.fileName")}>
            {(control) => (
              <TextInput
                {...control}
                onChange={(event) => props.onFileNameChange(event.target.value)}
                type="text"
                value={props.fileNameInput}
              />
            )}
          </Field>
          <Field label={t("admin.import.upload.content")}>
            {(control) => (
              <TextArea
                {...control}
                onChange={(event) => props.onCsvTextChange(event.target.value)}
                rows={8}
                value={props.csvText}
              />
            )}
          </Field>
          {props.uploadStatus === "error" && (
            <p className="eg-shell-userform__error" role="alert">{t(uploadErrorKey(props.uploadErrorCode))}</p>
          )}
          {props.uploadStatus !== "error" && props.headers.length > 0 && (
            <p>{props.batch?.rowCount ?? 0} {t("admin.import.upload.rowCount")}</p>
          )}
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onBack} variant="secondary">{t("admin.import.action.back")}</Button>
            <Button loading={props.uploadStatus === "loading"} onClick={props.onUploadRequest} variant="secondary">
              {t("admin.import.upload.action")}
            </Button>
            <Button disabled={props.headers.length === 0} onClick={props.onNext} variant="primary">
              {t("admin.import.action.next")}
            </Button>
          </div>
        </div>
      )}

      {step === "map" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.map.title")}</h2>
          <p>{t("admin.import.map.hint")}</p>
          <table className="eg-shell-import__mapTable" role="table">
            <caption className="eg-visually-hidden">{t("admin.import.map.title")}</caption>
            <thead>
              <tr role="row">
                <th role="columnheader" scope="col">{t("admin.import.map.column.field")}</th>
                <th role="columnheader" scope="col">{t("admin.import.map.column.header")}</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_COLUMNS.map((column) => (
                <tr key={column} role="row">
                  <td role="cell">{t(FIELD_LABEL_KEYS[column])}</td>
                  <td role="cell">
                    <Select
                      aria-label={t(FIELD_LABEL_KEYS[column])}
                      onValueChange={(header) => props.onMappingChange(column, header)}
                      options={[
                        { label: t("admin.import.map.column.placeholder"), value: "" },
                        ...props.headers.map((header) => ({ label: header, value: header })),
                      ]}
                      value={props.mapping[column] ?? ""}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onBack} variant="secondary">{t("admin.import.action.back")}</Button>
            <Button onClick={props.onNext} variant="primary">{t("admin.import.action.next")}</Button>
          </div>
        </div>
      )}

      {step === "validate" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.validate.title")}</h2>
          {props.validateStatus === "loading" && (
            <div aria-hidden="true" className="eg-shell-users__skeleton">
              <span className="eg-shell-users__skeleton-row" />
              <span className="eg-shell-users__skeleton-row" />
            </div>
          )}
          {props.validateStatus === "error" && (
            <div className="eg-shell-users__error" role="alert">
              <p className="eg-shell-users__error-title">{t("admin.import.validate.error.title")}</p>
              <p className="eg-shell-users__error-body">{t("admin.import.validate.error.body")}</p>
              <Button onClick={props.onValidateRetry} variant="secondary">{t("admin.users.error.retry")}</Button>
            </div>
          )}
          {props.validateStatus === "idle" && props.batch !== null && (
            <>
              <p>
                {props.batch.validCount} {t("admin.import.validate.valid")} · {props.batch.errorCount} {t("admin.import.validate.invalid")}
              </p>
              {props.batch.errorCount === 0 ? (
                <p>{t("admin.import.validate.none")}</p>
              ) : (
                <>
                  <p className="eg-shell-userform__label">{t("admin.import.validate.errors.title")}</p>
                  <ul className="eg-shell-import__errorList">
                    {errorRows.slice(0, 20).flatMap((row) =>
                      row.errors.map((error, index) => (
                        <li key={`${row.rowNo}-${index}`}>
                          {t("admin.import.validate.errors.row")} {row.rowNo} · {t(FIELD_LABEL_KEYS[error.column])} · {error.message}
                        </li>
                      )),
                    )}
                  </ul>
                  <Button onClick={props.onDownloadErrors} variant="secondary">{t("admin.import.validate.download")}</Button>
                </>
              )}
            </>
          )}
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onBack} variant="secondary">{t("admin.import.action.back")}</Button>
            <Button disabled={props.batch === null || props.batch.validCount === 0} onClick={props.onNext} variant="primary">
              {t("admin.import.action.next")}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.preview.title")}</h2>
          <p>{t(props.mode === "ekle" ? "admin.import.preview.mode.ekle" : "admin.import.preview.mode.guncelle")}</p>
          {validRows.length === 0 ? (
            <p>{t("admin.import.preview.empty")}</p>
          ) : (
            <ul className="eg-shell-import__previewList">
              {validRows.slice(0, 10).map((row) => (
                <li key={row.rowNo}>{row.raw.ad_soyad} — {row.raw.kullanici_adi.length > 0 ? row.raw.kullanici_adi : row.raw.eposta}</li>
              ))}
            </ul>
          )}
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onBack} variant="secondary">{t("admin.import.action.back")}</Button>
            <Button disabled={validRows.length === 0} onClick={props.onNext} variant="primary">{t("admin.import.action.next")}</Button>
          </div>
        </div>
      )}

      {step === "apply" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.apply.title")}</h2>
          <p>
            {props.batch?.validCount ?? 0} {t(props.mode === "ekle" ? "admin.import.preview.mode.ekle" : "admin.import.preview.mode.guncelle")}
          </p>
          {props.applyStatus === "error" && (
            <p className="eg-shell-userform__error" role="alert">{t("admin.import.apply.error")}</p>
          )}
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onBack} variant="secondary">{t("admin.import.action.back")}</Button>
            <Button disabled={(props.batch?.validCount ?? 0) === 0} onClick={props.onRequestApply} variant="primary">
              {t("admin.import.apply.action")}
            </Button>
          </div>
          <Dialog
            footer={
              <>
                <Button disabled={props.applyStatus === "loading"} onClick={props.onCancelApply} variant="secondary">
                  {t("admin.users.detail.action.cancel")}
                </Button>
                <Button loading={props.applyStatus === "loading"} onClick={props.onConfirmApply} variant="primary">
                  {t("admin.import.apply.action")}
                </Button>
              </>
            }
            onOpenChange={(open) => {
              if (!open) props.onCancelApply();
            }}
            open={props.applyConfirmOpen}
            title={t("admin.import.apply.confirm.title")}
          >
            <p>
              {props.batch?.validCount ?? 0}{" "}
              {t(props.mode === "ekle" ? "admin.import.apply.confirm.body.ekle" : "admin.import.apply.confirm.body.guncelle")}
            </p>
          </Dialog>
        </div>
      )}

      {step === "result" && (
        <div className="eg-shell-import__panel">
          <h2 className="eg-shell-import__panelTitle">{t("admin.import.result.title")}</h2>
          {props.applyResult !== null && (
            <>
              {props.applyResult.alreadyApplied && <p>{t("admin.import.result.alreadyApplied")}</p>}
              <p>
                {props.applyResult.appliedCount} {t("admin.import.result.applied")} · {props.applyResult.errorCount}{" "}
                {t("admin.import.validate.invalid")}
              </p>
              {props.applyResult.errorCount > 0 && (
                <Button onClick={props.onDownloadErrors} variant="secondary">{t("admin.import.validate.download")}</Button>
              )}
            </>
          )}
          <div className="eg-shell-userform__actions">
            <Button onClick={props.onRestart} variant="primary">{t("admin.import.result.restart")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export interface ImportWizardPageProps {
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: ImportsDataSource;
}

const INITIAL_FILE_NAME = "kullanicilar.csv";

/**
 * Toplu içe aktarma sihirbazı kabuk rotası (`#/admin/ice-aktar`, T71). Durum
 * (adım, yükleme/doğrulama/uygulama yaşam döngüsü) burada yönetilir; çizim
 * `ImportWizardView`'dedir.
 */
export function ImportWizardPage({ dataSource }: ImportWizardPageProps): JSX.Element {
  const source = useShellSource(dataSource, (sources) => sources.imports, () => createMockImportsSource());
  const toast = useToast();

  const [step, setStep] = useState<ImportWizardStep>("template");
  const [mode, setMode] = useState<ImportMode>("ekle");
  const [fileNameInput, setFileNameInput] = useState(INITIAL_FILE_NAME);
  const [csvText, setCsvText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<WizardAsyncStatus>("idle");
  const [uploadErrorCode, setUploadErrorCode] = useState<string | null>(null);
  const [headers, setHeaders] = useState<readonly string[]>([]);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validateStatus, setValidateStatus] = useState<WizardAsyncStatus>("idle");
  const [rows, setRows] = useState<readonly ImportRow[]>([]);
  const [applyStatus, setApplyStatus] = useState<WizardAsyncStatus>("idle");
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ImportApplyResult | null>(null);

  function runValidate(batchId: string, currentMapping: ColumnMapping): void {
    setValidateStatus("loading");
    source.validate(batchId, currentMapping).then(
      (result) => {
        setBatch(result.batch);
        setRows(result.rows);
        setValidateStatus("idle");
      },
      () => setValidateStatus("error"),
    );
  }

  function goBack(): void {
    const index = STEP_ORDER.indexOf(step);
    const prev = STEP_ORDER[index - 1];
    if (prev !== undefined) setStep(prev);
  }

  function goNext(): void {
    const index = STEP_ORDER.indexOf(step);
    const next = STEP_ORDER[index + 1];
    if (next === undefined) return;
    if (step === "map" && batch !== null) runValidate(batch.id, mapping);
    setStep(next);
  }

  function onUploadRequest(): void {
    setUploadStatus("loading");
    source.upload({ csvText, fileName: fileNameInput, mode }).then(
      (result) => {
        setBatch(result.batch);
        setHeaders(result.headers);
        setMapping(autoMapHeaders(result.headers));
        setUploadStatus("idle");
        setUploadErrorCode(null);
      },
      (error: unknown) => {
        setUploadStatus("error");
        setUploadErrorCode(error instanceof Error ? error.message : null);
      },
    );
  }

  function onConfirmApply(): void {
    if (batch === null) return;
    setApplyStatus("loading");
    source.apply(batch.id).then(
      (result) => {
        setApplyResult(result);
        setApplyStatus("idle");
        setApplyConfirmOpen(false);
        setStep("result");
        toast({ title: t("admin.import.toast.success"), tone: "success" });
      },
      () => setApplyStatus("error"),
    );
  }

  function onDownloadErrors(): void {
    triggerCsvDownload(`hata-raporu-${batch?.id ?? "import"}.csv`, buildErrorReportCsv(rows));
  }

  function restart(): void {
    setStep("template");
    setMode("ekle");
    setFileNameInput(INITIAL_FILE_NAME);
    setCsvText("");
    setUploadStatus("idle");
    setUploadErrorCode(null);
    setHeaders([]);
    setBatch(null);
    setMapping({});
    setValidateStatus("idle");
    setRows([]);
    setApplyStatus("idle");
    setApplyConfirmOpen(false);
    setApplyResult(null);
  }

  return (
    <ImportWizardView
      applyConfirmOpen={applyConfirmOpen}
      applyResult={applyResult}
      applyStatus={applyStatus}
      batch={batch}
      csvText={csvText}
      fileNameInput={fileNameInput}
      headers={headers}
      mapping={mapping}
      mode={mode}
      onBack={goBack}
      onCancelApply={() => setApplyConfirmOpen(false)}
      onConfirmApply={onConfirmApply}
      onCsvTextChange={setCsvText}
      onDownloadErrors={onDownloadErrors}
      onDownloadTemplate={() => {
        source.template().then(({ csv, fileName }) => triggerCsvDownload(fileName, csv));
      }}
      onFileNameChange={setFileNameInput}
      onMappingChange={(column, header) =>
        setMapping((prev) => ({ ...prev, [column]: header.length === 0 ? undefined : header }))
      }
      onModeChange={setMode}
      onNext={goNext}
      onRequestApply={() => setApplyConfirmOpen(true)}
      onRestart={restart}
      onUploadRequest={onUploadRequest}
      onValidateRetry={() => batch !== null && runValidate(batch.id, mapping)}
      rows={rows}
      step={step}
      uploadErrorCode={uploadErrorCode}
      uploadStatus={uploadStatus}
      validateStatus={validateStatus}
    />
  );
}

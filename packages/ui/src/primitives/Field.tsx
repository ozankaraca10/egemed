import { useId, type ComponentProps, type JSX, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cx } from "./props";

/** `Field`in denetime verdiği bağlantılar: kimlik, açıklama ve geçersizlik. */
export interface FieldControlProps {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
  readonly required?: true;
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly id?: string;
  readonly className?: string;
  /** Denetimi çizer; etiket/ipucu/hata bağlantılarını prop olarak alır. */
  readonly children: (control: FieldControlProps) => ReactNode;
}

/** Etiket + ipucu + hata iletisini denetime bağlayan form alanı (WCAG 1.3.1, 3.3.1). */
export function Field({ label, hint, error, required = false, id, className, children }: FieldProps): JSX.Element {
  const auto = useId();
  const controlId = id ?? `f${auto.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = hint !== undefined ? `${controlId}-hint` : undefined;
  const errorId = error !== undefined && error !== null && error !== false ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter((part): part is string => part !== undefined).join(" ");
  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy.length > 0 ? { "aria-describedby": describedBy } : {}),
    ...(errorId !== undefined ? { "aria-invalid": true as const } : {}),
    ...(required ? { required: true as const } : {}),
  };
  return (
    <div className={cx("eg-field", errorId !== undefined && "eg-field--invalid", className)}>
      <label className="eg-field__label" htmlFor={controlId}>
        {label}
        {required ? <span className="eg-field__req" aria-hidden="true"> *</span> : null}
      </label>
      {hintId !== undefined ? <p className="eg-field__hint" id={hintId}>{hint}</p> : null}
      {children(control)}
      {errorId !== undefined ? (
        <p className="eg-field__error" id={errorId}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Tek satırlık metin girişi. */
export function TextInput({ className, ...rest }: ComponentProps<"input">): JSX.Element {
  return <input {...rest} className={cx("eg-input", className)} />;
}

/** Çok satırlı metin girişi. */
export function TextArea({ className, ...rest }: ComponentProps<"textarea">): JSX.Element {
  return <textarea {...rest} className={cx("eg-input", "eg-input--area", className)} />;
}

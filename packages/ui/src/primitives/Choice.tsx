import { useId, type JSX, type ReactNode } from "react";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cx, definedProps } from "./props";

const safeId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, "");

export interface CheckboxProps {
  readonly checked: boolean | "indeterminate";
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly id?: string;
  readonly disabled?: boolean;
  /** Etiket görsel olarak gizlenir (tablo satır seçimi gibi); erişilebilir ad kalır. */
  readonly hideLabel?: boolean;
  readonly className?: string;
}

/** Onay kutusu: 20 px görünür kutu, 44 px dokunma alanı; etiket tıklanabilir. */
export function Checkbox({ checked, onCheckedChange, label, description, id, disabled, hideLabel = false, className }: CheckboxProps): JSX.Element {
  const auto = useId();
  const controlId = id ?? `c${safeId(auto)}`;
  const descriptionId = description !== undefined ? `${controlId}-desc` : undefined;
  return (
    <div className={cx("eg-check", disabled === true && "eg-check--disabled", className)}>
      <CheckboxPrimitive.Root
        className="eg-check__control"
        id={controlId}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        {...definedProps({ disabled, "aria-describedby": descriptionId })}
      >
        <span className="eg-check__box">
          <CheckboxPrimitive.Indicator className="eg-check__mark">
            {checked === "indeterminate" ? <Minus size={14} strokeWidth={3} aria-hidden="true" /> : <Check size={14} strokeWidth={3} aria-hidden="true" />}
          </CheckboxPrimitive.Indicator>
        </span>
      </CheckboxPrimitive.Root>
      <label htmlFor={controlId} className={cx("eg-check__label", hideLabel && "eg-visually-hidden")}>
        {label}
        {description !== undefined ? <span className="eg-check__desc" id={descriptionId}>{description}</span> : null}
      </label>
    </div>
  );
}

export interface RadioOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export interface RadioGroupProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly RadioOption[];
  /** Grubun erişilebilir adı (görünür başlık `legend` olarak çizilir). */
  readonly legend: ReactNode;
  readonly orientation?: "vertical" | "horizontal";
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Radyo grubu: ok tuşlarıyla gezinme (roving tabindex), 44 px hedefler. */
export function RadioGroup({ value, onValueChange, options, legend, orientation = "vertical", disabled, className }: RadioGroupProps): JSX.Element {
  const auto = safeId(useId());
  const legendId = `r${auto}-legend`;
  return (
    <div className={cx("eg-radio-group", `eg-radio-group--${orientation}`, className)}>
      <p className="eg-field__label" id={legendId}>{legend}</p>
      <RadioPrimitive.Root
        className="eg-radio-group__items"
        value={value}
        onValueChange={onValueChange}
        orientation={orientation}
        aria-labelledby={legendId}
        {...definedProps({ disabled })}
      >
        {options.map((option) => {
          const itemId = `r${auto}-${safeId(option.value)}`;
          return (
            <div key={option.value} className="eg-check">
              <RadioPrimitive.Item className="eg-check__control" id={itemId} value={option.value} {...definedProps({ disabled: option.disabled })}>
                <span className="eg-radio__dot-ring">
                  <RadioPrimitive.Indicator className="eg-radio__dot" />
                </span>
              </RadioPrimitive.Item>
              <label htmlFor={itemId} className="eg-check__label">
                {option.label}
                {option.description !== undefined ? <span className="eg-check__desc">{option.description}</span> : null}
              </label>
            </div>
          );
        })}
      </RadioPrimitive.Root>
    </div>
  );
}

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly id?: string;
  readonly disabled?: boolean;
  /** Yükleniyor/kaydediliyor: `aria-busy` (anahtar devre dışı bırakılmaz, çağıran karar verir). */
  readonly busy?: boolean;
  readonly className?: string;
}

/** Aç/kapa anahtarı (role="switch"): 44 px dokunma alanı, iz 26 px. */
export function Switch({ checked, onCheckedChange, label, description, id, disabled, busy, className }: SwitchProps): JSX.Element {
  const auto = useId();
  const controlId = id ?? `s${safeId(auto)}`;
  const descriptionId = description !== undefined ? `${controlId}-desc` : undefined;
  return (
    <div className={cx("eg-switch", disabled === true && "eg-check--disabled", className)}>
      <label htmlFor={controlId} className="eg-switch__label">
        <span>{label}</span>
        {description !== undefined ? <span className="eg-check__desc" id={descriptionId}>{description}</span> : null}
      </label>
      <SwitchPrimitive.Root
        className="eg-switch__control"
        id={controlId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...definedProps({ disabled, "aria-describedby": descriptionId, "aria-busy": busy === true ? true : undefined })}
      >
        <SwitchPrimitive.Thumb className="eg-switch__thumb" />
      </SwitchPrimitive.Root>
    </div>
  );
}

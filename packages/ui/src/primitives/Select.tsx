import type { JSX } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cx, definedProps } from "./props";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly id?: string;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
}

/** Radix Select boş dizgeyi değer olarak kabul etmez; "Tümü" gibi boş seçenekler bu nöbetçiyle taşınır. */
const EMPTY = "__eg_empty__";
const toInner = (value: string): string => (value === "" ? EMPTY : value);
const toOuter = (value: string): string => (value === EMPTY ? "" : value);

/** Özel stilli açılır liste (Radix): klavye, tür-ara, ekran okuyucu ve dokunmatik uyumlu. */
export function Select({ value, onValueChange, options, placeholder, className, ...aria }: SelectProps): JSX.Element {
  return (
    <SelectPrimitive.Root
      value={toInner(value)}
      onValueChange={(next) => onValueChange(toOuter(next))}
      {...definedProps({ disabled: aria.disabled, required: aria.required, name: aria.name })}
    >
      <SelectPrimitive.Trigger
        className={cx("eg-select", className)}
        {...definedProps({
          id: aria.id,
          "aria-label": aria["aria-label"],
          "aria-describedby": aria["aria-describedby"],
          "aria-invalid": aria["aria-invalid"],
        })}
      >
        <SelectPrimitive.Value {...definedProps({ placeholder })} />
        <SelectPrimitive.Icon className="eg-select__chevron">
          <ChevronDown size={18} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="eg-select__content" position="popper" sideOffset={6} collisionPadding={12}>
          <SelectPrimitive.ScrollUpButton className="eg-select__scroll">
            <ChevronUp size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="eg-select__viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={toInner(option.value)}
                className="eg-select__item"
                {...definedProps({ disabled: option.disabled })}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="eg-select__check">
                  <Check size={16} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="eg-select__scroll">
            <ChevronDown size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

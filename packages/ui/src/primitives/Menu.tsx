import type { JSX, ReactElement, ReactNode } from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cx, definedProps } from "./props";

export type MenuEntry =
  | {
      readonly kind?: "item";
      readonly key: string;
      readonly label: string;
      readonly icon?: ReactNode;
      readonly onSelect: () => void;
      readonly tone?: "danger";
      readonly disabled?: boolean;
    }
  | { readonly kind: "separator"; readonly key: string };

export interface MenuProps {
  /** Tetikleyici tek öğe (ör. avatar düğmesi); `aria-haspopup`/`aria-expanded` otomatik eklenir. */
  readonly trigger: ReactElement;
  readonly items: readonly MenuEntry[];
  /** Menü başında bilgi alanı (ör. kullanıcı adı ve rol). */
  readonly header?: ReactNode;
  readonly align?: "start" | "center" | "end";
  readonly className?: string;
}

/** Açılır menü (Radix): ok tuşları, tür-ara, Esc, odak dönüşü; öğeler 44 px. */
export function Menu({ trigger, items, header, align = "end", className }: MenuProps): JSX.Element {
  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content className={cx("eg-menu", className)} align={align} sideOffset={8} collisionPadding={12}>
          {header !== undefined ? <div className="eg-menu__header">{header}</div> : null}
          {items.map((entry) =>
            entry.kind === "separator" ? (
              <MenuPrimitive.Separator key={entry.key} className="eg-menu__sep" />
            ) : (
              <MenuPrimitive.Item
                key={entry.key}
                className={cx("eg-menu__item", entry.tone === "danger" && "eg-menu__item--danger")}
                onSelect={entry.onSelect}
                {...definedProps({ disabled: entry.disabled })}
              >
                {entry.icon !== undefined ? <span className="eg-menu__icon" aria-hidden="true">{entry.icon}</span> : null}
                <span>{entry.label}</span>
              </MenuPrimitive.Item>
            ),
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

import type { ComponentProps, JSX, ReactNode } from "react";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";
import { cx } from "./props";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ComponentProps<"button"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Etiketten önce çizilen ikon (süsleyici; `aria-hidden`). */
  readonly icon?: ReactNode;
  readonly iconEnd?: ReactNode;
  /** Yükleniyor: düğme devre dışı, `aria-busy` ve dönen gösterge. */
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
}

/** Platform düğmesi: en az 44 px yükseklik, token renkleri, görünür odak halkası. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      {...rest}
      type={type}
      className={cx("eg-btn", `eg-btn--${variant}`, `eg-btn--${size}`, fullWidth && "eg-btn--block", className)}
      disabled={disabled === true || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? <Spinner size={16} /> : icon !== undefined ? <span className="eg-btn__icon" aria-hidden="true">{icon}</span> : null}
      {children !== undefined && children !== null ? <span className="eg-btn__label">{children}</span> : null}
      {iconEnd !== undefined ? <span className="eg-btn__icon" aria-hidden="true">{iconEnd}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children" | "aria-label"> {
  /** Erişilebilir ad (zorunlu); ipucu olarak da gösterilir. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: "ghost" | "secondary" | "primary";
  /** false ise ipucu çizilmez (ör. diyalog kapatma düğmesi). */
  readonly tooltip?: boolean;
}

/** Yalnız ikonlu düğme: 44×44 dokunma hedefi, zorunlu erişilebilir ad. */
export function IconButton({ label, icon, variant = "ghost", tooltip = true, className, type = "button", ...rest }: IconButtonProps): JSX.Element {
  const button = (
    <button {...rest} type={type} aria-label={label} className={cx("eg-icon-btn", `eg-icon-btn--${variant}`, className)}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}

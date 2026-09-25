import { useRef, type JSX, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { t } from "../../i18n/tr";
import { IconButton } from "./Button";
import { cx } from "./props";

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** Alt eylem çubuğu (ör. İptal + Kaydet); mobilde tam genişlik yığılır. */
  readonly footer?: ReactNode;
  readonly size?: "sm" | "md" | "lg";
  /** Varsayılan: t("modal.close"). */
  readonly closeLabel?: string;
  readonly className?: string;
}

/**
 * Kipli diyalog (Radix): odak tuzağı, Esc ile kapanış, odağın tetikleyiciye dönüşü,
 * arka plan kaydırma kilidi ve `aria-modal`. Mobilde alttan açılan sayfa biçimindedir.
 */
/** Diyalog açılırken odaktaki öğe; kontrollü kullanımda Radix tetikleyiciyi bilmez (DOM'suz kök tsc için yapısal). */
function activeElement(): unknown {
  return (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", closeLabel, className }: DialogProps): JSX.Element {
  const opener = useRef<unknown>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="eg-dialog__overlay" />
        <DialogPrimitive.Content
          className={cx("eg-dialog", `eg-dialog--${size}`, className)}
          onOpenAutoFocus={() => {
            opener.current = activeElement();
          }}
          onCloseAutoFocus={(event) => {
            // Odak diyaloğu açan öğeye döner (WCAG 2.4.3); öğe artık yoksa Radix varsayılanı.
            const target = opener.current as { focus?: () => void; isConnected?: boolean } | null;
            if (target?.focus !== undefined && target.isConnected !== false) {
              event.preventDefault();
              target.focus();
            }
          }}
          {...(description === undefined ? { "aria-describedby": undefined } : {})}
        >
          <header className="eg-dialog__head">
            <DialogPrimitive.Title className="eg-dialog__title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label={closeLabel ?? t("modal.close")} icon={<X size={20} />} tooltip={false} />
            </DialogPrimitive.Close>
          </header>
          {description !== undefined ? <DialogPrimitive.Description className="eg-dialog__desc">{description}</DialogPrimitive.Description> : null}
          <div className="eg-dialog__body">{children}</div>
          {footer !== undefined ? <footer className="eg-dialog__foot">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

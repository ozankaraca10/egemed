import { useEffect, useId, useRef, type JSX, type KeyboardEvent, type ReactNode } from "react";
import { t } from "../i18n/tr";

/** DOM lib'siz kök tsc için yapısal odak tipi (Tabs.tsx deseni). */
export interface Focusable {
  focus(): void;
}

/** `querySelectorAll` taşıyan yapısal kapsam; `Element` global'i kullanılmaz. */
interface FocusScope {
  querySelectorAll(selector: string): ArrayLike<Focusable>;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Varsayılan: t("modal.close"). */
  closeLabel?: string;
  className?: string;
}

/** Odaklanabilir öğeler; devre dışı/gizli öğeler ve diyalog kabuğu (`tabindex="-1"`) dışarıda kalır (B2). */
const focusableSelector =
  "a[href], area[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** `[tabindex='-1']` taşıyan programatik odak hedeflerini süzer; `button` gibi
 *  dallar bunları yine de yakalayabildiğinden gerekir. Öznitelik okunamıyorsa
 *  (DOM'suz ya da yapısal bağlam) öğe korunur. */
function isTabbable(node: Focusable): boolean {
  const withAttribute = node as { getAttribute?: (name: string) => string | null };
  return withAttribute.getAttribute?.("tabindex") !== "-1";
}

/** Odağı düğüme taşır; kök typecheck DOM lib'siz derlensin diye yapısal tip. */
function focusNode(node: unknown): void {
  (node as { focus?: () => void } | null)?.focus?.();
}

/** SSR/DOM'suz ortamda güvenli, yapısal etkin öğe okuması. */
function activeElement(): Focusable | null {
  const scope = globalThis as { document?: { activeElement?: Focusable | null } };
  return scope.document?.activeElement ?? null;
}

/**
 * Tab sınırda ise sarılacak hedefi, değilse `null` (tarayıcı varsayılanı)
 * döndürür. Boş liste → `null`; current listede yoksa → Shift ? son : ilk.
 */
export function nextFocusTarget<T>(
  items: readonly T[],
  current: T | null,
  shiftKey: boolean,
): T | null {
  if (items.length === 0) return null;
  const index = current === null ? -1 : items.indexOf(current);
  const outside = index === -1;
  const atEdge = shiftKey ? index === 0 : index === items.length - 1;
  if (!outside && !atEdge) return null;
  return shiftKey ? (items[items.length - 1] ?? null) : (items[0] ?? null);
}

/**
 * Erişilebilir diyalog: `role="dialog"` + `aria-modal`, Escape ile kapanış,
 * Tab/Shift+Tab odak tuzağı ve kapanışta odağı tetikleyiciye geri verme.
 *
 * Gövde kaydırma kilidi bu bileşenin kapsamında DEĞİLDİR; `open` durumuna göre
 * kaydırmayı T08 kabuk tüketicisi yönetmelidir.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  closeLabel,
  className,
}: ModalProps): JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<Focusable | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = activeElement();
    focusNode(dialogRef.current);
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const classes = className === undefined ? "eg-modal" : `eg-modal ${className}`;

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const scope = dialogRef.current as unknown as FocusScope | null;
    const items =
      scope === null
        ? []
        : Array.from(scope.querySelectorAll(focusableSelector)).filter(isTabbable);
    const target = nextFocusTarget(items, activeElement(), event.shiftKey);
    if (target === null) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <div className={classes}>
      <div aria-hidden="true" className="eg-modal__backdrop" onClick={onClose} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="eg-modal__dialog"
        onKeyDown={onDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="eg-modal__header">
          <h2 className="eg-modal__title" id={titleId}>
            {title}
          </h2>
          <button className="eg-modal__close" onClick={onClose} type="button">
            {closeLabel ?? t("modal.close")}
          </button>
        </header>
        <div className="eg-modal__body">{children}</div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { t } from "@egemed/ui/i18n";

/**
 * T120 — birleşik sim barının kompakt hesap menüsü. Sim rotasında geliştirme
 * çipi + rol etiketi + "Çıkış yap" düğmesi yerine tek düğme çizilir: baş
 * harfler ve aşağı ok; menüde görünen ad/rol, sahte oturum notu ve çıkış
 * öğesi. Klavye: Enter/Space açar, Esc kapatıp odağı düğmeye döndürür, ok
 * tuşları öğeler arasında gezer; dışarı tıklama kapatır.
 *
 * Kök tsconfig programı DOM lib'i taşımadığı için (bkz. SimRoute) dokunulan
 * düğüm yüzeyi yapısaldır; gerçek düğümler çalışma zamanında bu sözleşmeleri
 * karşılar.
 */
interface FocusableNode { focus(): void }
interface MenuListNode { querySelectorAll(selector: string): ArrayLike<FocusableNode> }
interface AccountRootNode { contains(target: unknown): boolean }
interface AccountDocument {
  readonly activeElement: unknown;
  addEventListener(type: string, listener: (event: { readonly target: unknown }) => void): void;
  removeEventListener(type: string, listener: (event: { readonly target: unknown }) => void): void;
}

/**
 * Görünen ad ya da rol etiketinden iki harfli baş harfi üretir: iki sözcük
 * varsa ilk harfleri, tek sözcükte ilk iki harfi alır ve tr-TR büyük harf
 * kuralını uygular ("Sahte test öğrencisi" → "ST", "ışık" → "IŞ").
 */
export function accountInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  const head = words[0] ?? "";
  const initials =
    words.length > 1
      ? `${head.slice(0, 1)}${(words[1] ?? "").slice(0, 1)}`
      : head.slice(0, 2);
  return initials === "" ? "?" : initials.toLocaleUpperCase("tr-TR");
}

export interface AccountMenuProps {
  /** Menüde ve baş harflerde gösterilen ad; sahte oturumda rol etiketidir. */
  readonly displayName: string;
  /** "Geliştirme oturumu" notu yalnız sahte (sentetik) oturumda çizilir. */
  readonly synthetic: boolean;
  readonly onLogout?: (() => void) | undefined;
}

/** Menü adı ile başlık ilişkisi; sayfada tek hesap menüsü vardır. */
const NAME_ID = "eg-shell-account-name";

export function AccountMenu({ displayName, synthetic, onLogout }: AccountMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<AccountRootNode | null>(null);
  const buttonRef = useRef<FocusableNode | null>(null);
  const menuRef = useRef<MenuListNode | null>(null);

  // Dışarı tıklama menüyü kapatır; dinleyici yalnız açıkken bağlanır.
  useEffect(() => {
    if (!open) return undefined;
    const doc = (globalThis as { document?: AccountDocument }).document;
    const root = rootRef.current;
    if (doc === undefined || root === null) return undefined;
    const closeOnOutside = (event: { readonly target: unknown }): void => {
      if (event.target !== null && !root.contains(event.target)) setOpen(false);
    };
    doc.addEventListener("pointerdown", closeOnOutside);
    return () => doc.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  // Açılışta odak ilk menü öğesine taşınır; ok tuşları öğeler arasında gezer.
  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    menu?.querySelectorAll('[role="menuitem"]')[0]?.focus();
    return undefined;
  }, [open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!open) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (items === undefined || items.length === 0) return;
    event.preventDefault();
    const active = (globalThis as { document?: AccountDocument }).document?.activeElement;
    let current = -1;
    for (let index = 0; index < items.length; index += 1) {
      if (items[index] === active) current = index;
    }
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = current === -1 ? (delta === 1 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      className="eg-shell-account"
      onKeyDown={handleKeyDown}
      ref={(node: unknown) => { rootRef.current = node as AccountRootNode | null; }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t("shell.account.label")}: ${displayName}`}
        className="eg-shell-account__button"
        onClick={() => setOpen((value) => !value)}
        ref={(node: unknown) => { buttonRef.current = node as FocusableNode | null; }}
        type="button"
      >
        <span aria-hidden="true" className="eg-shell-account__initials">{accountInitials(displayName)}</span>
        <svg
          aria-hidden="true"
          className="eg-shell-account__chev"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="eg-shell-account__panel" hidden={!open}>
        <p className="eg-shell-account__name" id={NAME_ID}>{displayName}</p>
        {synthetic && <p className="eg-shell-account__note">{t("shell.session.devChip")}</p>}
        <div
          aria-labelledby={NAME_ID}
          className="eg-shell-account__menu"
          ref={(node: unknown) => { menuRef.current = node as MenuListNode | null; }}
          role="menu"
        >
          <button
            className="eg-shell-account__item"
            onClick={() => { setOpen(false); onLogout?.(); }}
            role="menuitem"
            type="button"
          >
            {t("shell.session.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}

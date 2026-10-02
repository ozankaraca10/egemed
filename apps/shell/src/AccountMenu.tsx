import type { JSX } from "react";
import { Menu, icons, type MenuEntry } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";

/**
 * Hesap menüsü (T120 → T152): tüm sayfalarda tek hesap düğmesi. Baş harf dairesi (masaüstünde
 * ad ve rol de) ve aşağı ok; menüde ad/rol, sahte oturum notu, admin için "Yönetim paneli"
 * ve "Çıkış yap". Davranış Radix DropdownMenu'dur (@egemed/ui `Menu`): Enter/Space/↓ açar,
 * ok tuşları ve tür-ara gezinir, Esc kapatıp odağı düğmeye döndürür, dışarı tıklama kapatır.
 */

/**
 * Görünen ad ya da rol etiketinden iki harfli baş harfi üretir: iki sözcük
 * varsa ilk harfleri, tek sözcükte ilk iki harfi alır ve tr-TR büyük harf
 * kuralını uygular ("Sahte test öğrencisi" → "ST", "ışık" → "IŞ").
 */
function accountInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  const head = words[0] ?? "";
  const initials =
    words.length > 1
      ? `${head.slice(0, 1)}${(words[1] ?? "").slice(0, 1)}`
      : head.slice(0, 2);
  return initials === "" ? "?" : initials.toLocaleUpperCase("tr-TR");
}

interface AccountMenuProps {
  /** Menüde ve baş harflerde gösterilen ad; sahte oturumda rol etiketidir. */
  readonly displayName: string;
  /** Ad altında gösterilen rol ("Öğrenci" / "Yönetici"); sahte oturumda ad zaten rol olduğundan boş. */
  readonly roleLabel?: string | undefined;
  /** "Geliştirme oturumu" notu yalnız sahte (sentetik) oturumda çizilir. */
  readonly synthetic: boolean;
  /** Admin oturumunda "Yönetim paneli" bağlantısı. */
  readonly adminHref?: `#${string}` | null | undefined;
  readonly onLogout?: (() => void) | undefined;
}

/** Hash gezinmesi; kök tsc DOM'suz olduğundan yapısal erişim. */
function navigate(href: `#${string}`): void {
  const scope = globalThis as { location?: { hash: string } };
  if (scope.location !== undefined) scope.location.hash = href;
}

export function AccountMenu({ displayName, roleLabel, synthetic, adminHref, onLogout }: AccountMenuProps): JSX.Element {
  const initials = accountInitials(displayName);
  const items: MenuEntry[] = [];
  if (adminHref !== undefined && adminHref !== null) {
    items.push(
      { key: "admin", label: t("shell.account.admin"), icon: <icons.ShieldCheck />, onSelect: () => navigate(adminHref) },
      { kind: "separator", key: "sep" },
    );
  }
  items.push({ key: "logout", label: t("shell.session.logout"), icon: <icons.LogOut />, tone: "danger", onSelect: () => onLogout?.() });
  return (
    <div className="eg-shell-account">
      <Menu
        className="eg-shell-account__menu"
        trigger={
          <button aria-label={`${t("shell.account.label")}: ${displayName}`} className="eg-shell-account__button" type="button">
            <span aria-hidden="true" className="eg-shell-account__initials">{initials}</span>
            <span aria-hidden="true" className="eg-shell-account__who">
              <span className="eg-shell-account__whoName">{displayName}</span>
              {roleLabel !== undefined && roleLabel !== "" && <span className="eg-shell-account__whoRole">{roleLabel}</span>}
            </span>
            <icons.ChevronDown aria-hidden="true" className="eg-shell-account__chev" />
          </button>
        }
        header={
          <div className="eg-shell-account__head">
            <span aria-hidden="true" className="eg-shell-account__initials eg-shell-account__initials--lg">{initials}</span>
            <div className="eg-shell-account__headText">
              <p className="eg-shell-account__name">{displayName}</p>
              {roleLabel !== undefined && roleLabel !== "" && <p className="eg-shell-account__role">{roleLabel}</p>}
              {synthetic && <p className="eg-shell-account__note">{t("shell.session.devChip")}</p>}
            </div>
          </div>
        }
        items={items}
      />
    </div>
  );
}

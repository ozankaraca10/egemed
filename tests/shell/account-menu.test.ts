import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountInitials } from "../../apps/shell/src/AccountMenu";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { resolveRoute, simHref } from "../../apps/shell/src/routes";
import { shellSessionFromDev, type ShellSession } from "../../apps/shell/src/session";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const STUDENT = { actorId: "dev-student-0001", role: "student" } as const;
const API_ADMIN: ShellSession = {
  actorId: "api-admin-0001",
  displayName: "Geliştirme Yöneticisi",
  role: "admin",
  simAccess: null,
};

function renderLayout(hash: string, session: ShellSession | null): string {
  return renderToStaticMarkup(
    createElement(ShellLayout, { children: null, route: resolveRoute(hash), session }),
  );
}

describe("accountInitials", () => {
  it("iki sözcükte ilk harfleri, tek sözcükte ilk iki harfi tr-TR büyük harfle verir", () => {
    expect(accountInitials("Sahte test öğrencisi")).toBe("ST");
    expect(accountInitials("Geliştirme Yöneticisi")).toBe("GY");
    expect(accountInitials("öğrenci")).toBe("ÖĞ");
    expect(accountInitials("ışık")).toBe("IŞ");
    expect(accountInitials("admin")).toBe("AD");
    expect(accountInitials("   ")).toBe("?");
  });
});

describe("kompakt hesap menüsü (T120)", () => {
  it("sim rotasında baş harf düğmesini ve menü öğelerini çizer; çip/rol/çıkış bloğu kalkar", () => {
    const html = renderLayout(simHref("ausculta"), shellSessionFromDev(STUDENT));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`aria-label="${t("shell.account.label")}: ${t("shell.session.student")}"`);
    expect(html).toContain('class="eg-shell-account__initials">ST<');
    expect(html).toMatch(/<div class="eg-shell-account__panel"[^>]*hidden=""/);
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain(t("shell.session.logout"));
    expect(html).toContain(t("shell.session.devChip"));
    expect(html).not.toContain("eg-shell-session__role");
    expect(html).not.toContain("eg-shell-session__logout");
    expect(html).not.toContain("eg-shell-session__dev");
  });

  it("API oturumunda görünen adı baş harfe çevirir, geliştirme notunu çizmez", () => {
    const html = renderLayout(simHref("pulse"), API_ADMIN);
    expect(html).toContain('class="eg-shell-account__initials">GY<');
    expect(html).toContain("Geliştirme Yöneticisi");
    expect(html).not.toContain(t("shell.session.devChip"));
    expect(html).not.toContain(t("shell.session.admin"));
  });

  it("oturum yokken hesap düğmesi çizilmez", () => {
    expect(renderLayout(simHref("ausculta"), null)).not.toContain("eg-shell-account");
  });

  it("sim dışı sayfalar mevcut rol etiketi ve çıkış düğmesini korur", () => {
    const html = renderLayout("#/", shellSessionFromDev(STUDENT));
    expect(html).toContain('class="eg-shell-session__role"');
    expect(html).toContain(t("shell.session.student"));
    expect(html).toContain('class="eg-shell-session__logout"');
    expect(html).toContain('class="eg-shell-nav"');
    expect(html).not.toContain("eg-shell-account");
  });
});

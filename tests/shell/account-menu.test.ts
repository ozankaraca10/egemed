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

describe("hesap menüsü (T120 → T152)", () => {
  // Menü içeriği Radix ile yalnız açıkken çizilir (statik render'da yok); öğeler, not ve klavye
  // davranışı e2e/sims.spec.ts ve e2e/app-frame.spec.ts'te doğrulanır.
  it("sim rotasında baş harfli tek hesap düğmesi çizer; çip/rol/çıkış bloğu yoktur", () => {
    const html = renderLayout(simHref("ausculta"), shellSessionFromDev(STUDENT));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`aria-label="${t("shell.account.label")}: ${t("shell.session.student")}"`);
    expect(html).toContain('class="eg-shell-account__initials">ST<');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("eg-shell-session__role");
    expect(html).not.toContain("eg-shell-session__logout");
  });

  it("API oturumunda görünen adı baş harfe çevirir; ad ve rol düğmede yer alır", () => {
    const html = renderLayout(simHref("pulse"), API_ADMIN);
    expect(html).toContain('class="eg-shell-account__initials">GY<');
    expect(html).toContain("Geliştirme Yöneticisi");
    expect(html).toContain(t("shell.account.role.admin"));
    expect(html).not.toContain(t("shell.session.admin"));
  });

  it("oturum yokken hesap düğmesi çizilmez", () => {
    expect(renderLayout(simHref("ausculta"), null)).not.toContain("eg-shell-account");
    expect(renderLayout("#/", null)).not.toContain("eg-shell-account");
  });

  it("sim dışı sayfalarda da rol çipi + ayrı çıkış düğmesi yerine hesap menüsü ve ana gezinme vardır (T152)", () => {
    const html = renderLayout("#/", shellSessionFromDev(STUDENT));
    expect(html).toContain('class="eg-shell-account__button"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('class="eg-shell-nav"');
    expect(html).not.toContain("eg-shell-session__role");
    expect(html).not.toContain("eg-shell-session__logout");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntryPage, submitEntryPreview } from "../../apps/shell/src/EntryPage";
import { ENTRY_PATHS, entryHref, resolveRoute, ROUTES } from "../../apps/shell/src/routes";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

describe("giriş rotaları", () => {
  it("yönetici ve test öğrencisi yollarını mevcut dört kabuk rotasından ayrı çözer", () => {
    expect(resolveRoute(entryHref("admin"))).toEqual({
      kind: "entry",
      role: "admin",
      titleKey: "entry.admin.title",
    });
    expect(resolveRoute(entryHref("student"))).toEqual({
      kind: "entry",
      role: "student",
      titleKey: "entry.student.title",
    });
    expect(ENTRY_PATHS).toEqual({ admin: "/giris/admin", student: "/giris/test-ogrenci" });
    expect(ROUTES).toHaveLength(4);
  });

  it.each(["admin", "student"] as const)("%s ekranı erişilebilir form işaretlemesi üretir", (role) => {
    const html = renderToStaticMarkup(createElement(EntryPage, { role }));
    const titleKey = role === "admin" ? "entry.admin.title" : "entry.student.title";
    expect(html).toContain(`<h1 class="eg-shell-entry__title">${t(titleKey)}</h1>`);
    if (role === "admin") expect(html).toMatch(/<a aria-current="page" href="#\/giris\/admin">/);
    if (role === "student") {
      expect(html).toMatch(/<a aria-current="page" href="#\/giris\/test-ogrenci">/);
      expect(html).toContain(t("entry.session.synthetic"));
    } else {
      expect(html).not.toContain(t("entry.session.synthetic"));
    }
    expect(html).toContain('src="/brand/ege-tip-logo.png"');
    expect(html).toContain('href="#icerik"');
    const warningIndex = html.indexOf(t("entry.auth.pending"));
    expect(warningIndex).toBeGreaterThan(-1);
    expect(warningIndex).toBeLessThan(html.indexOf('class="eg-shell-entry__form"'));
    expect(html).not.toContain('autoComplete="username"');
    expect(html).not.toContain("current-password");
    expect(html).toMatch(/<input[^>]*autoComplete="off"[^>]*id="entry-username"[^>]*required/);
    expect(html).toContain('for="entry-username"');
    expect(html).toMatch(/<input[^>]*autoComplete="off"[^>]*id="entry-password"[^>]*required/);
    expect(html).toContain('for="entry-password"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('role="alert"');
  });

  it("önizleme gönderimini iptal eder ve yalnız bekleyen durum bildiricisini tetikler", () => {
    let prevented = 0;
    let notified = 0;
    submitEntryPreview(
      { preventDefault: () => { prevented += 1; } },
      () => { notified += 1; },
    );
    expect(prevented).toBe(1);
    expect(notified).toBe(1);
  });
});

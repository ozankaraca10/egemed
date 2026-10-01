import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntryPage, submitEntryPreview } from "../../apps/shell/src/EntryPage";
import { SIM_ICONS, SIM_IDS } from "../../apps/shell/src/SimCard";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

describe("giriş rotaları", () => {

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
    // T304: sol panelde yalnız EGEMED logosu; fakülte mührü sağ alttaki alt bilgide
    expect(html).not.toContain('class="eg-shell-entry__logo"');
    expect(html).toContain(`aria-label="${t("shell.brand.full")}"`);
    expect(html).toContain('class="eg-shell-logo eg-shell-logo--on-dark"');
    expect(html).not.toContain("CLIX");
    expect(html).toContain('href="#icerik"');
    const warningIndex = html.indexOf(t("entry.auth.pending"));
    expect(warningIndex).toBeGreaterThan(-1);
    expect(warningIndex).toBeLessThan(html.indexOf('class="eg-shell-entry__form"'));
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toMatch(/<input[^>]*id="entry-username"[^>]*required[^>]*autoComplete="username"/);
    expect(html).toContain('for="entry-username"');
    expect(html).toMatch(/<input[^>]*id="entry-password"[^>]*required[^>]*autoComplete="current-password"/);
    expect(html).toContain('for="entry-password"');
    expect(html).toContain(`aria-label="${t("entry.field.password.show")}"`);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('role="alert"');
  });

  it("sol panelde üç beyaz sim ikonunu dekoratif olarak, adlarını görünür metinle gösterir", () => {
    const html = renderToStaticMarkup(createElement(EntryPage, { role: "student" }));
    expect(html).toContain('class="eg-shell-entry__sims"');
    for (const id of SIM_IDS) {
      const icon = SIM_ICONS[id];
      const tag = html.match(new RegExp(`<img[^>]*src="${icon.src}"[^>]*>`))?.[0] ?? "";
      expect(tag, id).toContain('alt=""');
      expect(tag, id).toContain(`width="${icon.width}"`);
      expect(tag, id).toContain(`height="${icon.height}"`);
    }
    for (const id of SIM_IDS) expect(html).toContain(`<span class="eg-shell-entry__simname">${t(`sims.${id}.name`)}</span>`);
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

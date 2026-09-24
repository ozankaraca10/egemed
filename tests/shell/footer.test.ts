import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntryPage } from "../../apps/shell/src/EntryPage";
import { resolveRoute } from "../../apps/shell/src/routes";
import { ShellFooter } from "../../apps/shell/src/ShellFooter";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const FOOTER_LABEL = `aria-label="${t("footer.nav.label")}"`;

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe("ShellFooter", () => {
  it("amblem, kurum ve telif satırını tek footer içinde ortalı çizer", () => {
    const html = renderToStaticMarkup(createElement(ShellFooter));
    expect(html).toContain("<footer");
    expect(html).toContain(FOOTER_LABEL);
    expect(html).toContain(t("footer.institution"));
    expect(html).toContain(t("footer.rights"));
    expect(html).toMatch(/<img[^>]*alt=""[^>]*src="\/brand\/ege-tip-logo\.png"[^>]*>/);
    expect(html).toContain('class="eg-shell-footer"');
    expect(html).not.toContain("eg-shell-footer--small");
  });

  it("giriş ekranı varyantı küçük sınıfını ekler", () => {
    const html = renderToStaticMarkup(createElement(ShellFooter, { small: true }));
    expect(html).toContain("eg-shell-footer--small");
    expect(html).toContain(FOOTER_LABEL);
  });

  it("kabuk sayfalarında bir kez, ana içerikten sonra görünür", () => {
    const html = renderToStaticMarkup(
      createElement(ShellLayout, { children: null, route: resolveRoute("#/") }),
    );
    expect(count(html, FOOTER_LABEL)).toBe(1);
    expect(html.indexOf('id="icerik"')).toBeLessThan(html.indexOf(FOOTER_LABEL));
    expect(html).toContain(t("footer.institution"));
  });

  it("giriş ekranında sağ panelin altında küçük varyantla görünür", () => {
    for (const role of ["admin", "student"] as const) {
      const html = renderToStaticMarkup(createElement(EntryPage, { role }));
      expect(count(html, FOOTER_LABEL), role).toBe(1);
      expect(html, role).toContain("eg-shell-footer--small");
      expect(html.indexOf('class="eg-shell-entry__panel"')).toBeLessThan(
        html.indexOf("eg-shell-footer--small"),
      );
    }
  });
});

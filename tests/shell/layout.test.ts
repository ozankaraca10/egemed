import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { NotFoundPage, pageFor } from "../../apps/shell/src/pages";
import { ROUTES, SIM_PATHS, resolveRoute, routeHref } from "../../apps/shell/src/routes";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

function renderRoute(hash: string): string {
  const route = resolveRoute(hash);
  const page: ReactNode = route.kind === "page" ? pageFor(route.route.id) : createElement(NotFoundPage);
  return renderToStaticMarkup(createElement(ShellLayout, { route, children: page }));
}

describe("ShellLayout işaretlemesi", () => {
  it("gezinme, atlama bağlantısı ve odaklanabilir ana bölge kurulur", () => {
    const html = renderRoute("#/");
    expect(html).toContain(`aria-label="${t("shell.nav.label")}"`);
    expect((html.match(/class="eg-shell-nav__link"/g) ?? []).length).toBe(ROUTES.length);
    expect(html).toContain('href="#icerik"');
    expect(html).toContain(t("shell.skip"));
    expect(html).toMatch(/<main[^>]*id="icerik"[^>]*tabindex="-1"/);
  });
  it('yalnız etkin bağlantı aria-current="page" taşır', () => {
    for (const route of ROUTES) {
      const html = renderRoute(routeHref(route.id));
      const active = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
      expect(active.length, route.id).toBe(1);
      expect(active[0] ?? "", route.id).toContain(`href="${routeHref(route.id)}"`);
    }
    expect(renderRoute("#/yok")).not.toContain('aria-current="page"');
  });
  it("Simülatörler sayfası üç kart gösterir, iframe kurmaz, yolları metin verir", () => {
    const html = renderRoute("#/simulatorler");
    expect((html.match(/class="eg-card"/g) ?? []).length).toBe(3);
    expect(html).not.toContain("<iframe");
    expect(html).toContain(t("shell.soon"));
    for (const path of Object.values(SIM_PATHS)) expect(html).toContain(path);
  });
});

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellLayout, focusMain } from "../../apps/shell/src/ShellLayout";
import { NotFoundPage, pageFor } from "../../apps/shell/src/pages";
import { ROUTES, resolveRoute, routeHref } from "../../apps/shell/src/routes";
import { SIM_IDS, SIM_LOGOS } from "../../apps/shell/src/SimCard";
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
    expect(html).toContain('class="eg-shell-footer"');
    expect(html).toContain(t("footer.institution"));
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
  it("Simülatörler sayfası üç kart gösterir, iframe kurmaz, logo ölçülerini verir", () => {
    const html = renderRoute("#/simulatorler");
    expect((html.match(/class="eg-card"/g) ?? []).length).toBe(3);
    expect(html).not.toContain("<iframe");
    expect(html).toContain(t("sims.soon"));
    for (const id of SIM_IDS) {
      expect(html, id).toContain(t(`sims.${id}.name`));
      expect(html, id).toContain(t(`sims.${id}.tagline`));
      const logo = SIM_LOGOS[id];
      const tag = html.match(new RegExp(`<img[^>]*src="${logo.src}"[^>]*>`))?.[0] ?? "";
      expect(tag, id).toContain('alt=""');
      expect(tag, id).toContain(`width="${logo.width}"`);
      expect(tag, id).toContain(`height="${logo.height}"`);
    }
  });
  it("üst bar marka bloğu işlenir", () => {
    const html = renderRoute("#/");
    expect(html).toContain(t("shell.brand.eyebrow"));
    expect(html).toContain(t("shell.brand.name"));
    expect(html).toContain(t("shell.brand.tagline"));
  });
  it("atlama bağlantısı hash gezinmesini iptal eden işleyiciye bağlıdır", () => {
    // Statik HTML olay işleyicisi taşımaz; `ShellLayout` bilinçli olarak hook'suz
    // ve DOM'suz olduğu için doğrudan çağrılıp işaretleme ağacı denetlenir.
    const tree = ShellLayout({ children: null, route: resolveRoute("#/") });
    const children = tree.props.children as { props: { className?: string; href?: string; onClick?: unknown } }[];
    const skip = children.find((child) => child.props.className === "eg-shell-skip");
    expect(skip?.props.href).toBe("#icerik");
    expect(skip?.props.onClick).toBe(focusMain);
    let prevented = 0;
    const event = { preventDefault: (): void => { prevented += 1; } };
    expect(() => focusMain(event)).not.toThrow();
    expect(prevented).toBe(1);
  });
  it("'#icerik' hash'i rota değildir; atlama bağlantısı bu yüzden tıklamayı iptal eder (B1)", () => {
    expect(resolveRoute("#icerik")).toEqual({ kind: "notFound", path: "icerik" });
    expect(renderRoute("#/")).toContain('href="#icerik"');
  });
  it("her rotada ve bulunamadı sayfasında tek h1 bulunur", () => {
    for (const route of ROUTES) {
      const html = renderRoute(routeHref(route.id));
      expect((html.match(/<h1\b/g) ?? []).length, route.id).toBe(1);
    }
    expect((renderRoute("#/yok").match(/<h1\b/g) ?? []).length).toBe(1);
  });
});

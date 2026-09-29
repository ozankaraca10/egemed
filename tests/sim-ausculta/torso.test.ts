import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chestpiece, TorsoPediatricBack, TorsoPediatricFront } from "../../packages/sim-ausculta/src/index";

/** Stetoskop ve pediatrik gövde — statik işaretleme, DOM ortamı yok. */

function markup(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

describe("stetoskop göğüs parçası", () => {
  it("tüp taşımaz, zil/diyafram kasasını ve taktik çizgileri korur", () => {
    const html = markup(createElement(Chestpiece));

    expect(html).toContain('viewBox="0 0 100 100"');
    expect(html).not.toContain("<path");
    expect(html.match(/<line /g)?.length).toBe(12);
  });

  it("işaretleme üretici adı taşımaz", () => {
    const first = markup(createElement(Chestpiece));
    expect(first.toLowerCase()).not.toMatch(/littmann|3m|littman/);
  });
});

describe("pediatrik gövde", () => {
  it("ön görünüm şematik gövde, yüz ve fotoğraf taşımaz", () => {
    const html = markup(createElement(TorsoPediatricFront));
    expect(html).toContain('class="torso"');
    expect(html).toContain('viewBox="0 0 1000 900"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Pediatrik hasta ön görünüm (erkek çocuk, tıbbi illüstrasyon)"');
    expect(html).toContain('id="s-clip"');
    expect(html).not.toMatch(/<img|yüz|fotoğraf/i);
  });

  it("arka görünüm omurga hattını ve ayrı kırpma kimliğini taşır", () => {
    const html = markup(createElement(TorsoPediatricBack));
    expect(html).toContain('aria-label="Pediatrik hasta arka görünüm (erkek çocuk, tıbbi illüstrasyon)"');
    expect(html).toContain('id="t-clip"');
    expect(html).toContain("M500 178 V 750");
    expect(html.match(/<path /g)?.length).toBeGreaterThan(8);
  });

  it("ön ve arka işaretleme birbirinden ayrı ve tekrarlanabilir", () => {
    const front = markup(createElement(TorsoPediatricFront));
    const back = markup(createElement(TorsoPediatricBack));
    expect(front).not.toBe(back);
    expect(markup(createElement(TorsoPediatricFront))).toBe(front);
    expect(markup(createElement(TorsoPediatricBack))).toBe(back);
    expect(front).not.toContain('id="t-clip"');
    expect(back).not.toContain('id="s-clip"');
  });
});

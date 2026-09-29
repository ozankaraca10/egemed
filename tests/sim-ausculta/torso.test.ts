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
});

describe("pediatrik gövde", () => {

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

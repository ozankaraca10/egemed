import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconChart, IconClose, IconEcg, IconInfo, IconLogo, IconPlay } from "../../packages/sim-ausculta/src/index";
import * as icons from "../../packages/sim-ausculta/src/ui/icons";

/** İkonlar ve öğretici adımlar — statik işaretleme, DOM kütüphanesi yok. */

describe("Ausculta ikonları", () => {
  it("her ikon dekoratif svg çizer", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      if (typeof Icon !== "function") continue;
      const html = name === "IconChart" ? renderToStaticMarkup(createElement(IconChart)) : renderToStaticMarkup(createElement(Icon, {}));
      expect(html, name).toContain("<svg");
      expect(html, name).toContain('aria-hidden="true"');
      expect(html, name).toContain('focusable="false"');
    }
  });

  it("çağıran aria-hidden değerini ezer; oynat dolgulu, logo ve ekg ayrı görünüm kutusu kullanır", () => {
    expect(renderToStaticMarkup(createElement(IconInfo, { "aria-hidden": false }))).toContain('aria-hidden="false"');
    expect(renderToStaticMarkup(createElement(IconPlay))).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(createElement(IconClose))).toContain('d="M6 6l12 12"');
    expect(renderToStaticMarkup(createElement(IconLogo))).toContain('viewBox="0 0 40 40"');
    expect(renderToStaticMarkup(createElement(IconEcg))).toContain('viewBox="0 0 340 90"');
  });
});

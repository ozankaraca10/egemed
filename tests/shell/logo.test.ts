import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { EgemedLogo } from "../../apps/shell/src/brand/EgemedLogo";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const PUBLIC = resolve("apps/shell/public");
const isFile = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };
const srcOf = (html: string) => /src="([^"]+)"/.exec(html)?.[1] ?? "";

describe("EGEMED logo", () => {
  it.each([
    ["on-dark", false, "/brand/egemed-horizontal-white.png"],
    ["on-dark", true, "/brand/egemed-icon-white.png"],
    ["on-light", false, "/brand/egemed-horizontal.png"],
    ["on-light", true, "/brand/egemed-icon.png"],
  ] as const)("%s (kompakt: %s) zemine uygun kurumsal logo dosyasını tek erişilebilir adla çizer", (variant, compact, file) => {
    const html = renderToStaticMarkup(createElement(EgemedLogo, { variant, compact }));
    expect(html).toContain(`aria-label="${t("shell.brand.full")}"`);
    expect(srcOf(html)).toBe(file);
    expect(isFile(PUBLIC + file)).toBe(true);
    expect(html.includes(`class="eg-shell-logo__tagline"`)).toBe(!compact);
  });

  it("sekme ve ana ekran simgeleri public altında bulunur", () => {
    for (const f of ["favicon-32.png", "favicon-192.png", "apple-touch-icon.png"]) expect(isFile(`${PUBLIC}/${f}`)).toBe(true);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EgemedLogo } from "../../apps/shell/src/brand/EgemedLogo";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

describe("EGEMED logo", () => {
  it.each(["on-dark", "on-light"] as const)("%s varyantı tek erişilebilir adla SVG işareti ve marka metni çizer", (variant) => {
    const html = renderToStaticMarkup(createElement(EgemedLogo, { variant }));
    expect(html).toContain(`aria-label="${t("shell.brand.full")}"`);
    expect(html).toContain(`class="eg-shell-logo eg-shell-logo--${variant}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<svg");
    expect(html).toContain("EGEMED");
    expect(html).toContain(t("shell.brand.tagline"));
  });

  it("kompakt varyantta yalnız işaret ve EGEMED adı kalır", () => {
    const html = renderToStaticMarkup(createElement(EgemedLogo, { compact: true, variant: "on-dark" }));
    expect(html).toContain('class="eg-shell-logo eg-shell-logo--on-dark eg-shell-logo--compact"');
    expect(html).not.toContain('class="eg-shell-logo__tagline"');
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tr } from "../../packages/ui/i18n/tr";
import { Badge } from "../../packages/ui/src/Badge";
import { describe, expect, it } from "vitest";

/** Önek taşıyan tonlar ve sözlükteki karşılıkları. */
const toned = [
  { tone: "info", key: "badge.tone.info" },
  { tone: "success", key: "badge.tone.success" },
  { tone: "warning", key: "badge.tone.warning" },
  { tone: "danger", key: "badge.tone.danger" },
] as const;

describe("Badge", () => {
  it("her ton data-tone ve sözlükten gelen gizli öneki taşır", () => {
    for (const { tone, key } of toned) {
      const html = renderToStaticMarkup(createElement(Badge, { tone, children: "Durum" }));
      expect(html, tone).toContain(`data-tone="${tone}"`);
      expect(html, tone).toContain(`${tr[key]}: `);
    }
  });

  it("neutral ton önek taşımaz", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tone: "neutral", children: "Durum" }));
    expect(html).toContain('data-tone="neutral"');
    for (const { key } of toned) {
      expect(html, key).not.toContain(`${tr[key]}: `);
    }
  });

  it("dekoratif şekil aria-hidden ile gizlenir", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tone: "info", children: "Durum" }));
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>/);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "../../packages/ui/src/Card";
import { describe, expect, it } from "vitest";

/** Başlık `id` değerini ve `aria-labelledby` değerini işaretlemeden okur. */
function readHeadingLinks(html: string): { id: string | undefined; labelledBy: string | undefined } {
  return {
    id: /<h[234][^>]*\bid="([^"]+)"/.exec(html)?.[1],
    labelledBy: /aria-labelledby="([^"]+)"/.exec(html)?.[1],
  };
}

describe("Card", () => {
  it("başlık verilince aria-labelledby başlığın id'sine eşittir", () => {
    const html = renderToStaticMarkup(
      createElement(Card, { title: "Hasta özeti", children: "İçerik" }),
    );
    const { id, labelledBy } = readHeadingLinks(html);
    expect(id).toBeDefined();
    expect(labelledBy).toBe(id);
  });

  it("başlık yoksa aria-labelledby taşımaz", () => {
    const html = renderToStaticMarkup(createElement(Card, { children: "Yalnız içerik" }));
    expect(html).not.toContain("aria-labelledby");
    expect(html).not.toContain("<h2");
  });
});

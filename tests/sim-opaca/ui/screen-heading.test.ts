import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import { ScreenHeading, SectionHeading } from "../../../packages/sim-opaca/src/ui/ScreenHeading";

function renderHeading(
  node: ReturnType<typeof createElement>,
  embedded = false,
): string {
  const wrapped = embedded
    ? createElement(EmbeddedProvider, { embedded: true, children: node })
    : node;
  return renderToStaticMarkup(wrapped);
}

describe("ScreenHeading", () => {
  it("bağımsız modda h1 çizer", () => {
    const html = renderHeading(
      createElement(ScreenHeading, { className: "mode-title", children: "Çalışma modunu seçin" }),
    );
    expect(html).toMatch(/^<h1\b[^>]*class="mode-title"[^>]*>/);
    expect(html).toContain("Çalışma modunu seçin");
  });

  it("id özniteliğini korur", () => {
    const html = renderHeading(
      createElement(ScreenHeading, { id: "main-h", className: "src-title", children: "Başlık" }),
      true,
    );
    expect(html).toContain('id="main-h"');
    expect(html).toContain("<h2");
  });
});

describe("SectionHeading", () => {
  it("bağımsız modda h2 çizer", () => {
    const html = renderHeading(
      createElement(SectionHeading, { id: "credits-h", children: "Geliştiriciler" }),
    );
    expect(html).toMatch(/^<h2\b[^>]*id="credits-h"[^>]*>/);
    expect(html).toContain("Geliştiriciler");
  });

  it("gömülü modda h3 çizer", () => {
    const html = renderHeading(
      createElement(SectionHeading, { id: "credits-h", children: "Geliştiriciler" }),
      true,
    );
    expect(html).toMatch(/^<h3\b[^>]*id="credits-h"[^>]*>/);
    expect(html).toContain("Geliştiriciler");
  });
});

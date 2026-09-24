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
    expect(html).toBe('<h1 class="mode-title">Çalışma modunu seçin</h1>');
  });

  it("gömülü modda h2 çizer (aynı sınıf)", () => {
    const html = renderHeading(
      createElement(ScreenHeading, { className: "mode-title", children: "Çalışma modunu seçin" }),
      true,
    );
    expect(html).toBe('<h2 class="mode-title">Çalışma modunu seçin</h2>');
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
    expect(html).toBe('<h2 id="credits-h">Geliştiriciler</h2>');
  });

  it("gömülü modda h3 çizer", () => {
    const html = renderHeading(
      createElement(SectionHeading, { id: "credits-h", children: "Geliştiriciler" }),
      true,
    );
    expect(html).toBe('<h3 id="credits-h">Geliştiriciler</h3>');
  });
});

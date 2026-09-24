import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, type BadgeTone } from "../../packages/ui/src/Badge";
import { describe, expect, it } from "vitest";

/** Önek taşıyan tonlar ve sözlükteki karşılıkları. */
const toned = [
  { tone: "info", key: "badge.tone.info" },
  { tone: "success", key: "badge.tone.success" },
  { tone: "warning", key: "badge.tone.warning" },
  { tone: "danger", key: "badge.tone.danger" },
] as const;

const allTones = ["neutral", "info", "success", "warning", "danger"] as const;

const componentsCss = ts.sys.readFile("packages/ui/styles/components.css") ?? "";

/** Belirtilen tonun işaret (nokta) kural gövdesini sadeleştirerek döndürür. */
function dotRule(tone: BadgeTone): string {
  const pattern = new RegExp(
    `\\.eg-badge\\[data-tone="${tone}"\\]\\s+\\.eg-badge__dot\\s*\\{([^}]*)\\}`,
  );
  return (pattern.exec(componentsCss)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/** Kural gövdesinden şekil imzasını çıkarır (daire/kare/üçgen/elmas). */
function shapeOf(rule: string): string {
  if (rule.includes("clip-path: polygon(")) return "triangle";
  if (rule.includes("transform: rotate(45deg)")) return "diamond";
  if (/border-radius:\s*var\(--r-pill\)/.test(rule)) return "circle";
  if (/border-radius:\s*0\b/.test(rule)) return "square";
  return "unknown";
}

describe("Badge", () => {
  it("dekoratif şekil aria-hidden ile gizlenir", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tone: "info", children: "Durum" }));
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>/);
  });

  it("tonlar farklı görsel işaret üretir", () => {
    // Statik render: her ton kendi işaretini taşır; tonlu rozette şekil
    // bulunur, neutral'da şekil yoktur (yalnız metin bilgisi).
    for (const tone of allTones) {
      const html = renderToStaticMarkup(createElement(Badge, { tone, children: "Durum" }));
      expect(html, tone).toContain(`data-tone="${tone}"`);
      if (tone === "neutral") {
        expect(html, tone).not.toContain("eg-badge__dot");
      } else {
        expect(html, tone).toContain("eg-badge__dot");
      }
    }

    // CSS: ton başına farklı şekil (daire/kare/üçgen/elmas) ve şeklin ton
    // rengine boyanması. Şekiller birbirinden ayrışmalı.
    for (const { tone } of toned) {
      const rule = dotRule(tone);
      expect(rule.length, tone).toBeGreaterThan(0);
      expect(rule, tone).toMatch(/background:\s*var\(--(blue|green|amber|red)-\d+\)/);
    }
    const shapes = toned.map(({ tone }) => shapeOf(dotRule(tone)));
    expect(shapes).not.toContain("unknown");
    expect(new Set(shapes).size).toBe(toned.length);
  });
});

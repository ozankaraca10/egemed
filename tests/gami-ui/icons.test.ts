import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BadgeCategory } from "../../packages/gamification-core/src/index";
import { defaultGamiIcons } from "../../packages/gami-ui/src/icons";

const CATEGORIES: BadgeCategory[] = ["topic", "skill", "streak", "learn", "milestone", "challenge"];

describe("defaultGamiIcons.badge", () => {
  it("bilinen bir iconName için eşlenen ikonu çizer", () => {
    const html = renderToStaticMarkup(createElement("span", null, defaultGamiIcons.badge("Ruler", 18, "skill")));
    expect(html).toContain("<svg");
  });

  it("her kategori için 'Ruler' katalog eşlemesi mevcuttur (pulse kaliper rozetleri)", () => {
    // Kök neden regresyonu: Ruler ikonu haritada yoksa kaliper rozetleri boş çizerdi.
    const withRuler = renderToStaticMarkup(createElement("span", null, defaultGamiIcons.badge("Ruler", 18, "skill")));
    const withoutKnown = renderToStaticMarkup(createElement("span", null, defaultGamiIcons.badge("Bilinmeyen-Ikon", 18, "skill")));
    expect(withRuler).not.toBe(withoutKnown);
  });

  it.each(CATEGORIES)("bilinmeyen iconName için '%s' kategorisinde asla boş kalmaz", (category) => {
    const el = defaultGamiIcons.badge("Bilinmeyen-Ikon", 18, category);
    expect(el).not.toBeNull();
    const html = renderToStaticMarkup(createElement("span", null, el));
    expect(html).toContain("<svg");
  });

  it("farklı kategoriler için farklı yedek ikonlar seçilebilir", () => {
    const skill = renderToStaticMarkup(createElement("span", null, defaultGamiIcons.badge("Bilinmeyen-Ikon", 18, "skill")));
    const streak = renderToStaticMarkup(createElement("span", null, defaultGamiIcons.badge("Bilinmeyen-Ikon", 18, "streak")));
    expect(skill).not.toBe(streak);
  });
});

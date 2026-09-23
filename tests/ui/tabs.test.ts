import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextTabIndex, Tabs, type TabItem } from "../../packages/ui/src/Tabs";
import { describe, expect, it } from "vitest";

const items: readonly TabItem[] = [
  { id: "ozet", label: "Özet", panel: "Özet paneli" },
  { id: "bulgular", label: "Bulgular", panel: "Bulgular paneli" },
  { id: "notlar", label: "Notlar", panel: "Notlar paneli" },
];

/** `defaultSelectedId` yokken anahtar hiç geçilmez (`exactOptionalPropertyTypes`). */
function render(defaultSelectedId?: string): string {
  const props = { items, label: "Bölümler" };
  const withSelection = defaultSelectedId === undefined ? props : { ...props, defaultSelectedId };
  return renderToStaticMarkup(createElement(Tabs, withSelection));
}

/** Bir HTML etiketinden istenen özniteliğin değerini okur. */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1];
}
describe("nextTabIndex", () => {
  it("←/→ döngüsel gezinir ve uçlardan karşı uca sarar", () => {
    expect(nextTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextTabIndex(2, "ArrowLeft", 3)).toBe(1);
  });

  it("Home/End uçlara gider; tek öğe sabit, boş liste -1", () => {
    expect(nextTabIndex(2, "Home", 3)).toBe(0);
    expect(nextTabIndex(0, "End", 3)).toBe(2);
    expect(nextTabIndex(0, "ArrowRight", 1)).toBe(0);
    expect(nextTabIndex(0, "ArrowRight", 0)).toBe(-1);
  });
});
describe("Tabs işaretlemesi", () => {
  it("roller, tek etkin sekme ve roving tabindex üretir", () => {
    const html = render();
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(html).toContain('role="tablist"');
    expect(tabs.length).toBe(items.length);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(tabs[0]).toContain('tabindex="0"');
    expect(tabs[1]).toContain('tabindex="-1"');
    expect(tabs[2]).toContain('tabindex="-1"');
  });

  it("aria-controls ↔ panel id ve panel aria-labelledby ↔ sekme id bağlarını kurar", () => {
    const html = render();
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels.length).toBe(items.length);
    for (const [index, tab] of tabs.entries()) {
      const controls = attr(tab, "aria-controls") ?? "";
      const tabId = attr(tab, "id") ?? "";
      expect(controls.length, `sekme ${index}`).toBeGreaterThan(0);
      expect(tabId.length, `sekme ${index}`).toBeGreaterThan(0);
      expect(panels[index] ?? "").toContain(`id="${controls}"`);
      expect(panels[index] ?? "").toContain(`aria-labelledby="${tabId}"`);
    }
  });

  it("defaultSelectedId etkin sekmeyi belirler", () => {
    const label = /<button[^>]*aria-selected="true"[^>]*>([^<]*)<\/button>/.exec(render("notlar"))?.[1];
    expect(label).toBe("Notlar");
  });

  it("geçersiz defaultSelectedId ilk sekmeye geri döner (klavye erişimi)", () => {
    const html = render("yok");
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[0]).toContain('tabindex="0"');
    expect(tabs[1]).toContain('tabindex="-1"');
  });
});

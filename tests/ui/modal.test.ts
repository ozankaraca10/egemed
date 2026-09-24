import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tr } from "../../packages/ui/i18n/tr";
import { Modal, nextFocusTarget, type ModalProps } from "../../packages/ui/src/Modal";
import { describe, expect, it } from "vitest";

const componentsCss = ts.sys.readFile("packages/ui/styles/components.css") ?? "";

const noop = (): void => undefined;

/** `exactOptionalPropertyTypes` altında isteğe bağlı alanları koşullu ekler. */
function render(open: boolean, extra: { closeLabel?: string; className?: string } = {}): string {
  const base: ModalProps = { open, onClose: noop, title: "Onay", children: "İçerik" };
  const withLabel = extra.closeLabel === undefined ? base : { ...base, closeLabel: extra.closeLabel };
  const props = extra.className === undefined ? withLabel : { ...withLabel, className: extra.className };
  return renderToStaticMarkup(createElement(Modal, props));
}

/** Belirtilen seçicinin ilk kural gövdesini döndürür (yoksa boş dize). */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(componentsCss)?.[1] ?? "";
}

/** `--eg-touch-min: 44px` tanımlayan kuralın seçicisini döndürür. */
function touchMinScope(): string {
  const match = /([^{}]+)\{[^}]*--eg-touch-min:\s*44px/.exec(componentsCss);
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

describe("nextFocusTarget", () => {
  const items: readonly string[] = ["ilk", "orta", "son"];

  it("son öğede Tab ilk öğeye, ilk öğede Shift+Tab son öğeye sarar", () => {
    expect(nextFocusTarget(items, "son", false)).toBe("ilk");
    expect(nextFocusTarget(items, "ilk", true)).toBe("son");
  });

  it("ortadaki öğede sınır yoksa tarayıcı varsayılanı için null döner", () => {
    expect(nextFocusTarget(items, "orta", false)).toBeNull();
    expect(nextFocusTarget(items, "orta", true)).toBeNull();
  });

  it("boş listede null döner", () => {
    expect(nextFocusTarget<string>([], "ilk", false)).toBeNull();
    expect(nextFocusTarget<string>([], null, true)).toBeNull();
  });

  it("current yok ya da null ise Shift'e göre uca gider", () => {
    expect(nextFocusTarget(items, null, false)).toBe("ilk");
    expect(nextFocusTarget(items, null, true)).toBe("son");
    expect(nextFocusTarget(items, "bilinmeyen", false)).toBe("ilk");
    expect(nextFocusTarget(items, "bilinmeyen", true)).toBe("son");
  });

  it("tek öğede hedef kendisidir", () => {
    const tek: readonly string[] = ["tek"];
    expect(nextFocusTarget(tek, "tek", false)).toBe("tek");
    expect(nextFocusTarget(tek, "tek", true)).toBe("tek");
  });
});

describe("Modal işaretlemesi", () => {
  it("open=false iken hiçbir şey render etmez", () => {
    expect(render(false)).toBe("");
  });

  it("diyalog rolünü, aria bağlarını ve başlık kimliğini kurar", () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy ?? ""}"`);
    expect(html).toContain("eg-modal__title");
    expect(html).toContain('aria-hidden="true"');
  });

  it("closeLabel verilirse sözlük metnini geçersiz kılar", () => {
    const html = render(true, { closeLabel: "Vazgeç" });
    expect(html).toContain(">Vazgeç<");
    expect(html).not.toContain(`>${tr["modal.close"]}<`);
  });
});

describe("Modal CSS sözleşmesi", () => {
  it("kapat düğmesi en az 44px dokunma hedefi taşır", () => {
    const close = ruleBody(".eg-modal__close").replace(/\s+/g, " ");
    expect(close).toMatch(/min-width:\s*var\(--eg-touch-min\)/);
    expect(close).toMatch(/min-height:\s*var\(--eg-touch-min\)/);
  });

  it("yerel --eg-touch-min .eg-modal kapsamında tanımlıdır", () => {
    expect(touchMinScope()).toContain(".eg-modal");
  });

  it("diyalog kutusunu border-box ile 360px taşmasına karşı korur (B1)", () => {
    expect(ruleBody(".eg-modal__dialog")).toMatch(/box-sizing:\s*border-box/);
  });
});

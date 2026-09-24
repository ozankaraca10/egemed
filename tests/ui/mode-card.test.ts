import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clampProgress,
  ModeCard,
  progressPercent,
  type ModeCardLockedProps,
  type ModeCardProps,
} from "../../packages/ui/src/ModeCard";
import { describe, expect, it } from "vitest";

const componentsCss = ts.sys.readFile("packages/ui/styles/components.css") ?? "";
const noop = (): void => undefined;

/** Açık kart; `tone` literal tipini korumak için `satisfies` kullanılır. */
const openCard = {
  tone: "learn",
  title: "İnceleme",
  description: "EKG sonuçlarını serbestçe inceleyin.",
  items: ["Ritim değerlendirmesi", "Ölçüm araçları"],
  progress: { current: 7, total: 13, label: "EKG sonucu izlendi" },
  actionLabel: "İnceleme moduna başla",
  onAction: noop,
} satisfies ModeCardProps;

/** Kilitli kart: görünür kalır, CTA ön koşul görünümünü hedefler. */
const lockedCard = {
  ...openCard,
  tone: "practice",
  title: "Uygulama",
  locked: true,
  lockedLabel: "Kilitli",
  lockReason: "Açılması için İnceleme tamamlanmalı",
  actionLabel: "Kilidi aç → İnceleme moduna git",
} satisfies ModeCardLockedProps;

function render(props: ModeCardProps): string {
  return renderToStaticMarkup(createElement(ModeCard, props));
}

/** Etiketten istenen özniteliğin değerini okur (tabs.test.ts deseni). */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1];
}

/** Seçicinin ilk kural gövdesini sadeleştirir (yoksa boş dize). */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(componentsCss)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** İşaretlemede verilen sınıfı taşıyan ilk etiketi döndürür. */
function tagWith(html: string, className: string): string {
  return new RegExp(`<[a-z]+[^>]*${className}[^>]*>`).exec(html)?.[0] ?? "";
}

describe("clampProgress ve progressPercent", () => {
  it("sayıyı [0, total] aralığına kilitler", () => {
    expect(clampProgress(7, 13)).toBe(7);
    expect(clampProgress(20, 13)).toBe(13);
    expect(clampProgress(-4, 13)).toBe(0);
  });

  it("geçersiz toplamda (0, negatif, NaN) 0 döner", () => {
    expect(clampProgress(3, 0)).toBe(0);
    expect(clampProgress(3, -5)).toBe(0);
    expect(clampProgress(3, Number.NaN)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });

  it("yüzdeyi tam sayıya yuvarlar", () => {
    expect(progressPercent(7, 13)).toBe(54);
    expect(progressPercent(13, 13)).toBe(100);
    expect(progressPercent(-1, 13)).toBe(0);
  });
});

describe("ModeCard açık kart", () => {
  it("tonu, başlık bağını ve madde listesini kurar", () => {
    const html = render(openCard);
    expect(html).toContain('data-tone="learn"');
    expect(html).toContain('data-locked="false"');
    const titleId = /<h3[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    expect(titleId).toBeTruthy();
    expect(attr(tagWith(html, "eg-mode-card\\b"), "aria-labelledby")).toBe(titleId);
    expect((html.match(/<li/g) ?? []).length).toBe(openCard.items.length);
    expect(tagWith(html, "eg-mode-card__check")).toContain('aria-hidden="true"');
  });

  it("sayı + progressbar semantiğini ve çubuk genişliğini kurar", () => {
    const html = render(openCard);
    const bar = tagWith(html, "eg-mode-card__progress");
    expect(bar).toContain('role="progressbar"');
    expect(attr(bar, "aria-valuemin")).toBe("0");
    expect(attr(bar, "aria-valuemax")).toBe("13");
    expect(attr(bar, "aria-valuenow")).toBe("7");
    expect(attr(bar, "aria-valuetext")).toBe("7/13 EKG sonucu izlendi");
    expect(html).toContain("7/13 EKG sonucu izlendi");
    expect(attr(bar, "aria-labelledby")).toBe(attr(tagWith(html, "eg-mode-card__status"), "id"));
    expect(tagWith(html, "eg-mode-card__bar")).toContain('style="width:54%"');
  });
});

describe("ModeCard kilitli kart", () => {
  it("CTA devre dışı bırakılmaz; neden aria-describedby ile bağlanır", () => {
    const html = render(lockedCard);
    const button = tagWith(html, "eg-mode-card__action");
    expect(button).not.toContain("disabled");
    expect(button).not.toContain('aria-disabled="true"');
    const statusId = attr(tagWith(html, "eg-mode-card__status"), "id");
    expect(statusId).toBeTruthy();
    expect(attr(button, "aria-describedby")).toBe(statusId);
  });
});

describe("ModeCard ilerleme sınırları", () => {
  it("current > total üst sınırda kilitlenir; total 0 ise çubuk üretilmez", () => {
    const overflow = render({
      ...openCard,
      progress: { current: 20, total: 13, label: "izlendi" },
    });
    expect(overflow).toContain('aria-valuenow="13"');
    expect(overflow).toContain('style="width:100%"');
    expect(overflow).toContain("13/13 izlendi");
    const empty = render({ ...openCard, progress: { current: 0, total: 0, label: "izlendi" } });
    expect(empty).not.toContain("progressbar");
    expect(empty).toContain("0/0 izlendi");
  });
});

describe("ModeCard CSS sözleşmesi", () => {
  it("üç tonu aile token'larına bağlar", () => {
    const tones = [
      { tone: "learn", accent: "--green-600", soft: "--green-50" },
      { tone: "practice", accent: "--blue-600", soft: "--blue-50" },
      { tone: "assessment", accent: "--purple-600", soft: "--purple-50" },
    ] as const;
    for (const { tone, accent, soft } of tones) {
      const rule = ruleBody(`.eg-mode-card[data-tone="${tone}"]`);
      expect(rule, tone).toContain(`var(${accent})`);
      expect(rule, tone).toContain(`var(${soft})`);
    }
  });

  it("kart ve CTA 44px dokunma hedefini ve border-box'ı korur", () => {
    const card = ruleBody(".eg-mode-card");
    expect(card).toMatch(/--eg-touch-min:\s*44px/);
    expect(card).toMatch(/box-sizing:\s*border-box/);
    const action = ruleBody(".eg-mode-card__action");
    expect(action).toMatch(/min-height:\s*var\(--eg-touch-min\)/);
    expect(action).toMatch(/width:\s*100%/);
    expect(action).toMatch(/box-sizing:\s*border-box/);
  });

  it("ızgara geniş ekranda üç, 1024 px altında tek kolon", () => {
    expect(ruleBody(".eg-mode-card-grid")).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(componentsCss).toMatch(
      /@media \(max-width: 1024px\)[\s\S]*?\.eg-mode-card-grid[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });

  it("CTA etiketi --text ile AA kontrast korur; kilitli CTA kesikli çerçevelidir", () => {
    const action = ruleBody(".eg-mode-card__action");
    expect(action).toMatch(/color:\s*var\(--text\)/);
    expect(action).toMatch(/background:\s*var\(--eg-mode-accent-soft\)/);
    expect(action).toMatch(/border:\s*1px solid var\(--eg-mode-accent\)/);
    const lockedAction = ruleBody('.eg-mode-card[data-locked="true"] .eg-mode-card__action');
    expect(lockedAction).toMatch(/background:\s*var\(--card\)/);
    expect(lockedAction).toMatch(/border-style:\s*dashed/);
  });

  it("odak halkası tüm kart eylemlerini kapsar", () => {
    expect(componentsCss).toMatch(/\.eg-mode-card\s*:focus-visible/);
  });
});

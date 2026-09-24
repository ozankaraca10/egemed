import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Renk literali desenleri (tests/ui/css-tokens.test.ts ile aynı küme). */
const colorLiterals = [
  /#[0-9a-f]{3,8}\b/i,
  /\brgba?\(/i,
  /\bhsla?\(/i,
  /\b(?:oklch|oklab|lab|lch|hwb|color-mix|light-dark)\(/i,
  /\b(?:red|white|black|blue|green|yellow|orange|purple|gray|grey|silver|maroon|navy|teal|aqua|lime|fuchsia|olive|transparent)\b(?!-)/i,
];

/** Dosyayı okur; yoksa testi düşürür. */
function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) throw new Error(`Dosya okunamadı: ${path}`);
  return content;
}

const capture = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] ?? "");
const shellCss = read("apps/shell/src/shell.css");
const defined = (source: string): Set<string> => new Set(capture(source, /(--[\w-]+)\s*:/g));

describe("shell.css token sözleşmesi", () => {
  it("renk literali içermez, sınıflar eg-shell- öneklidir, her var() tanımlı token'a bağlanır", () => {
    for (const pattern of colorLiterals) expect(shellCss).not.toMatch(pattern);
    const classes = capture(shellCss.replace(/url\([^)]*\)/g, ""), /\.([A-Za-z][\w-]*)/g);
    expect(classes.length).toBeGreaterThan(0);
    for (const name of classes) expect(name.startsWith("eg-shell"), name).toBe(true);
    const family = defined(read("packages/tokens/family-tokens.css"));
    const local = defined(shellCss);
    const used = capture(shellCss, /var\(\s*(--[\w-]+)\s*[,)]/g);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect((name.startsWith("--eg-") ? local : family).has(name), name).toBe(true);
    }
  });
  it("mobil öncelikli düzeni, 44 px dokunma hedefini ve güvenli alanı tanımlar", () => {
    expect(shellCss).toMatch(/min-height:\s*44px/);
    expect(shellCss).toContain("@media (min-width: 768px)");
    expect(shellCss).toMatch(/position:\s*fixed/);
    expect(shellCss).toContain("env(safe-area-inset-bottom)");
  });
  it("giriş ekranını iki eşit masaüstü paneline böler ve mobilde tek sütuna indirir", () => {
    expect(shellCss).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(shellCss).toContain("@media (max-width: 768px)");
    expect(shellCss).toMatch(/\.eg-shell-entry__input[\s\S]*?min-height:\s*48px/);
    expect(shellCss).toContain("prefers-reduced-motion: reduce");
    expect(shellCss).toContain(":focus-visible");
    expect(shellCss).not.toMatch(/\.eg-shell-entry__logo\s*\{[^}]*filter:/);
    // Görsel panelin kendi arka planıdır (tam görünür); %10 katman ::before'dadır ve görsel içermez.
    expect(shellCss).toMatch(/\.eg-shell-entry__brand\s*\{[^}]*url\("\/brand\/entry-bg\.jpg"\)/);
    expect(shellCss).toContain('background-image: url("/brand/entry-bg-760.jpg")');
    expect(shellCss).toMatch(/\.eg-shell-entry__brand::before\s*\{[^}]*opacity:\s*\.10/);
    expect(shellCss).not.toMatch(/\.eg-shell-entry__brand::before\s*\{[^}]*url\(/);
    expect(shellCss).toMatch(/\.eg-shell-entry__brand\s*\{[^}]*center 35% \/ cover/);
  });
  it("gövde kenar boşluğunu sıfırlar ve programatik odakta çerçeve çizmez (B2)", () => {
    expect(shellCss).toMatch(/html\s*,\s*body\s*\{[^}]*margin:\s*0/);
    expect(shellCss).toMatch(/:focus:not\(:focus-visible\)[^{]*\{[^}]*outline:\s*none/);
  });
  it("footer'ı alt çubuk boşluğuyla, adımları mod kimliği renkleriyle tanımlar", () => {
    expect(shellCss).toMatch(/\.eg-shell \.eg-shell-footer\s*\{[^}]*padding-bottom:\s*calc\(/);
    expect(shellCss).toMatch(/\.eg-shell-footer--small\s*\{/);
    expect(shellCss).toMatch(/\.eg-shell-how__step--learn\s*\{[^}]*var\(--green-600\)/);
    expect(shellCss).toMatch(/\.eg-shell-how__step--practice\s*\{[^}]*var\(--blue-600\)/);
    expect(shellCss).toMatch(/\.eg-shell-how__step--assess\s*\{[^}]*var\(--purple-600\)/);
    expect(shellCss).toMatch(/\.eg-shell-how__num\s*\{[^}]*width:\s*2rem/);
    expect(shellCss).toMatch(/\.eg-shell-entry__simicon\s*\{[^}]*height:\s*2rem/);
    expect(shellCss).not.toMatch(/\.eg-shell-entry__simicon[^{]*\{[^}]*filter:/);
  });
});

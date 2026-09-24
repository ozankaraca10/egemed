import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Opaca CSS sözleşmesi — E2 §8 S20–S23: kapsam, token ve renk literali disiplini. */

const tokenCssPath = "packages/tokens/opaca.css";
const shellCssPath = "packages/sim-opaca/src/styles/shell.css";

const forbiddenBareSelectors = [":root", "html", "body", "#root", "button", "*", ":focus-visible"];

const hexPattern = /#[0-9a-f]{3,8}\b/i;

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) throw new Error(`Dosya okunamadı: ${path}`);
  return content;
}

const capture = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] ?? "");

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function allRuleSelectors(css: string): string[] {
  const cleaned = stripComments(css);
  const selectors: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    while (i < cleaned.length && /\s/.test(cleaned.charAt(i))) i++;
    if (i >= cleaned.length) break;
    const start = i;
    while (i < cleaned.length && cleaned[i] !== "{") i++;
    const selector = cleaned.slice(start, i).trim();
    if (!selector) break;
    i++;
    let depth = 1;
    const bodyStart = i;
    while (i < cleaned.length && depth > 0) {
      if (cleaned[i] === "{") depth++;
      if (cleaned[i] === "}") depth--;
      i++;
    }
    const body = cleaned.slice(bodyStart, i - 1);
    if (selector.startsWith("@keyframes")) continue;
    if (selector.startsWith("@media") || selector.startsWith("@supports")) {
      selectors.push(...allRuleSelectors(body));
      continue;
    }
    selectors.push(selector);
  }
  return selectors;
}

function bareSelectorParts(css: string): string[] {
  return allRuleSelectors(css).flatMap((selector) => selector.split(",").map((part) => part.trim()));
}

const tokenCss = read(tokenCssPath);
const shellCss = read(shellCssPath);
const tokenVars = new Set(capture(tokenCss, /(--[\w-]+)\s*:/g));

describe("Opaca CSS sözleşmesi (S20–S21)", () => {
  it("opaca.css iki :root bloğu ve token ihracı taşır", () => {
    expect(tokenCss.match(/:root\s*\{/g)?.length).toBe(2);
    const pkg = JSON.parse(read("packages/tokens/package.json")) as { exports: Record<string, string> };
    expect(pkg.exports["./opaca.css"]).toBe("./opaca.css");
  });

  it("shell.css kapsamsız global seçici içermez", () => {
    const parts = bareSelectorParts(shellCss);
    expect(parts.length).toBeGreaterThan(0);
    for (const name of forbiddenBareSelectors) {
      expect(parts, name).not.toContain(name);
    }
  });

  it("shell.css sınıf seçicileri .eg-sim-opaca kapsamı altındadır", () => {
    const parts = bareSelectorParts(shellCss);
    for (const trimmed of parts) {
      if (!trimmed) continue;
      expect(trimmed.startsWith(".eg-sim-opaca"), trimmed).toBe(true);
    }
  });

  it("hex literalleri yalnız opaca.css'te bulunur", () => {
    expect(shellCss).not.toMatch(hexPattern);
    expect(tokenCss).toMatch(hexPattern);
  });

  it("shell.css'teki her var() opaca token dosyasında tanımlıdır", () => {
    const used = capture(shellCss, /var\(\s*(--[\w-]+)\s*[,)]/g);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(tokenVars.has(name), name).toBe(true);
    }
  });

  it("kabuk/ekran temel yerleşim seçicilerini tanımlar", () => {
    expect(shellCss).toMatch(/\.eg-sim-opaca \.app-shell\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.screen\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.container\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.btn\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-header\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-footer\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-sim-toolbar\s*\{/);
  });
});

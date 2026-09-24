import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Ausculta CSS sözleşmesi — E2 §6 ve §9 S17a–S17d. */

const tokenCssPath = "packages/tokens/ausculta.css";
const bridgePath = "packages/sim-ausculta/src/styles/tokens.css";
const moduleCssPaths = [
  "packages/sim-ausculta/src/styles/base.css",
  "packages/sim-ausculta/src/styles/components.css",
  "packages/sim-ausculta/src/styles/responsive.css",
] as const;

const forbiddenBareSelectors = [":root", "html", "body", "#root", "button", "*", ":focus-visible"];
const hexPattern = /#[0-9a-f]{3,8}\b/i;
const varPattern = /var\(\s*(--[\w-]+)\s*[,)]/g;

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) throw new Error(`Dosya okunamadı: ${path}`);
  return content;
}

const capture = (source: string, pattern: RegExp): string[] =>
  [...source.matchAll(pattern)].map((match) => match[1] ?? "");

function selectorsIn(css: string): string[] {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  let offset = 0;
  while (offset < cleaned.length) {
    while (/\s/.test(cleaned.charAt(offset))) offset++;
    if (offset >= cleaned.length) break;
    const start = offset;
    while (offset < cleaned.length && cleaned.charAt(offset) !== "{") offset++;
    const selector = cleaned.slice(start, offset).trim();
    if (!selector) break;
    offset++;
    let depth = 1;
    const bodyStart = offset;
    while (offset < cleaned.length && depth > 0) {
      if (cleaned.charAt(offset) === "{") depth++;
      if (cleaned.charAt(offset) === "}") depth--;
      offset++;
    }
    const body = cleaned.slice(bodyStart, offset - 1);
    if (selector.startsWith("@media") || selector.startsWith("@supports")) {
      selectors.push(...selectorsIn(body));
    } else if (!selector.startsWith("@")) {
      selectors.push(selector);
    }
  }
  return selectors.flatMap((selector) => selector.split(",").map((part) => part.trim()));
}

const auscultaCss = read(tokenCssPath);
const bridgeCss = read(bridgePath);
const moduleCss = moduleCssPaths.map((path) => ({ path, css: read(path) }));
const familyTokens = new Set(capture(read("packages/tokens/family-tokens.css"), /(--[\w-]+)\s*:/g));
const auscultaTokens = new Set(capture(auscultaCss, /(--[\w-]+)\s*:/g));
const localTokens = new Set(capture(bridgeCss, /(--[\w-]+)\s*:/g));

describe("Ausculta CSS kapsam sözleşmesi (S17a–S17c)", () => {
  it("ausculta.css özel renkleri dışa açar ve hex taşır", () => {
    expect(auscultaCss).toMatch(/:root\s*\{/);
    expect(auscultaCss).toMatch(/--navy-950:\s*#061e44/);
    expect(auscultaCss).toMatch(hexPattern);
    const pkg = JSON.parse(read("packages/tokens/package.json")) as { exports: Record<string, string> };
    expect(pkg.exports["./ausculta.css"]).toBe("./ausculta.css");
  });

  it("köprü --eg-ausculta-* değişkenleri aile veya Ausculta tokenına çözülür", () => {
    expect(localTokens.size).toBeGreaterThan(0);
    for (const token of localTokens) {
      expect(token.startsWith("--eg-ausculta-"), token).toBe(true);
      const bridgeValue = new RegExp(`${token}:\\s*var\\((--[\\w-]+)\\)`).exec(bridgeCss)?.[1];
      expect(bridgeValue, token).toBeDefined();
      expect(familyTokens.has(bridgeValue ?? "") || auscultaTokens.has(bridgeValue ?? ""), bridgeValue).toBe(true);
    }
  });

  it("modül CSS'i kapsamsız global seçici veya hex rengi içermez", () => {
    for (const { path, css } of moduleCss) {
      const selectors = selectorsIn(css);
      expect(selectors.length, path).toBeGreaterThan(0);
      for (const forbidden of forbiddenBareSelectors) {
        expect(selectors, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
      for (const selector of selectors) {
        expect(selector.startsWith(".eg-sim-ausculta"), `${path}: ${selector}`).toBe(true);
      }
      expect(css, path).not.toMatch(hexPattern);
    }
    expect(bridgeCss).not.toMatch(hexPattern);
  });

  it("her var() aile, Ausculta veya köprü tokenına bağlanır", () => {
    for (const { path, css } of [{ path: bridgePath, css: bridgeCss }, ...moduleCss]) {
      for (const token of capture(css, varPattern)) {
        expect(
          familyTokens.has(token) || auscultaTokens.has(token) || localTokens.has(token),
          `${path}: ${token}`,
        ).toBe(true);
      }
    }
  });

  it("kabuk ve ortak bileşen seçicilerini tanımlar ve paket girişinden yükler", () => {
    const base = moduleCss[0]?.css ?? "";
    const components = moduleCss[1]?.css ?? "";
    expect(base).toMatch(/\.eg-sim-ausculta \.app-shell\s*\{/);
    expect(base).toMatch(/\.eg-sim-ausculta \.app-content\s*\{/);
    expect(components).toMatch(/\.eg-sim-ausculta \.screen\s*\{/);
    expect(components).toMatch(/\.eg-sim-ausculta \.btn\s*\{/);
    expect(components).toMatch(/\.eg-sim-ausculta \.card\s*\{/);
    expect(components).toMatch(/\.eg-sim-ausculta \.badge\s*\{/);
    expect(components).toMatch(/\.eg-sim-ausculta \.eg-footer\s*\{/);
    expect(base + components).not.toMatch(/@media\b/);
    const responsive = moduleCss[2]?.css ?? "";
    expect(responsive).toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/);
    expect(responsive).toMatch(/@media\s*\(\s*min-width:\s*768px\s*\)/);
    expect(responsive).toMatch(/@media\s*\(\s*min-width:\s*1440px\s*\)/);
    expect(responsive).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(responsive).toMatch(/\.hide-mobile\s*\{[^}]*display:\s*none/);
    expect(components).toMatch(/transform:\s*scaleX\(0\)/);
    expect(components).not.toMatch(/transition:\s*width/);
    expect(components).toMatch(/\.modal-close[\s\S]*min-height:\s*44px/);
    expect(components).toMatch(/\.t-btn\s*\{[^}]*min-height:\s*44px/);
    const entry = read("packages/sim-ausculta/src/index.ts");
    expect(entry).toContain('import "@egemed/tokens/family-tokens.css"');
    expect(entry).toContain('import "@egemed/tokens/ausculta.css"');
    expect(entry).toContain('import "./styles/tokens.css"');
    expect(entry).toContain('import "./styles/base.css"');
    expect(entry).toContain('import "./styles/components.css"');
    expect(entry).toContain('import "./styles/responsive.css"');
  });
});

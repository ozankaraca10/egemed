import ts from "typescript";
import { describe, expect, it } from "vitest";

const tokenPath = "packages/sim-pulse/src/styles/tokens.css";
const cssPaths = [
  "packages/sim-pulse/src/styles/base.css",
  "packages/sim-pulse/src/styles/sim.css",
  "packages/sim-pulse/src/styles/explain.css",
  "packages/sim-pulse/src/styles/case.css",
  "packages/sim-pulse/src/styles/responsive.css",
] as const;
const forbiddenGlobalSelectors = [":root", "html", "body", "button", "#root", "*"];
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

const tokenCss = read(tokenPath);
const moduleCss = cssPaths.map((path) => ({ path, css: read(path) }));
const familyTokens = new Set(capture(read("packages/tokens/family-tokens.css"), /(--[\w-]+)\s*:/g));
const localTokens = new Set(capture(tokenCss, /(--[\w-]+)\s*:/g));

describe("Pulse CSS kapsam sözleşmesi (S14a–S14e)", () => {
  it("Pulse köprüsü aile tokenlarına çözülen yerel --eg-pulse-* değişkenleri sağlar", () => {
    expect(localTokens.size).toBeGreaterThan(0);
    for (const token of localTokens) {
      expect(token.startsWith("--eg-pulse-"), token).toBe(true);
      const bridgeValue = new RegExp(`${token}:\\s*var\\((--[\\w-]+)\\)`).exec(tokenCss)?.[1];
      expect(bridgeValue, token).toBeDefined();
      expect(familyTokens.has(bridgeValue ?? ""), bridgeValue).toBe(true);
    }
  });

  it("modül CSS'i kapsamsız global seçici veya hex rengi içermez", () => {
    for (const { path, css } of moduleCss) {
      const selectors = selectorsIn(css);
      expect(selectors.length, path).toBeGreaterThan(0);
      for (const forbidden of forbiddenGlobalSelectors) {
        expect(selectors, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
      for (const selector of selectors) {
        expect(selector.startsWith(".eg-sim-pulse"), `${path}: ${selector}`).toBe(true);
      }
      expect(css, path).not.toMatch(hexPattern);
    }
  });

  it("her var() aile tokenına veya Pulse köprü tokenına bağlanır", () => {
    for (const { path, css } of moduleCss) {
      for (const token of capture(css, varPattern)) {
        expect(familyTokens.has(token) || localTokens.has(token), `${path}: ${token}`).toBe(true);
      }
    }
  });

  it("kabuk, anatomi ve EKG kurallarını tanımlar ve paket girişinden yükler", () => {
    const base = moduleCss[0]?.css ?? "";
    const sim = moduleCss[1]?.css ?? "";
    const explain = moduleCss[2]?.css ?? "";
    const cases = moduleCss[3]?.css ?? "";
    const responsive = moduleCss[4]?.css ?? "";
    expect(base).toMatch(/\.eg-sim-pulse \.app\s*\{/);
    expect(base).toMatch(/\.eg-sim-pulse \.topbar\s*\{/);
    expect(sim).toMatch(/\.eg-sim-pulse \.anatomy-stage\s*\{/);
    expect(sim).toMatch(/\.eg-sim-pulse \.ecg-screen\s*\{/);
    expect(sim).toMatch(/\.eg-sim-pulse \.caliper-handle\s*\{/);
    expect(explain).toMatch(/\.eg-sim-pulse \.mode-cards\s*\{/);
    expect(explain).toMatch(/\.eg-sim-pulse \.tutorial-panel\s*\{/);
    expect(cases).toMatch(/\.eg-sim-pulse \.case-detail\s*\{/);
    expect(cases).toMatch(/\.eg-sim-pulse \.q-card-dark\s*\{/);
    expect(responsive).toMatch(/prefers-reduced-motion\s*:\s*reduce/);
    expect(moduleCss.reduce((count, { css }) => count + (css.match(/@media\b/g)?.length ?? 0), 0)).toBe(31);
    const entry = read("packages/sim-pulse/src/index.ts");
    expect(entry).toContain('import "@egemed/tokens/family-tokens.css"');
    expect(entry).toContain('import "./styles/tokens.css"');
    expect(entry).toContain('import "./styles/base.css"');
    expect(entry).toContain('import "./styles/sim.css"');
    expect(entry).toContain('import "./styles/explain.css"');
    expect(entry).toContain('import "./styles/case.css"');
    expect(entry).toContain('import "./styles/responsive.css"');
  });
});

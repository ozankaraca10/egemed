import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Opaca CSS sözleşmesi — E2 §8 S20–S23: kapsam, token ve renk literali disiplini. */

const tokenCssPath = "packages/tokens/opaca.css";
const moduleCssPaths = [
  "packages/sim-opaca/src/styles/shell.css",
  "packages/sim-opaca/src/styles/film.css",
  "packages/sim-opaca/src/styles/rest.css",
  "packages/sim-opaca/src/styles/gami.css",
] as const;

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

function assertScopedModuleCss(css: string, label: string): void {
  const parts = bareSelectorParts(css);
  expect(parts.length, label).toBeGreaterThan(0);
  for (const name of forbiddenBareSelectors) {
    expect(parts, `${label}: ${name}`).not.toContain(name);
  }
  for (const trimmed of parts) {
    if (!trimmed) continue;
    expect(trimmed.startsWith(".eg-sim-opaca"), `${label}: ${trimmed}`).toBe(true);
  }
  expect(css, label).not.toMatch(hexPattern);
  const used = capture(css, /var\(\s*(--[\w-]+)\s*[,)]/g);
  for (const name of used) {
    expect(tokenVars.has(name), `${label}: ${name}`).toBe(true);
  }
}

const tokenCss = read(tokenCssPath);
const moduleCss = Object.fromEntries(moduleCssPaths.map((p) => [p, read(p)])) as Record<
  (typeof moduleCssPaths)[number],
  string
>;
const tokenVars = new Set(capture(tokenCss, /(--[\w-]+)\s*:/g));

describe("Opaca CSS sözleşmesi (S20–S23)", () => {
  it("opaca.css iki :root bloğu ve token ihracı taşır", () => {
    expect(tokenCss.match(/:root\s*\{/g)?.length).toBe(2);
    const pkg = JSON.parse(read("packages/tokens/package.json")) as { exports: Record<string, string> };
    expect(pkg.exports["./opaca.css"]).toBe("./opaca.css");
  });

  it("modül CSS dosyaları kapsamsız global seçici içermez", () => {
    for (const path of moduleCssPaths) {
      assertScopedModuleCss(moduleCss[path], path);
    }
  });

  it("hex literalleri yalnız opaca.css'te bulunur", () => {
    for (const path of moduleCssPaths) {
      expect(moduleCss[path], path).not.toMatch(hexPattern);
    }
    expect(tokenCss).toMatch(hexPattern);
  });

  it("shell.css kabuk/ekran temel yerleşim seçicilerini tanımlar", () => {
    const shellCss = moduleCss["packages/sim-opaca/src/styles/shell.css"];
    expect(shellCss).toMatch(/\.eg-sim-opaca \.app-shell\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.screen\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.container\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.btn\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-header\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-footer\s*\{/);
    expect(shellCss).toMatch(/\.eg-sim-opaca \.eg-sim-toolbar\s*\{/);
  });

  it("film.css FilmViewer ve okuma bölgesi seçicilerini tanımlar", () => {
    const filmCss = moduleCss["packages/sim-opaca/src/styles/film.css"];
    expect(filmCss).toMatch(/\.eg-sim-opaca \.film-viewer\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.film-stage\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.zone-rect\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.anno-label\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.measure-line\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.film-mark\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.film-tools \.seg\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.popover\s*\{/);
    expect(filmCss).toMatch(/\.eg-sim-opaca \.zone-chip\s*\{/);
  });

  it("rest.css modaller, simülasyon ve v2 film bilgi panelini tanımlar", () => {
    const restCss = moduleCss["packages/sim-opaca/src/styles/rest.css"];
    expect(restCss).toMatch(/\.eg-sim-opaca \.modal-overlay\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.dev-panel\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.sim-grid\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.q-block\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.stage-card\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.film-info-panel\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.film-corner-badge\s*\{/);
    expect(restCss).toMatch(/\.eg-sim-opaca \.results-wrap-v2\s*\{/);
  });

  it("index.ts üç modül CSS dosyasını import eder", () => {
    const index = read("packages/sim-opaca/src/index.ts");
    expect(index).toContain('import "./styles/shell.css"');
    expect(index).toContain('import "./styles/film.css"');
    expect(index).toContain('import "./styles/rest.css"');
  });
});

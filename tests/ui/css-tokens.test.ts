import ts from "typescript";
import { describe, expect, it } from "vitest";

const componentsPath = "packages/ui/styles/components.css";
const familyTokensPath = "packages/tokens/family-tokens.css";

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) {
    throw new Error(`Dosya okunamadı: ${path}`);
  }
  return content;
}

/** Verilen desende ilk yakalama grubunu tüm eşleşmelerden toplar. */
function captureAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)]
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
}

const components = read(componentsPath);

describe("components.css token sözleşmesi", () => {
  it("renk literali (hex/rgb/hsl) içermez", () => {
    expect(components).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(components).not.toMatch(/\brgba?\(/i);
    expect(components).not.toMatch(/\bhsla?\(/i);
  });

  it("--eg- dışı her var() aile token'larında tanımlıdır", () => {
    const defined = new Set(captureAll(read(familyTokensPath), /(--[\w-]+)\s*:/g));
    const used = captureAll(components, /var\(\s*(--[\w-]+)\s*\)/g);
    const external = used.filter((name) => !name.startsWith("--eg-"));

    expect(used.length).toBeGreaterThan(0);
    expect(external.length).toBeGreaterThan(0);
    for (const name of external) {
      expect(defined.has(name), name).toBe(true);
    }
  });
});

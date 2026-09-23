import ts from "typescript";
import { describe, expect, it } from "vitest";

const componentsPath = "packages/ui/styles/components.css";
const familyTokensPath = "packages/tokens/family-tokens.css";

/** Adlandırılmış renkler: token sisteminde renk literali olarak kullanılmaz. */
const namedColors = [
  "red",
  "white",
  "black",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "gray",
  "grey",
  "silver",
  "maroon",
  "navy",
  "teal",
  "aqua",
  "lime",
  "fuchsia",
  "olive",
  "transparent",
] as const;

/**
 * Geçersiz renk literali desenleri. Adlandırılmış renk desenindeki `(?!-)`
 * eki `--blue-600` gibi token adlarını ve `white-space` gibi özellikleri
 * yanlış yakalamayı önler.
 */
const invalidColorPatterns = [
  { name: "hex", pattern: /#[0-9a-f]{3,8}\b/i },
  { name: "rgb/rgba", pattern: /\brgba?\(/i },
  { name: "hsl/hsla", pattern: /\bhsla?\(/i },
  {
    name: "modern renk fonksiyonu",
    pattern: /\b(?:oklch|oklab|lab|lch|hwb|color-mix|light-dark)\(/i,
  },
  { name: "adlandırılmış renk", pattern: new RegExp(`\\b(?:${namedColors.join("|")})\\b(?!-)`, "i") },
] as const;

/** `var(--x)` ve fallback'li `var(--x, …)` kullanımlarını token adına indirger. */
const varPattern = /var\(\s*(--[\w-]+)\s*[,)]/g;

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
  it("renk literali (hex/rgb/hsl/modern fonksiyon/ad) içermez", () => {
    for (const { name, pattern } of invalidColorPatterns) {
      expect(components, name).not.toMatch(pattern);
    }
  });

  it("negatif durumlarda renk literali desenleri gerçekten yakalar", () => {
    const invalidSamples = [
      "color: #fff;",
      "background: #ffffff;",
      "border: 1px solid #ffff00ff;",
      "color: rgb(1, 2, 3);",
      "color: rgba(1, 2, 3, 0.5);",
      "color: hsl(200 50% 50%);",
      "color: hsla(200, 50%, 50%, 0.5);",
      "color: red;",
      "background: white;",
      "border: 1px solid black;",
      "color: oklch(0.7 0.1 200);",
      "color: lab(50% 40 59.5);",
      "color: hwb(200 10% 20%);",
      "color: color-mix(in srgb, var(--text) 50%, white);",
    ];
    for (const sample of invalidSamples) {
      const caught = invalidColorPatterns.some(({ pattern }) => pattern.test(sample));
      expect(caught, sample).toBe(true);
    }
  });

  it("renk literali desenleri token ve özellik adlarını yanlış yakalamaz", () => {
    const validSamples = [
      "color: var(--text);",
      "background: var(--card-soft);",
      "border: 1px solid var(--border);",
      "outline: 2px solid var(--blue-600);",
      "white-space: nowrap;",
      "clip-path: inset(50%);",
      "transform: rotate(45deg);",
    ];
    for (const sample of validSamples) {
      const caught = invalidColorPatterns.some(({ pattern }) => pattern.test(sample));
      expect(caught, sample).toBe(false);
    }
  });

  it("--eg- dışı her var() aile token'larında tanımlıdır", () => {
    const defined = new Set(captureAll(read(familyTokensPath), /(--[\w-]+)\s*:/g));
    const used = captureAll(components, varPattern);
    const external = used.filter((name) => !name.startsWith("--eg-"));

    expect(used.length).toBeGreaterThan(0);
    expect(external.length).toBeGreaterThan(0);
    for (const name of external) {
      expect(defined.has(name), name).toBe(true);
    }
  });

  it("var() deseni fallback'li kullanımı da token denetimine alır", () => {
    expect(captureAll("color: var(--tanimsiz, 4px);", varPattern)).toEqual(["--tanimsiz"]);
    expect(captureAll("color: var(--tanimsiz);", varPattern)).toEqual(["--tanimsiz"]);
  });
});

/** Verilen seçicinin ilk kural gövdesini döndürür (yoksa boş dize). */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(components)?.[1] ?? "";
}

/** Mobil kart bloğundaki paylaşılan `.eg-table tr` kutu kuralının gövdesi. */
function mobileTableBoxRule(): string {
  return /\.eg-table tr,[\s\S]*?\{([^}]*)\}/.exec(components)?.[1] ?? "";
}
describe("components.css T07b bileşen sözleşmesi", () => {
  it("yeni seçicileri, 44px dokunma hedefini ve mobil kart listesini tanımlar", () => {
    for (const selector of [".eg-tabs__list", ".eg-tabs__tab", ".eg-table"]) {
      expect(ruleBody(selector).length, selector).toBeGreaterThan(0);
    }
    expect(components).toMatch(/--eg-touch-min:\s*44px/);
    expect(ruleBody(".eg-tabs__tab")).toMatch(/min-height:\s*var\(--eg-touch-min\)/);
    expect(components).toContain("@media (max-width: 767.98px)");
    expect(components).toMatch(/content:\s*attr\(data-label\)/);
  });

  it("mobil tablo satır kutusunu border-box ile taşmaya karşı korur (B1)", () => {
    expect(mobileTableBoxRule()).toMatch(/box-sizing:\s*border-box/);
  });

  it("etkin sekme işaretini renk dışında da sabitler (not 4)", () => {
    const selected = ruleBody('.eg-tabs__tab[aria-selected="true"]');
    expect(selected).toMatch(/box-shadow:\s*inset 0 -3px/);
    expect(selected).toMatch(/font-weight:\s*600/);
  });
});

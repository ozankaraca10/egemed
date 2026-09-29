import { describe, expect, it } from "vitest";
import ts from "typescript";
import { avatarTone } from "../../../packages/sim-opaca/src/gamification/avatar";
import { gamiDemoFrom, gamiEnabledFrom } from "../../../packages/sim-opaca/src/gamification/flag";

describe("avatar tonu", () => {
  it("aynı kimlik → aynı ton; anonim → t-anon; yalnız izinli tonlar", () => {
    expect(avatarTone("u-12")).toBe("t-blue");
    expect(avatarTone("u-12", true)).toBe("t-anon");
    const tones = new Set(Array.from({ length: 200 }, (_, i) => avatarTone(`id-${i}`)));
    expect([...tones].every((t) => ["t-blue", "t-purple", "t-green", "t-amber"].includes(t))).toBe(true);
    expect(tones.size).toBe(4);
  });
});

describe("domainMeta — ResultsScreen ile eşit", () => {
  it("anahtar/etiket sırası aynı", () => {
    const grab = (file: string) =>
      [...ts.sys.readFile(file)!.matchAll(/\{ key: '(\w+)', label: '([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`);
    const results = grab("packages/sim-opaca/src/screens/ResultsScreen.tsx");
    expect(results).toHaveLength(7);
    expect(grab("packages/sim-opaca/src/ui/gami/domainMeta.tsx")).toEqual(results);
  });
});

describe("oyunlaştırma bayrağı", () => {
  it("?gami=1 ya da VITE_GAMI=1 açar; prop kapalıyken kapalı", () => {
    expect(gamiEnabledFrom("?gami=1", undefined, true)).toBe(true);
    expect(gamiEnabledFrom("", "1", true)).toBe(true);
    expect(gamiEnabledFrom("", undefined, true)).toBe(true);
    expect(gamiEnabledFrom("", undefined, false)).toBe(false);
    expect(gamiEnabledFrom("?gami=0", "0", true)).toBe(false);
  });
  it("demo durumu yalnız dev build + geçerli değerlerde", () => {
    expect(gamiDemoFrom("?gami=1&demo=full", true)).toBe("full");
    expect(gamiDemoFrom("?demo=winner", true)).toBe("winner");
    expect(gamiDemoFrom("?demo=full", false)).toBeNull();
    expect(gamiDemoFrom("?demo=xyz", true)).toBeNull();
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PACKAGE_DIR = "packages/sim-ausculta";
const PUBLIC_DIR = `${PACKAGE_DIR}/public`;
const DATA_DIR = `${PACKAGE_DIR}/src/data`;
const RUNTIME_DIR = `${PUBLIC_DIR}/assets/audio/runtime`;
const JSON_NAMES = [
  "auscultation-points.json",
  "cases-auto.json",
  "cases.json",
  "library.json",
  "pediatric-reference.json",
  "sounds-external.json",
  "sounds.json",
  "sources.json",
] as const;
const BRAND_REFERENCES = [
  "brand/appicon.png",
  "brand/apple-touch-icon.png",
  "brand/ege-tip-logo.png",
  "brand/ege-tip-seal-128.png",
  "brand/favicon-32.png",
  "brand/icon-512.png",
  "brand/logo-compact-web.png",
  "brand/logo-horizontal-web.png",
  "brand/logo-icon-transparent.png",
  "brand/logo-icon-web.png",
  "brand/logo-icon-white-web.png",
  "brand/logo-monochrome-web.png",
  "brand/logo-vertical-web.png",
] as const;

function normalize(assetPath: string): string {
  return assetPath.replace(/^\/+/, "");
}

function collect(value: unknown, audio: Set<string>, images: Set<string>): void {
  if (typeof value === "string") {
    const assetPath = normalize(value);
    if (assetPath.startsWith("assets/audio/runtime/") && assetPath.endsWith(".wav")) audio.add(assetPath);
    else if (/^(assets|brand)\/.+\.(png|jpe?g|webp)$/.test(assetPath)) images.add(assetPath);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, audio, images);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collect(item, audio, images);
  }
}

const audio = new Set<string>();
const images = new Set<string>();
for (const name of JSON_NAMES) {
  collect(JSON.parse(readFileSync(`${DATA_DIR}/${name}`, "utf8")) as unknown, audio, images);
}

function missingPaths(paths: readonly string[]): string[] {
  return paths.filter((assetPath) => !existsSync(`${PUBLIC_DIR}/${assetPath}`));
}

const audioPaths = [...audio].sort();
const imagePaths = [...images].sort();
const runtimeCopied = existsSync(RUNTIME_DIR);
const runtimeSuiteName = runtimeCopied
  ? "ses runtime yollarının tamamı diskte"
  : "ses runtime yolları ATLANDI — git-dışı klasör yok; yerelde `pnpm --filter @egemed/sim-ausculta sync:audio` çalıştırın";

describe("Ausculta JSON varlık yolları", () => {
  it("görsel ve ses yolu sayıları kopya bütünlüğünü tutar", () => {
    expect(imagePaths).toHaveLength(4);
    expect(audioPaths).toHaveLength(249);
    expect(BRAND_REFERENCES).toHaveLength(13);
  });

  it("JSON görsel yollarının tamamı diskte vardır", () => {
    expect(missingPaths(imagePaths)).toEqual([]);
  });

  it("marka dosyalarının tamamı diskte vardır", () => {
    expect(missingPaths(BRAND_REFERENCES)).toEqual([]);
  });
});

describe.skipIf(!runtimeCopied)(runtimeSuiteName, () => {
  it("her ses runtime yolu diskte vardır", () => {
    expect(audioPaths.length).toBeGreaterThan(0);
    expect(missingPaths(audioPaths)).toEqual([]);
  });
});

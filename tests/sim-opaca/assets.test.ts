import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ASSET_BASE,
  assetUrl,
  setAssetBase,
} from "../../packages/sim-opaca/src/index";

const PACKAGE_DIR = "packages/sim-opaca";
const PUBLIC_DIR = `${PACKAGE_DIR}/public`;
const MANIFEST_PATH = `${PACKAGE_DIR}/src/data/images.json`;
const XRAY_DIR = `${PUBLIC_DIR}/assets/xray/runtime`;

const BRAND_REFERENCES = [
  "brand/ege-tip-logo.png",
  "brand/logo-horizontal-web.png",
  "brand/logo-icon-web.png",
  "brand/logo-icon-white-web.png",
] as const;

const CT_PREFIX = "assets/ct/";
const XRAY_PREFIX = "assets/xray/runtime/";

type ImageRecord = {
  runtimeUrl?: string | undefined;
  stack?: readonly { frames?: readonly string[] | undefined }[] | undefined;
};

function loadRecords(): readonly ImageRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`images.json okunamadı: ${MANIFEST_PATH} (${detail})`);
  }
  const records = (parsed as { records?: unknown }).records;
  if (!Array.isArray(records)) {
    throw new Error(`${MANIFEST_PATH} içinde records dizisi yok`);
  }
  return records as ImageRecord[];
}

function normalize(assetPath: string): string {
  return assetPath.replace(/^\/+/, "");
}

function missingPaths(paths: readonly string[]): string[] {
  return paths.filter((assetPath) => !existsSync(`${PUBLIC_DIR}/${assetPath}`));
}

const records = loadRecords();

const runtimePaths = new Set<string>();
for (const record of records) {
  if (typeof record.runtimeUrl === "string") runtimePaths.add(normalize(record.runtimeUrl));
  for (const slice of record.stack ?? []) {
    for (const frame of slice.frames ?? []) {
      if (typeof frame === "string") runtimePaths.add(normalize(frame));
    }
  }
}

const paths = [...runtimePaths].sort();
const ctPaths = paths.filter((assetPath) => assetPath.startsWith(CT_PREFIX));
const xrayPaths = paths.filter((assetPath) => assetPath.startsWith(XRAY_PREFIX));
const otherPaths = paths.filter(
  (assetPath) => !assetPath.startsWith(CT_PREFIX) && !assetPath.startsWith(XRAY_PREFIX),
);

const xrayCopied = existsSync(XRAY_DIR);
const xraySuiteName = xrayCopied
  ? "xray runtime yollarının tamamı diskte"
  : "xray runtime yolları ATLANDI — git-dışı klasör yok; yerelde `pnpm --filter @egemed/sim-opaca sync:xray` çalıştırın";

describe("images.json görüntü yolları", () => {
  it("tüm yollar CT veya xray ailesine aittir", () => {
    expect(otherPaths, "beklenmeyen varlık ailesi").toEqual([]);
  });

  it("manifest kapsamı beklenen sayıdadır (kopya bütünlüğü)", () => {
    expect(records.length).toBe(593);
    expect(paths.length).toBe(735);
    expect(ctPaths.length).toBe(144);
    expect(xrayPaths.length).toBe(591);
  });

  it("CT görüntü ve karelerinin tamamı diskte vardır", () => {
    expect(ctPaths.length).toBeGreaterThan(0);
    expect(missingPaths(ctPaths)).toEqual([]);
  });

  it("marka referanslarının tamamı diskte vardır", () => {
    expect(missingPaths(BRAND_REFERENCES)).toEqual([]);
  });
});

describe.skipIf(!xrayCopied)(xraySuiteName, () => {
  it("her xray çalışma zamanı yolu diskte vardır", () => {
    expect(xrayPaths.length).toBeGreaterThan(0);
    expect(missingPaths(xrayPaths)).toEqual([]);
  });
});

describe("assetUrl (marka ve görüntü yolları)", () => {
  afterEach(() => {
    setAssetBase(DEFAULT_ASSET_BASE);
  });

  it("göreli marka yolunu assetBase üzerinden çözümler", () => {
    setAssetBase("/sims/opaca/");
    expect(assetUrl("brand/logo-horizontal-web.png")).toBe("/sims/opaca/brand/logo-horizontal-web.png");
    expect(assetUrl("brand/logo-icon-white-web.png")).toBe("/sims/opaca/brand/logo-icon-white-web.png");
  });

  it("mutlak yol önekini kaldırıp assetBase ile birleştirir", () => {
    setAssetBase("/custom/base/");
    expect(assetUrl("/assets/brand/logo.png")).toBe("/custom/base/assets/brand/logo.png");
  });

  it("https URL'lerini olduğu gibi döndürür", () => {
    const url = "https://example.test/logo.png";
    expect(assetUrl(url)).toBe(url);
  });
});

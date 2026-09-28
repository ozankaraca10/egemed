import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PACKAGE_DIR = "packages/sim-ausculta";
const PUBLIC_DIR = `${PACKAGE_DIR}/public`;
const DATA_DIR = `${PACKAGE_DIR}/src/data`;
const RUNTIME_DIR = `${PUBLIC_DIR}/assets/audio/runtime`;
const RUNTIME_PREFIX = "assets/audio/runtime/";
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
    if (assetPath.startsWith(RUNTIME_PREFIX) && assetPath.endsWith(".wav")) audio.add(assetPath);
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
  // T196: anahtarlı vaka dosyaları sunucu tarafı bankadadır.
  const dir = name.startsWith("cases") ? "packages/assessment-bank/data/ausculta" : DATA_DIR;
  collect(JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as unknown, audio, images);
}

function missingPaths(paths: readonly string[]): string[] {
  return paths.filter((assetPath) => !existsSync(`${PUBLIC_DIR}/${assetPath}`));
}

/** Git-dışı runtime grupları: paket içi (heart/lung/mixed) ve dış veri setleri (external/<id>).
 *  Grup klasörü diskte yoksa (taze kopya) o grup ATLANIR — `sync:audio` / `import:kauh` ile doldurulur. */
function runtimeGroupOf(assetPath: string): string {
  const rest = assetPath.slice(RUNTIME_PREFIX.length);
  const parts = rest.split("/");
  const head = parts[0] ?? "";
  return head === "external" ? `external/${parts[1] ?? ""}` : head;
}

const audioPaths = [...audio].sort();
const imagePaths = [...images].sort();
const runtimeGroups = [...new Set(audioPaths.map(runtimeGroupOf))]
  .sort()
  .map((group) => ({
    group,
    paths: audioPaths.filter((assetPath) => runtimeGroupOf(assetPath) === group),
    present: existsSync(`${RUNTIME_DIR}/${group}`),
  }));
const activeGroups = runtimeGroups.filter((entry) => entry.present);
const absentGroups = runtimeGroups.filter((entry) => !entry.present);
const groupList = (entries: typeof runtimeGroups): string => entries.map((entry) => entry.group).join(", ");
const runtimeSuiteName =
  activeGroups.length > 0
    ? `ses runtime gruplarının tamamı diskte (${groupList(activeGroups)}${absentGroups.length > 0 ? `; atlandı: ${groupList(absentGroups)}` : ""})`
    : "ses runtime grupları ATLANDI — git-dışı klasörler yok; yerelde `pnpm --filter @egemed/sim-ausculta sync:audio` ve `pnpm --filter @egemed/sim-ausculta import:kauh` çalıştırın";

describe("Ausculta JSON varlık yolları", () => {
  it("görsel ve ses yolu sayıları kopya bütünlüğünü tutar", () => {
    expect(imagePaths).toHaveLength(4);
    expect(audioPaths).toHaveLength(347);
    expect(BRAND_REFERENCES).toHaveLength(13);
  });

  it("JSON görsel yollarının tamamı diskte vardır", () => {
    expect(missingPaths(imagePaths)).toEqual([]);
  });

  it("marka dosyalarının tamamı diskte vardır", () => {
    expect(missingPaths(BRAND_REFERENCES)).toEqual([]);
  });
});

describe(runtimeSuiteName, () => {
  it("diskte bulunan her runtime grubunun tüm dosyaları vardır", () => {
    expect(missingPaths(activeGroups.flatMap((entry) => entry.paths))).toEqual([]);
  });

  it("git-dışı gruplar paketlenmiş seslerle karışmaz (heart/lung/mixed pakete dahil)", () => {
    for (const group of ["heart", "lung", "mixed"]) {
      expect(runtimeGroups.some((entry) => entry.group === group)).toBe(true);
    }
    expect(runtimeGroups.some((entry) => entry.group.startsWith("external/"))).toBe(true);
  });
});

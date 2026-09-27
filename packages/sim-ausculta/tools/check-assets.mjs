import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { console, process } = globalThis;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(packageRoot, "src/data");

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
];

function normalize(assetPath) {
  return assetPath.replace(/^\/+/, "");
}

function groupOf(assetPath) {
  if (assetPath.startsWith("assets/audio/runtime/")) return "assets/audio/runtime";
  if (assetPath.startsWith("assets/body/")) return "assets/body";
  if (assetPath.startsWith("brand/")) return "brand";
  return "diğer";
}

function collect(value, audio, images) {
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

const audio = new Set();
const images = new Set();
// T196: anahtarlı vaka dosyaları sunucu tarafı bankadadır; ses yolları oradan da toplanır.
const bankDir = join(packageRoot, "../assessment-bank/data/ausculta");
const manifestPaths = [
  ...readdirSync(dataDir).filter((name) => name.endsWith(".json") && name !== "fixture.json").map((name) => join(dataDir, name)),
  ...readdirSync(bankDir).filter((name) => name.endsWith(".json")).map((name) => join(bankDir, name)),
].sort();
for (const manifestPath of manifestPaths) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`JSON okunamadı: ${manifestPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  collect(manifest, audio, images);
}

const expected = [...audio, ...images, ...BRAND_REFERENCES];
const missing = [];
const totals = new Map();
for (const assetPath of expected) {
  const group = groupOf(assetPath);
  const groupTotals = totals.get(group) ?? { total: 0, missing: 0 };
  groupTotals.total += 1;
  if (!existsSync(join(packageRoot, "public", assetPath))) {
    groupTotals.missing += 1;
    missing.push(assetPath);
  }
  totals.set(group, groupTotals);
}

console.log("Ausculta varlık kapısı (runtime dahil zorunlu)");
console.log(`JSON: ${manifestPaths.length} dosya, ${audio.size} ses yolu, ${images.size} görsel yolu, ${BRAND_REFERENCES.length} marka`);
for (const [group, groupTotals] of [...totals.entries()].sort()) {
  console.log(`  ${group}: ${groupTotals.total - groupTotals.missing}/${groupTotals.total}`);
}

if (missing.length > 0) {
  console.error(`Sonuç: ${missing.length} eksik`);
  for (const assetPath of missing.sort().slice(0, 20)) console.error(`  ${assetPath}`);
  if (missing.length > 20) console.error(`  (+${missing.length - 20} daha)`);
  process.exit(1);
}

console.log(`Sonuç: ${missing.length} eksik`);

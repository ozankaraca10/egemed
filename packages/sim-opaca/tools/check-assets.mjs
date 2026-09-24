import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { console, process } = globalThis;

const BRAND_REFERENCES = [
  "brand/ege-tip-logo.png",
  "brand/logo-horizontal-web.png",
  "brand/logo-icon-web.png",
  "brand/logo-icon-white-web.png",
];

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(packageRoot, "src/data/images.json");

function groupOf(assetPath) {
  if (assetPath.startsWith("assets/xray/runtime/")) return "assets/xray/runtime";
  if (assetPath.startsWith("assets/ct/")) return "assets/ct";
  if (assetPath.startsWith("brand/")) return "brand";
  return "diğer";
}

function normalize(assetPath) {
  return assetPath.replace(/^\/+/, "");
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`images.json okunamadı: ${manifestPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const records = Array.isArray(manifest.records) ? manifest.records : [];
const runtimePaths = new Set();
for (const record of records) {
  if (typeof record.runtimeUrl === "string") runtimePaths.add(normalize(record.runtimeUrl));
  for (const slice of Array.isArray(record.stack) ? record.stack : []) {
    for (const frame of Array.isArray(slice.frames) ? slice.frames : []) {
      if (typeof frame === "string") runtimePaths.add(normalize(frame));
    }
  }
}

const expected = [...runtimePaths, ...BRAND_REFERENCES];
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

console.log("Opaca varlık kapısı (xray dahil zorunlu)");
console.log(`images.json: ${records.length} kayıt, ${runtimePaths.size} benzersiz çalışma zamanı yolu`);
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

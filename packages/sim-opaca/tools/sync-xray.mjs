import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { console, process } = globalThis;

const DEFAULT_SOURCE_DIR = "/Users/ozankaraca/Documents/EGEMED CLIX/egemed-opaca";
const ASSET_DIR = "public/assets/xray/runtime";

const sourceRoot = process.env.OPACA_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
const sourceDir = join(sourceRoot, ASSET_DIR);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = join(packageRoot, ASSET_DIR);

if (!existsSync(sourceDir)) {
  console.error(`Kaynak bulunamadı: ${sourceDir}`);
  console.error("Opaca kaynak kopyasının kökünü OPACA_SOURCE_DIR ile verin.");
  process.exit(1);
}

function walk(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files.sort();
}

mkdirSync(targetDir, { recursive: true });

const files = walk(sourceDir);
let copied = 0;
let unchanged = 0;
let copiedBytes = 0;

for (const file of files) {
  const dest = join(targetDir, relative(sourceDir, file));
  const sourceSize = statSync(file).size;
  if (existsSync(dest) && statSync(dest).size === sourceSize) {
    unchanged += 1;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  copied += 1;
  copiedBytes += sourceSize;
}

// T321b: EGEMED CLIX kaynağına yazılmaz; sonradan eklenen açık erişim görüntüleri (Europe PMC, CC BY)
// ayrı bir ek kaynaktan düz klasör olarak kopyalanır.
const DEFAULT_EXTRA_DIR = "/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-tools/opaca-yeni/aktarim/runtime";
const extraDir = process.env.OPACA_EXTRA_SOURCE_DIR ?? DEFAULT_EXTRA_DIR;
if (existsSync(extraDir)) {
  for (const file of walk(extraDir)) {
    const dest = join(targetDir, relative(extraDir, file));
    const sourceSize = statSync(file).size;
    if (existsSync(dest) && statSync(dest).size === sourceSize) {
      unchanged += 1;
      continue;
    }
    copyFileSync(file, dest);
    copied += 1;
    copiedBytes += sourceSize;
  }
  console.log(`Ek kaynak: ${extraDir}`);
}

const missing = files.filter((file) => !existsSync(join(targetDir, relative(sourceDir, file))));
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log(`Kaynak: ${sourceDir}`);
console.log(`Hedef:  ${targetDir}`);
console.log(`Toplam: ${files.length} dosya`);
console.log(`Kopyalanan: ${copied} (${megabytes(copiedBytes)})`);
console.log(`Değişmeyen: ${unchanged}`);
console.log("Hedefteki fazla dosyalar silinmedi.");

if (missing.length > 0) {
  console.error(`Eksik: ${missing.length} dosya`);
  for (const file of missing.slice(0, 20)) console.error(`  ${relative(sourceDir, file)}`);
  if (missing.length > 20) console.error(`  (+${missing.length - 20} daha)`);
  process.exit(1);
}

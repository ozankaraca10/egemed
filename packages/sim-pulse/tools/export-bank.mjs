/**
 * T215 (ADR-009, A3.1): Pulse vaka bankası dışa aktarımı.
 *
 * Tek doğruluk kaynağı çalışan runtime kaynağıdır (`vendor/model.js` +
 * `vendor/curriculum.js`); bu betik yalnız okur ve
 * `packages/assessment-bank/data/pulse/items.json` dosyasını üretir. Doğru
 * cevaplar/gerekçeler anahtarlı veri olarak SUNUCU bankasında kalır; üretilen
 * dosya istemciye doğrudan servis edilmez.
 *
 * Yükleme deseni `tests/sim-pulse/patterns-14-23.test.ts` ile aynıdır: vendor
 * betikleri UMD dalına kaymaması için `module` tanımsız `new Function` ile
 * çalıştırılır. Çıktı deterministiktir (sabit anahtar sırası, 2 boşluk girinti);
 * ikinci çalıştırma git diff bırakmaz.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { console, process } = globalThis;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const VENDOR = resolve(ROOT, "packages/sim-pulse/src/runtime/vendor");
const OUTPUT = resolve(ROOT, "packages/assessment-bank/data/pulse/items.json");

/** Vendor betiğini (`env` alan IIFE) Node'da yükler; `module` bilinçli olarak tanımsızdır. */
export function runVendor(file, env) {
  const source = readFileSync(resolve(VENDOR, file), "utf8").replace("export default function run", "return function run");
  const run = new Function("module", source)(undefined);
  run(env);
}

/** Model + müfredatı yükleyip `window.PulseCurriculum` nesnesini döndürür. */
export function loadCurriculum() {
  const window = {};
  runVendor("model.js", { window });
  runVendor("curriculum.js", { window });
  return window.PulseCurriculum;
}

function toItem(item, section) {
  return {
    id: item.id,
    section,
    mode: item.mode,
    stem: item.stem,
    question: item.question,
    options: [...item.options],
    correct: item.correct,
    explanations: [...item.explanations],
    feedback: item.feedback,
    objectiveIds: [...item.objectiveIds],
    sourceIds: [...item.sourceIds],
    vitals: item.vitals.map(({ k, v }) => ({ k, v })),
    ecg: {
      mode: item.ecg.mode,
      options: { ...item.ecg.options },
      leads: [...item.ecg.leads],
      start: item.ecg.start,
      seconds: item.ecg.seconds,
    },
  };
}

/** Müfredatı banka biçimine projeksiyonlar (anahtarlı alanlar aynen taşınır). */
export function projectBank(curriculum) {
  const items = [
    ...curriculum.cases.map((item) => toItem(item, "case")),
    ...curriculum.questions.map((item) => toItem(item, "quiz")),
  ];
  if (!Number.isInteger(curriculum.version) || !Number.isInteger(curriculum.sessionSize) || curriculum.sessionSize < 1) {
    throw new Error("Pulse müfredat sürümü/oturum boyutu geçersiz");
  }
  if (items.length === 0 || items.some((item) => item.options.length !== 5 || item.explanations.length !== 5)) {
    throw new Error("Pulse maddeleri eksik: her madde 5 seçenek ve 5 gerekçe taşımalı");
  }
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error("Pulse madde kimlikleri benzersiz değil");
  return { version: curriculum.version, sessionSize: curriculum.sessionSize, count: items.length, items };
}

function main() {
  const bank = projectBank(loadCurriculum());
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
  return bank;
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const bank = main();
  console.log(`Pulse bankası yazıldı: ${bank.items.length} madde (v${bank.version}, oturum ${bank.sessionSize})`);
}

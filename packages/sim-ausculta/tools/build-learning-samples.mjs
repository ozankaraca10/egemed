import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLearningSamples } from "./learning-samples.mjs";

const { console } = globalThis;

/**
 * T259 — `src/data/learning-samples.json` üreticisi: kütüphane konusu → en fazla 5
 * sıralı ses kimliği (gerçekler önce, farklı hastalar). Girdiler: kütüphane, paket içi
 * manken kayıtları ve içe aktarılmış dış kayıtlar. Deterministik; `import:kauh` ve
 * `import:sprsound` sonrasında çalıştırılır (package.json: `learning:samples`).
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(PACKAGE_ROOT, "src/data");
const OUTPUT_PATH = join(DATA_DIR, "learning-samples.json");

function readJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));
}

function main() {
  const library = readJson("library.json");
  const records = [...readJson("sounds.json").records, ...readJson("sounds-external.json").records];
  const topics = library.groups.flatMap((group) => group.items);
  const data = buildLearningSamples(topics, records);
  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));

  const byId = new Map(records.map((record) => [record.id, record]));
  console.log("Öğrenme örnekleri → src/data/learning-samples.json");
  console.log(`Konu: ${topics.length}, kayıt havuzu: ${records.length}`);
  for (const topic of topics) {
    const ids = data.topics[topic.key];
    const origins = ids.map((id) => byId.get(id)?.patient?.origin ?? "?");
    const real = origins.filter((origin) => origin === "real").length;
    console.log(`  ${topic.key}: ${ids.length} örnek (gerçek ${real}, manken ${ids.length - real})`);
  }
}

main();

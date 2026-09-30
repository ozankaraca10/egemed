import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEARNING_SAMPLES, learningSamplesFor } from "../../packages/sim-ausculta/src/data/learningSamples";
import { buildLearningSamples, patientKeyOf } from "../../packages/sim-ausculta/tools/learning-samples.mjs";

/** T259 — öğrenme örneği listesi (tıbbi veri doğrulama: kapsam, hasta tekrarı, KVKK).
 *  Liste dosyası `learning:samples` üreticisiyle deterministik üretilir; burada hem
 *  dosyanın güncelliği hem de plan kuralları (≤5, farklı hasta, gerçekler önce)
 *  doğrulanır. */

const DATA_DIR = "packages/sim-ausculta/src/data";

interface PatientShape {
  origin: "real" | "manikin";
  ageYears?: number | null;
  sex?: "F" | "M" | null;
  diagnosis?: string | null;
}

interface RecordShape {
  id: string;
  category: string;
  acousticFinding: string;
  sourceDataset: string;
  sourceFile: string;
  validationStatus: string;
  mappingStatus?: string;
  internalSourceId?: string;
  internalPatientId?: string;
  patient?: PatientShape;
}

interface TopicShape {
  key: string;
  category: string;
  acousticFinding: string;
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${DATA_DIR}/${name}`, "utf8")) as unknown;
}

const library = readJson("library.json") as { groups: { items: TopicShape[] }[] };
const sounds = readJson("sounds.json") as { records: RecordShape[] };
const external = readJson("sounds-external.json") as { records: RecordShape[] };
const records = [...sounds.records, ...external.records];
const topics = library.groups.flatMap((group) => group.items);
const byId = new Map(records.map((record) => [record.id, record]));

describe("öğrenme örnek listesi", () => {
  it("dosya, üreticinin deterministik çıktısıyla birebir", () => {
    expect(LEARNING_SAMPLES).toEqual(buildLearningSamples(topics, records).topics);
  });

  it("her konuda 1–5 örnek ve tüm kimlikler ses kayıtlarında", () => {
    for (const topic of topics) {
      const ids = learningSamplesFor(topic.key);
      expect(ids.length, topic.key).toBeGreaterThan(0);
      expect(ids.length, topic.key).toBeLessThanOrEqual(5);
      for (const id of ids) expect(byId.get(id), `${topic.key}/${id}`).toBeDefined();
    }
    expect(learningSamplesFor("konu.yok")).toEqual([]);
  });

  it("gerçek kayıtlar önce gelir ve gerçek örnekler farklı hastalardandır", () => {
    for (const topic of topics) {
      const list = learningSamplesFor(topic.key).map((id) => {
        const record = byId.get(id);
        if (record === undefined) throw new Error(`kayıt yok: ${id}`);
        return record;
      });
      const firstManikin = list.findIndex((record) => record.patient?.origin === "manikin");
      if (firstManikin >= 0) {
        expect(
          list.slice(firstManikin).every((record) => record.patient?.origin === "manikin"),
          topic.key,
        ).toBe(true);
      }
      const keys = list.filter((record) => record.patient?.origin === "real").map(patientKeyOf);
      expect(new Set(keys).size, topic.key).toBe(keys.length);
    }
  });

  it("akciğer konularında en az 4 farklı gerçek hasta önde; plevral sürtünmede manken kalır", () => {
    const lungTopics = topics.filter((topic) => topic.category === "lung");
    expect(lungTopics.map((topic) => topic.key).sort()).toEqual([
      "lung.coarse_crackles",
      "lung.fine_crackles",
      "lung.normal",
      "lung.pleural_rub",
      "lung.rhonchi",
      "lung.wheezing",
    ]);
    for (const topic of lungTopics) {
      const list = learningSamplesFor(topic.key).map((id) => byId.get(id));
      expect(list, topic.key).toHaveLength(5);
      if (topic.key === "lung.pleural_rub") {
        // Kaynakta gerçek plevral sürtünme kaydı yok: mevcut manken kayıtları kalır.
        expect(list.every((record) => record?.patient?.origin === "manikin")).toBe(true);
        continue;
      }
      // Ronküste kontrol grubu elendiği için 4 gerçek + 1 manken olabilir; gerçekler önce gelir.
      const real = list.filter((record) => record?.patient?.origin === "real");
      expect(real.length, topic.key).toBeGreaterThanOrEqual(4);
      expect(list.slice(0, real.length).every((record) => record?.patient?.origin === "real"), topic.key).toBe(true);
      expect(
        real.every((record) => (record?.patient?.ageYears ?? null) !== null && (record?.patient?.diagnosis ?? "") !== ""),
        topic.key,
      ).toBe(true);
      if (topic.acousticFinding !== "normal") {
        // Anormal bulguda "Kontrol grubu (hastalık yok)" etiketi öğrenciyi yanıltır.
        expect(list.some((record) => /^Kontrol grubu/.test(record?.patient?.diagnosis ?? "")), topic.key).toBe(false);
      }
    }
  });

  it("kalp normal/üfürüm konularında CirCor gerçek hastalar önde (T260)", () => {
    const expected: [string, number][] = [
      ["heart.normal", 5],
      ["heart.murmur.early_systolic", 5],
      // Pansistolik yaklaşık eşleme (educational_mapping) örnek sayılmaz: 4 gerçek + 1 manken.
      ["heart.murmur.mid_systolic", 4],
      ["heart.murmur.late_systolic", 1],
    ];
    for (const [key, realCount] of expected) {
      const list = learningSamplesFor(key).map((id) => {
        const record = byId.get(id);
        if (record === undefined) throw new Error(`kayıt yok: ${id}`);
        return record;
      });
      expect(list, key).toHaveLength(5);
      const real = list.filter((record) => record.patient?.origin === "real");
      expect(real.length, key).toBe(realCount);
      expect(list.slice(0, real.length).every((record) => record.patient?.origin === "real"), key).toBe(true);
      expect(new Set(real.map((record) => patientKeyOf(record))).size, key).toBe(real.length);
      expect(list.some((record) => record.mappingStatus === "educational_mapping"), key).toBe(false);
    }
  });

  it("örneklerin gösterilen hasta alanlarında hasta numarası/dosya yolu yok (KVKK)", () => {
    for (const topic of topics) {
      for (const id of learningSamplesFor(topic.key)) {
        const record = byId.get(id);
        if (record === undefined || record.patient === undefined) continue;
        const shown = JSON.stringify(record.patient);
        expect(shown, id).not.toMatch(/kauh\/|sprsound\/|\bDP\d+/i);
        expect(shown, id).not.toMatch(/[0-9]{5,}/u);
      }
    }
  });
});

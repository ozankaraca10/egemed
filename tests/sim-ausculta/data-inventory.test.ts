import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DATA_DIR = "packages/sim-ausculta/src/data";
const JSON_NAMES = [
  "auscultation-points.json",
  "fixture.json",
  "library.json",
  "pediatric-reference.json",
  "sounds-external.json",
  "sounds.json",
  "sources.json",
] as const;

/** T196: anahtarlı vaka dosyaları sunucu tarafı bankadadır. */
const BANK_DIR = "packages/assessment-bank/data/ausculta";

function load(name: string): unknown {
  const dir = name.startsWith("cases") ? BANK_DIR : DATA_DIR;
  return JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as unknown;
}

function recordsOf(value: unknown): readonly { id?: unknown; runtimeUrl?: unknown }[] {
  const records = (value as { records?: unknown }).records;
  if (!Array.isArray(records)) throw new Error("records dizisi yok");
  return records as { id?: unknown; runtimeUrl?: unknown }[];
}

const sounds = load("sounds.json") as { count?: unknown; records?: unknown };
const external = load("sounds-external.json") as { count?: unknown; records?: unknown };
const cases = load("cases.json") as { cases?: unknown };
const casesAuto = load("cases-auto.json") as { count?: unknown; cases?: unknown };
const points = load("auscultation-points.json") as { points?: unknown };
const library = load("library.json") as { groups?: { items?: { key?: unknown }[] }[] };
const pediatric = load("pediatric-reference.json") as { rows?: unknown };
const sources = load("sources.json") as { datasets?: unknown; inventory?: unknown };

const soundRecords = recordsOf(sounds);
const externalRecords = recordsOf(external);
const libraryItems = (library.groups ?? []).flatMap((group) => group.items ?? []);

interface ExternalRecordShape {
  sourceDataset: string;
  mappingStatus: string;
  mappingNote: string;
  simulationLocation: string;
  recordedLocation: string;
  nativeFilter: string;
  gender: string;
  sourceFile: string;
  sampleRate: number;
  channels: number;
}

const kauhRecords = ((external.records ?? []) as ExternalRecordShape[]).filter(
  (record) => record.sourceDataset === "kauh-v3",
);

describe("Ausculta veri envanteri", () => {
  it("kopyalanan JSON dosyaları okunur", () => {
    for (const name of JSON_NAMES) {
      expect(readFileSync(`${DATA_DIR}/${name}`, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("kayıt sayıları kaynak kopyasıyla aynıdır", () => {
    expect(sounds.count).toBe(245);
    expect(soundRecords).toHaveLength(245);
    expect(external.count).toBe(90);
    expect(externalRecords).toHaveLength(90);
    expect(cases.cases).toHaveLength(23);
    expect(casesAuto.count).toBe(176);
    expect(casesAuto.cases).toHaveLength(176);
    expect(points.points).toHaveLength(17);
    expect(library.groups).toHaveLength(3);
    expect(libraryItems).toHaveLength(20);
    expect(pediatric.rows).toHaveLength(6);
    expect(sources.datasets).toHaveLength(3);
    expect(sources.inventory).toHaveLength(2);
  });

  it("KAUH posterior kayıtları KVKK'ya uygun, nokta eşlemeli ve onay bekler (T227)", () => {
    expect(kauhRecords).toHaveLength(86);
    const ids = (points.points as { id: string }[]).map((point) => point.id);
    for (const record of kauhRecords) {
      expect(record.mappingStatus).toBe("pending_faculty");
      expect(record.mappingNote.length).toBeGreaterThan(10);
      expect(ids).toContain(record.simulationLocation);
      expect(record.simulationLocation.endsWith("_posterior")).toBe(true);
      expect(record.recordedLocation).toMatch(/^P[RL][UML]$/);
      expect(record.nativeFilter).toBe("diaphragm");
      expect(["F", "M"]).toContain(record.gender);
      expect(record.sampleRate).toBe(4000);
      expect(record.channels).toBe(1);
      // Yaş/ad kaydı yok: özgün dosya adı yerine redakte biçim kullanılır.
      expect(record.sourceFile).toMatch(/^kauh\/DP\d+$/);
      expect(record).not.toHaveProperty("age");
      expect(JSON.stringify(record)).not.toMatch(/"(age|patientAge|patientName)"/i);
    }
  });

  it("her ses kaydında id ve runtimeUrl vardır", () => {
    for (const record of [...soundRecords, ...externalRecords]) {
      expect(typeof record.id).toBe("string");
      expect(record.id).not.toBe("");
      expect(typeof record.runtimeUrl).toBe("string");
      expect(String(record.runtimeUrl).startsWith("assets/audio/runtime/")).toBe(true);
    }
  });

  it("kütüphane ses anahtarları doludur", () => {
    const keys = libraryItems.map((item) => item.key);
    expect(keys.every((key) => typeof key === "string" && key.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

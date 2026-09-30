import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DATA_DIR = "packages/sim-ausculta/src/data";
const JSON_NAMES = [
  "auscultation-points.json",
  "learning-samples.json",
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
const samples = load("learning-samples.json") as { version?: unknown; topics?: Record<string, unknown> };
const cases = load("cases.json") as { cases?: unknown };
const casesAuto = load("cases-auto.json") as { count?: unknown; cases?: unknown };
const points = load("auscultation-points.json") as { points?: unknown };
const library = load("library.json") as { groups?: { items?: { key?: unknown }[] }[] };
const pediatric = load("pediatric-reference.json") as { rows?: unknown };
const sources = load("sources.json") as { datasets?: unknown; inventory?: unknown };

const soundRecords = recordsOf(sounds);
const externalRecords = recordsOf(external);
const libraryItems = (library.groups ?? []).flatMap((group) => group.items ?? []);

interface PatientShape {
  origin: string;
  ageYears?: number | null;
  sex?: string | null;
  diagnosis?: string | null;
  diagnosisSource?: string;
  soundTypeRaw?: string | null;
  site?: string | null;
}

interface ExternalRecordShape {
  id: string;
  sourceDataset: string;
  acousticFinding: string;
  mappingStatus: string;
  mappingNote: string;
  simulationLocation: string;
  recordedLocation: string;
  nativeFilter: string;
  gender: string;
  sourceFile: string;
  internalSourceId: string;
  internalPatientId?: string;
  population: string;
  sampleRate: number;
  channels: number;
  patient: PatientShape;
}

/** T259: gösterilen hasta alanı KVKK'ya uygun mu (yaş/cinsiyet/tanı/yer; kimlik yok). */
function expectShownPatient(record: ExternalRecordShape): void {
  expect(record.patient.origin).toBe("real");
  expect(typeof record.patient.ageYears).toBe("number");
  expect(record.patient.ageYears).toBeGreaterThanOrEqual(0);
  expect(record.patient.ageYears).toBeLessThanOrEqual(120);
  expect(["F", "M"]).toContain(record.patient.sex);
  expect(record.patient.diagnosis).toBeTruthy();
  expect(record.patient.diagnosisSource).toBeTruthy();
  expect(record.patient.soundTypeRaw).toBeTruthy();
  expect(record.patient.site).toBeTruthy();
  const shown = JSON.stringify(record.patient);
  expect(shown).not.toMatch(/kauh\/|sprsound\/|\bDP\d+/i);
  expect(shown).not.toMatch(/[0-9]{5,}/u);
}

const kauhRecords = ((external.records ?? []) as ExternalRecordShape[]).filter(
  (record) => record.sourceDataset === "kauh-v3",
);

const sprsoundRecords = ((external.records ?? []) as ExternalRecordShape[]).filter(
  (record) => record.sourceDataset === "sprsound",
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
    expect(external.count).toBe(102);
    expect(externalRecords).toHaveLength(102);
    expect(cases.cases).toHaveLength(24);
    expect(casesAuto.count).toBe(176);
    expect(casesAuto.cases).toHaveLength(176);
    expect(points.points).toHaveLength(17);
    expect(library.groups).toHaveLength(3);
    expect(libraryItems).toHaveLength(20);
    expect(pediatric.rows).toHaveLength(6);
    expect(sources.datasets).toHaveLength(4);
    expect(sources.inventory).toHaveLength(2);
    expect(samples.version).toBe(1);
    expect(Object.keys(samples.topics ?? {})).toHaveLength(libraryItems.length);
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
      // Ad ve hasta numarası gösterilen alanlara girmez: özgün dosya adı yerine redakte
      // biçim; yaş yalnız T259 hasta alanında (patient.ageYears).
      expect(record.sourceFile).toMatch(/^kauh\/DP\d+$/);
      expect(record).not.toHaveProperty("age");
      expect(JSON.stringify(record)).not.toMatch(/"(age|patientAge|patientName|patientNo)"/i);
      expectShownPatient(record);
      expect(record.patient.diagnosisSource).toBe("KAUH tablosu");
      expect(record.patient.site).toBeTruthy();
      expect(record.patient.site).toContain("posterior");
    }
  });

  it("SPRSound pediatrik posterior kayıtları KVKK'ya uygun ve onay bekler (T234)", () => {
    expect(sprsoundRecords).toHaveLength(12);
    const ids = (points.points as { id: string }[]).map((point) => point.id);
    for (const record of sprsoundRecords) {
      expect(record.mappingStatus).toBe("pending_faculty");
      expect(record.mappingNote).toContain("SPRSound");
      expect(record.population).toBe("pediatric");
      expect(ids).toContain(record.simulationLocation);
      expect(record.simulationLocation.endsWith("_posterior")).toBe(true);
      expect(["p1", "p3"]).toContain(record.recordedLocation);
      expect(record.nativeFilter).toBe("unspecified");
      expect(record.sampleRate).toBe(8000);
      expect(record.channels).toBe(1);
      // Hasta numarası gösterilen alanlara girmez: yalnız kayıt numarası redakte biçimde;
      // hasta no iç hasta anahtarında (internalPatientId, seçim için; KVKK: gösterilmez).
      expect(record.sourceFile).toMatch(/^sprsound\/\d+$/);
      expect(record.internalSourceId).toMatch(/^sprsound-\d+$/);
      expect(record.internalPatientId).toMatch(/^sprsound-patient-\d+$/);
      expect(record).not.toHaveProperty("age");
      expect(record).not.toHaveProperty("gender");
      expect(JSON.stringify(record)).not.toMatch(/"(age|patientAge|patientName|patientNo|gender)"/i);
      expect(["rhonchi", "wheezing"]).toContain(record.acousticFinding);
      expect(record.id).toMatch(new RegExp(`^sprsound_${record.acousticFinding}_${record.simulationLocation}_\\d{3}$`));
      expectShownPatient(record);
      expect(record.patient.diagnosisSource).toBe("SPRSound hasta özeti");
      expect(record.patient.soundTypeRaw).toBe(record.acousticFinding === "rhonchi" ? "Rhonchi" : "Wheeze");
      expect(["Sol bölge (posterior)", "Sağ bölge (posterior)"]).toContain(record.patient.site);
    }
  });

  it("CirCor gerçek hasta kayıtları hasta alanını taşır (T259)", () => {
    const circor = (externalRecords as ExternalRecordShape[]).filter(
      (record) => record.sourceDataset === "physionet-circor",
    );
    expect(circor).toHaveLength(4);
    for (const record of circor) {
      expect(record.patient.origin).toBe("real");
      expect(record.patient.diagnosis).toBeNull();
      expect(record.patient.ageYears).toBeNull();
      expect(record.patient.sex).toBeNull();
      expect(record.patient.diagnosisSource).toContain("CirCor");
    }
  });

  it("manken kayıtlarında hasta alanı origin manikin (T259)", () => {
    const manikin = soundRecords as { gender?: string; patient: PatientShape }[];
    expect(manikin).toHaveLength(245);
    for (const record of manikin) {
      expect(record.patient).toBeDefined();
      expect(record.patient.origin).toBe("manikin");
      expect(["F", "M", null]).toContain(record.patient.sex);
      if (record.gender === "F" || record.gender === "M") expect(record.patient.sex).toBe(record.gender);
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

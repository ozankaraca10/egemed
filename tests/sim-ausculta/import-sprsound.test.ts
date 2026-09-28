import { describe, expect, it } from "vitest";
import {
  MIN_COVERAGE,
  coverageOf,
  findingForAnnotation,
  parseSprsoundFileName,
  pointForLocation,
  selectSprsoundRecords,
  type SprsoundAnnotation,
} from "../../packages/sim-ausculta/tools/import-sprsound.mjs";

/** T234 — SPRSound aktarım aracının saf yardımcıları; sentetik anotasyon, dosya sistemi yok. */

type EventType = "Normal" | "Rhonchi" | "Wheeze" | "Stridor" | "Fine Crackle" | "Coarse Crackle" | "Wheeze+Crackle";

function annotation(record: string, events: readonly { start: number; end: number; type: EventType }[]): SprsoundAnnotation {
  return { record_annotation: record, event_annotation: events.map((event) => ({ ...event, start: String(event.start), end: String(event.end) })) };
}

/** Kapsamı %40 olan, süresi 10 sn'lik tek tür "saf" kayıt. */
function pureEvents(type: EventType, durationMs = 10_000): { start: number; end: number; type: EventType }[] {
  return [
    { start: 0, end: 1000, type: "Normal" },
    { start: 1000, end: 1000 + Math.round(durationMs * 0.4), type },
  ];
}

function candidate(fileName: string, location: "p1" | "p3", type: EventType, durationMs = 10_000, record = "CAS") {
  return { fileName, recordNo: fileName.match(/_(\d+)\.wav$/u)?.[1] ?? fileName, location, annotation: annotation(record, pureEvents(type, durationMs)), durationSec: 10 };
}

describe("SPRSound dosya adı çözümleme (KVKK)", () => {
  it("5 alanı çözer; kayda yalnız konum ve kayıt numarası geçer", () => {
    expect(parseSprsoundFileName("65097128_5.6_1_p1_2242.wav")).toEqual({
      patientNo: "65097128",
      age: "5.6",
      gender: "1",
      location: "p1",
      recordNo: "2242",
    });
    expect(parseSprsoundFileName("41132911_3.0_0_p3_6065.wav")).toMatchObject({ location: "p3", recordNo: "6065" });
  });

  it("eksik/bozuk adları reddeder", () => {
    expect(parseSprsoundFileName("65097128_5.6_1_p1.wav")).toBeNull();
    expect(parseSprsoundFileName("65097128_5.6_1_p1_2242.json")).toBeNull();
    expect(parseSprsoundFileName("bozuk-dosya.wav")).toBeNull();
  });
});

describe("SPRSound seçim kuralı: saf kayıt", () => {
  it("yalnız Normal olayları olan kaydı eler", () => {
    expect(findingForAnnotation(annotation("Normal", [{ start: 0, end: 2000, type: "Normal" }]))).toEqual({
      skipped: "Normal dışı olay yok",
    });
  });

  it("Poor Quality kaydı eler", () => {
    expect(findingForAnnotation(annotation("Poor Quality", pureEvents("Rhonchi")))).toEqual({
      skipped: "Poor Quality (düşük sinyal kalitesi)",
    });
  });

  it("tek tür ronküs/wheezing kaydı bulguya çevirir", () => {
    expect(findingForAnnotation(annotation("CAS", pureEvents("Rhonchi")))).toEqual({ finding: "rhonchi" });
    expect(findingForAnnotation(annotation("CAS", pureEvents("Wheeze")))).toEqual({ finding: "wheezing" });
  });

  it("karma ve eşlenmeyen olay türlerini gerekçesiyle eler", () => {
    const events = [
      { start: 0, end: 1000, type: "Rhonchi" as EventType },
      { start: 1000, end: 2000, type: "Wheeze" as EventType },
    ];
    expect(findingForAnnotation(annotation("CAS & DAS", events))).toEqual({
      skipped: "karma olay türleri (Rhonchi+Wheeze)",
    });
    expect(findingForAnnotation(annotation("DAS", pureEvents("Stridor")))).toEqual({
      skipped: "eşlenmeyen olay türü (Stridor)",
    });
    expect(findingForAnnotation({ record_annotation: "CAS" })).toEqual({ skipped: "olay anotasyonu yok" });
  });
});

describe("SPRSound kapsam hesabı", () => {
  it("yalnız bulguya ait olay sürelerini toplar", () => {
    const ann = annotation("CAS", [
      { start: 0, end: 3000, type: "Rhonchi" },
      { start: 3000, end: 4000, type: "Wheeze" },
      { start: 4000, end: 5000, type: "Normal" },
    ]);
    expect(coverageOf(ann, "rhonchi", 10)).toBeCloseTo(0.3, 5);
    expect(coverageOf(ann, "wheezing", 10)).toBeCloseTo(0.1, 5);
    expect(coverageOf(ann, "rhonchi", 0)).toBe(0);
  });
});

describe("SPRSound nokta eşlemesi", () => {
  it("p1 sol, p3 sağ posteriora; 1. seçim alt, 2. seçim üst", () => {
    expect(pointForLocation("p1", 0)).toBe("lung_left_lower_posterior");
    expect(pointForLocation("p1", 1)).toBe("lung_left_upper_posterior");
    expect(pointForLocation("p1", 2)).toBe("lung_left_lower_posterior");
    expect(pointForLocation("p3", 0)).toBe("lung_right_lower_posterior");
    expect(pointForLocation("p3", 1)).toBe("lung_right_upper_posterior");
    expect(pointForLocation("p2", 0)).toBeNull();
  });
});

describe("SPRSound seçimi: eşik, sıralama, kova sınırı, tekilleştirme", () => {
  it(`kapsamı %${MIN_COVERAGE * 100} altındaki kayıtları almaz; eşik sınırı dahildir`, () => {
    const thin = { ...candidate("100_3.0_0_p1_1.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 2900, type: "Rhonchi" }]) };
    const exact = { ...candidate("101_3.0_0_p1_2.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 3000, type: "Rhonchi" }]) };
    const above = candidate("102_3.0_0_p1_3.wav", "p1", "Rhonchi");
    const { selected, skipped } = selectSprsoundRecords([thin, exact, above]);
    expect(selected.map((entry) => entry.fileName)).toEqual([above.fileName, exact.fileName]);
    expect(selected.map((entry) => entry.coverage)).toEqual([0.4, 0.3]);
    expect(skipped.get("kapsam %30 altı (rhonchi)")).toBe(1);
  });

  it("kapsam azalan, eşitlikte dosya adı sıralar ve kova başına 3 kaydı geçmez", () => {
    const entries = [
      candidate("200_2.0_0_p1_10.wav", "p1", "Rhonchi", 3000), // %12 → elenir
      { ...candidate("201_2.0_0_p1_11.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 3500, type: "Rhonchi" }]) }, // %35
      { ...candidate("202_2.0_0_p1_12.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 5000, type: "Rhonchi" }]) }, // %50
      { ...candidate("203_2.0_0_p1_13.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 5000, type: "Rhonchi" }]) }, // %50
      { ...candidate("204_2.0_0_p1_14.wav", "p1", "Rhonchi"), annotation: annotation("CAS", [{ start: 0, end: 4500, type: "Rhonchi" }]) }, // %45
    ];
    const { selected } = selectSprsoundRecords(entries);
    expect(selected.map((entry) => entry.fileName)).toEqual([
      "202_2.0_0_p1_12.wav",
      "203_2.0_0_p1_13.wav",
      "204_2.0_0_p1_14.wav",
    ]);
    expect(selected.map((entry) => entry.pointId)).toEqual([
      "lung_left_lower_posterior",
      "lung_left_upper_posterior",
      "lung_left_lower_posterior",
    ]);
    expect(selected.map((entry) => entry.coverage)).toEqual([0.5, 0.5, 0.45]);
  });

  it("aynı dosya adını tekilleştirir; kopya gerekçeyle sayılır", () => {
    const first = candidate("300_1.0_1_p3_20.wav", "p3", "Wheeze");
    const copy = { ...first, location: "p1" as const };
    const { selected, skipped } = selectSprsoundRecords([first, copy]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.location).toBe("p3");
    expect(skipped.get("dosya adı kopyası (tekilleştirme)")).toBe(1);
  });

  it("girdi sırası sonucu değiştirmez (deterministik)", () => {
    const entries = [
      candidate("400_1.0_1_p1_30.wav", "p1", "Wheeze", 5000),
      candidate("401_1.0_1_p1_31.wav", "p1", "Wheeze", 6000),
      candidate("402_1.0_1_p3_32.wav", "p3", "Wheeze", 4500),
    ];
    const forward = selectSprsoundRecords(entries);
    const backward = selectSprsoundRecords([...entries].reverse());
    expect(backward.selected).toEqual(forward.selected);
  });
});

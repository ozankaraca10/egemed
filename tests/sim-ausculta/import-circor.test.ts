import { describe, expect, it } from "vitest";
import {
  MAX_PER_TOPIC,
  chooseLocation,
  mapCircorEntry,
  parseCircorCsv,
  selectCircorRecords,
  type CircorCandidate,
} from "../../packages/sim-ausculta/tools/import-circor.mjs";

/** T260 — CirCor aktarım aracının saf yardımcıları; sentetik satır, dosya sistemi yok. */

function row(overrides: Partial<CircorCandidate> = {}): CircorCandidate {
  return {
    patientId: "100",
    recordingLocations: ["AV", "PV", "TV", "MV"],
    age: "Child",
    sex: "Female",
    pregnancy: "False",
    murmur: "Absent",
    mostAudible: "",
    systolicTiming: "",
    diastolicTiming: "",
    grading: "",
    topic: "heart.normal",
    finding: "normal",
    location: "AV",
    timing: "",
    ...overrides,
  };
}

describe("CirCor CSV çözümleme", () => {
  it("başlıkları arar, `nan` hücreleri boşaltır, kayıt yeri listesini çözer", () => {
    const csv =
      "\ufeffPatient ID,Recording locations:,Age,Sex,Height,Weight,Pregnancy status,Murmur,Murmur locations,Most audible location," +
      "Systolic murmur timing,Systolic murmur shape,Systolic murmur grading,Systolic murmur pitch,Systolic murmur quality," +
      "Diastolic murmur timing,Diastolic murmur shape,Diastolic murmur grading,Diastolic murmur pitch,Diastolic murmur quality,Outcome,Campaign,Additional ID\n" +
      '2530,AV+PV+TV+MV,Child,Female,98.0,15.9,False,Absent,nan,nan,nan,nan,nan,nan,nan,nan,nan,nan,nan,nan,Abnormal,CC2015,nan\n' +
      '4081,"AV+MV",Infant,Male,70.0,8.2,False,Present,"AV+MV",MV,Mid-systolic,Diamond,III/VI,High,Harsh,nan,nan,nan,nan,nan,Abnormal,CC2015,nan\n';
    const rows = parseCircorCsv(csv);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({
      patientId: "2530",
      recordingLocations: ["AV", "PV", "TV", "MV"],
      age: "Child",
      sex: "Female",
      murmur: "Absent",
      mostAudible: "",
      systolicTiming: "",
      grading: "",
    });
    expect(rows?.[1]).toMatchObject({
      recordingLocations: ["AV", "MV"],
      mostAudible: "MV",
      systolicTiming: "Mid-systolic",
      grading: "III/VI",
    });
  });

  it("beklenen sütunlar yoksa null döner", () => {
    expect(parseCircorCsv("a,b\n1,2\n")).toBeNull();
    expect(parseCircorCsv("yalnız-başlık")).toBeNull();
  });
});

describe("CirCor eşleme tablosu (plan)", () => {
  it("Murmur = Absent normal konusuna gider", () => {
    expect(mapCircorEntry(row({ murmur: "Absent" }))).toEqual({ topic: "heart.normal", finding: "normal" });
  });

  it("sistolik zamanlamayı konuya eşler", () => {
    expect(mapCircorEntry(row({ murmur: "Present", systolicTiming: "Early-systolic", grading: "II/VI" }))).toEqual({
      topic: "heart.murmur.early_systolic",
      finding: "early_systolic_murmur",
    });
    expect(mapCircorEntry(row({ murmur: "Present", systolicTiming: "Mid-systolic", grading: "III/VI" }))).toEqual({
      topic: "heart.murmur.mid_systolic",
      finding: "mid_systolic_murmur",
    });
    expect(mapCircorEntry(row({ murmur: "Present", systolicTiming: "Late-systolic", grading: "I/VI" }))).toEqual({
      topic: "heart.murmur.late_systolic",
      finding: "late_systolic_murmur",
    });
  });

  it("holosistolik ve erken diyastolik üfürüm hiçbir konuya girmez", () => {
    const holo = mapCircorEntry(row({ murmur: "Present", systolicTiming: "Holosystolic", grading: "III/VI" }));
    expect(holo).toEqual({ skipped: "holosistolik üfürüm (Ausculta karşılığı yok)" });
    expect(holo).not.toHaveProperty("topic");
    expect(mapCircorEntry(row({ murmur: "Present", diastolicTiming: "Early-diastolic" }))).toEqual({
      skipped: "erken diyastolik üfürüm (Ausculta karşılığı yok)",
    });
    expect(mapCircorEntry(row({ murmur: "Unknown" }))).toEqual({ skipped: "murmur durumu kapsam dışı (Unknown)" });
  });
});

describe("CirCor kayıt yeri seçimi", () => {
  it("normalde AV → PV → TV → MV'den ilk mevcut kaydı alır", () => {
    const locations = ["AV", "PV", "TV", "MV"];
    expect(chooseLocation("normal", "MV", locations, (location) => location !== "AV")).toBe("PV");
    expect(chooseLocation("normal", "", locations, () => true)).toBe("AV");
    expect(chooseLocation("normal", "", ["PV", "MV"], (location) => location === "MV")).toBe("MV");
    expect(chooseLocation("normal", "", locations, () => false)).toBeNull();
  });

  it("üfürümde yalnız Most audible location kaydını alır; yoksa geri düşmez", () => {
    expect(chooseLocation("early_systolic_murmur", "TV", ["AV", "PV", "TV", "MV"], () => true)).toBe("TV");
    expect(chooseLocation("early_systolic_murmur", "TV", ["AV", "PV", "TV", "MV"], (location) => location === "AV")).toBeNull();
    expect(chooseLocation("early_systolic_murmur", "", ["AV", "PV"], () => true)).toBeNull();
  });
});

describe("CirCor seçimi: derece önceliği, kota, determinizm, gebelik sınırı", () => {
  it("III/VI → II/VI → I/VI; eşitlikte hasta numarası artan", () => {
    const candidates = [
      row({ patientId: "30", topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "I/VI", mostAudible: "PV", location: "PV" }),
      row({ patientId: "20", topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "III/VI", mostAudible: "PV", location: "PV" }),
      row({ patientId: "10", topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "III/VI", mostAudible: "TV", location: "TV" }),
      row({ patientId: "40", topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "II/VI", mostAudible: "MV", location: "MV" }),
    ];
    const selected = selectCircorRecords(candidates);
    expect(selected.map((candidate) => `${candidate.patientId}:${candidate.grading}`)).toEqual([
      "10:III/VI",
      "20:III/VI",
      "40:II/VI",
      "30:I/VI",
    ]);
  });

  it(`konu başına en fazla ${MAX_PER_TOPIC} hasta alır`, () => {
    const candidates = [51, 52, 53, 54, 55, 56].map((id) =>
      row({ patientId: String(id), topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "III/VI", mostAudible: "PV", location: "PV" }),
    );
    expect(selectCircorRecords(candidates)).toHaveLength(MAX_PER_TOPIC);
  });

  it("girdi sırası sonucu değiştirmez (deterministik)", () => {
    const candidates = [
      row({ patientId: "11", topic: "heart.normal", finding: "normal" }),
      row({ patientId: "12", topic: "heart.normal", finding: "normal", age: "Infant", sex: "Male" }),
      row({ patientId: "13", topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur", murmur: "Present", systolicTiming: "Mid-systolic", grading: "III/VI", mostAudible: "TV", location: "TV" }),
      row({ patientId: "14", topic: "heart.murmur.early_systolic", finding: "early_systolic_murmur", murmur: "Present", systolicTiming: "Early-systolic", grading: "II/VI", mostAudible: "PV", location: "PV" }),
    ];
    const forward = selectCircorRecords(candidates);
    const backward = selectCircorRecords([...candidates].reverse());
    expect(backward).toEqual(forward);
  });

  it("normal konusunda gebe kayıt en fazla 1 örnek olur; karışık yaş/cinsiyet öne alınır", () => {
    const candidates = [
      row({ patientId: "21", pregnancy: "True" }),
      row({ patientId: "22", pregnancy: "True", age: "Adolescent" }),
      row({ patientId: "23", pregnancy: "True", age: "Infant" }),
      row({ patientId: "24" }),
      row({ patientId: "25", age: "Adolescent", sex: "Male" }),
      row({ patientId: "26", sex: "Male" }),
      row({ patientId: "27", age: "Infant", sex: "Male" }),
    ];
    const selected = selectCircorRecords(candidates, 5);
    expect(selected).toHaveLength(5);
    expect(selected.filter((candidate) => candidate.pregnancy === "True")).toHaveLength(1);
    expect(selected.map((candidate) => candidate.patientId)).toEqual(["21", "25", "26", "27", "24"]);
  });
});

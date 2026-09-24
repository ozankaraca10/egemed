import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECORDS,
  assessmentPointFilter,
  resolveAssignment,
  resolveAssignmentEx,
  resolveCaseSounds,
  resolveCaseSoundsEx,
  resolveLibrarySound,
} from "../../packages/sim-ausculta/src/index";
import type { CaseDef } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:829-921 (14 test → 14 test).
 *  CirCor eşlemesi kaynak scripts/lib/external-mapping.mjs; .mjs import yok, satır içi. */

const CIRCOR_LOCATIONS: Record<string, string> = {
  AV: "cardiac_aortic",
  PV: "cardiac_pulmonary",
  TV: "cardiac_tricuspid",
  MV: "cardiac_mitral",
};

function mapCircorMurmur(murmur: string, systolicTiming: string, diastolicTiming: string) {
  const t = (v: string | undefined | null) => (v === undefined || v === null || v === "" || v === "nan" ? null : String(v).trim());
  const m = t(murmur);
  const st = t(systolicTiming);
  const dt = t(diastolicTiming);

  if (m === "Absent") {
    return { finding: "normal", mappingStatus: "validated", note: 'Murmur yok (CirCor "Absent") — normal kalp sesi sınıfı' };
  }
  if (m !== "Present") {
    return { finding: null, mappingStatus: "unsupported", note: `Murmur durumu belirsiz/eksik (${murmur})` };
  }
  if (dt) {
    return { finding: null, mappingStatus: "unsupported", note: `Diyastolik zamanlama (${dt}) mevcut taksonomiye birebir uymuyor` };
  }
  switch (st) {
    case "Early-systolic":
      return { finding: "early_systolic_murmur", mappingStatus: "validated", note: "Zamanlama birebir eşleşiyor (Early-systolic)" };
    case "Mid-systolic":
      return { finding: "mid_systolic_murmur", mappingStatus: "validated", note: "Zamanlama birebir eşleşiyor (Mid-systolic)" };
    case "Late-systolic":
      return { finding: "late_systolic_murmur", mappingStatus: "validated", note: "Zamanlama birebir eşleşiyor (Late-systolic)" };
    case "Holosystolic":
      return {
        finding: "mid_systolic_murmur",
        mappingStatus: "educational_mapping",
        note: "Pansistolik (holosistolik) üfürüm orta sistolik sınıfa yaklaşık eşlendi; değerlendirme dışı",
      };
    default:
      return { finding: null, mappingStatus: "unsupported", note: "Sistolik zamanlama etiketi yok (nan)" };
  }
}

function mapCircorLocations(locationsField: string) {
  const codes = String(locationsField ?? "")
    .split("+")
    .map((c) => c.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const c of codes) {
    const loc = CIRCOR_LOCATIONS[c];
    if (loc && !out.includes(loc)) out.push(loc);
  }
  return out;
}

const DATA = "packages/sim-ausculta/src/data";
const cases = (JSON.parse(readFileSync(`${DATA}/cases.json`, "utf8")) as { cases: CaseDef[] }).cases;
const pointIds = (JSON.parse(readFileSync(`${DATA}/auscultation-points.json`, "utf8")) as { points: { id: string }[] }).points.map(
  (p) => p.id,
);
const soundIdList = RECORDS.map((r) => r.id);

describe("CirCor dış eşleme kuralları (§6)", () => {
  it("Murmur=Absent → normal (validated)", () => {
    expect(mapCircorMurmur("Absent", "nan", "nan")).toMatchObject({ finding: "normal", mappingStatus: "validated" });
  });
  it("zamanlama birebir eşleşince validated olur", () => {
    expect(mapCircorMurmur("Present", "Early-systolic", "nan")).toMatchObject({
      finding: "early_systolic_murmur",
      mappingStatus: "validated",
    });
    expect(mapCircorMurmur("Present", "Mid-systolic", "nan")).toMatchObject({
      finding: "mid_systolic_murmur",
      mappingStatus: "validated",
    });
    expect(mapCircorMurmur("Present", "Late-systolic", "nan")).toMatchObject({
      finding: "late_systolic_murmur",
      mappingStatus: "validated",
    });
  });
  it("holosistolik yalnız eğitim eşlemesidir (değerlendirmeye giremez)", () => {
    const r = mapCircorMurmur("Present", "Holosystolic", "nan");
    expect(r.finding).toBe("mid_systolic_murmur");
    expect(r.mappingStatus).toBe("educational_mapping");
  });
  it("uyumsuz etiketler uydurulmaz (unsupported)", () => {
    expect(mapCircorMurmur("Present", "nan", "nan").finding).toBeNull();
    expect(mapCircorMurmur("Present", "nan", "Early-diastolic").finding).toBeNull();
    expect(mapCircorMurmur("Unknown", "nan", "nan").finding).toBeNull();
  });
  it("konum kodları simülasyon noktalarına eşlenir", () => {
    expect(mapCircorLocations("AV+PV+TV+MV")).toEqual([
      "cardiac_aortic",
      "cardiac_pulmonary",
      "cardiac_tricuspid",
      "cardiac_mitral",
    ]);
    expect(mapCircorLocations("MV")).toEqual(["cardiac_mitral"]);
  });
});

describe("ses eşleme", () => {
  it("kalp normal RUSB → aort odağı", () => {
    const rec = resolveAssignment({
      pointId: "cardiac_aortic",
      category: "heart",
      acousticFinding: "normal",
      recordedLocation: "RUSB",
    });
    expect(rec).not.toBeNull();
    expect(rec!.recordedLocation).toBe("RUSB");
    expect(rec!.simulationLocation).toBe("cardiac_aortic");
  });

  it("RC/LC kayıtları adlandırılmış odağa eşlenmez (dürüst eşleme §13)", () => {
    expect(
      resolveAssignment({ pointId: "cardiac_aortic", category: "heart", acousticFinding: "normal", recordedLocation: "RC" }),
    ).toBeNull();
    expect(
      resolveAssignment({ pointId: "cardiac_mitral", category: "heart", acousticFinding: "normal", recordedLocation: "LC" }),
    ).toBeNull();
  });

  it("vaka ses haritası çözülebilir kayıtlar üretir", () => {
    for (const c of cases) {
      const map = resolveCaseSounds(c.soundAssignments);
      for (const [pointId, rec] of Object.entries(map)) {
        if (!rec) continue;
        expect(pointIds).toContain(pointId);
        expect(soundIdList).toContain(rec.id);
      }
    }
  });

  it("kütüphane sesi sim konumuyla tercihli çözülür (apeks normal → Apex kaydı)", () => {
    expect(resolveLibrarySound("heart", "normal", "cardiac_mitral")!.recordedLocation).toBe("Apex");
  });

  it("crackles kütüphane kalemleri kayıtlı (C→FC dosya eşlemesi)", () => {
    expect(resolveLibrarySound("lung", "fine_crackles")).not.toBeNull();
    expect(resolveLibrarySound("lung", "coarse_crackles")).not.toBeNull();
  });

  it("posterior nokta ataması anterior kayda fallback yapar ve kaynak bölgeyi bildirir (§14)", () => {
    const res = resolveAssignmentEx({ pointId: "lung_left_upper_posterior", category: "lung", acousticFinding: "normal" });
    expect(res.record).not.toBeNull();
    expect(res.record!.simulationLocation).toBe("lung_left_upper_anterior");
    expect(res.fallbackFrom).toBe("lung_left_upper_anterior");
  });

  it("posterior fallback ile tüm akciğer vakaları arka görünümde ses üretir", () => {
    const lungCases = cases.filter((c) => c.soundAssignments.some((a) => a.pointId.startsWith("lung_")));
    for (const c of lungCases) {
      const { sounds } = resolveCaseSoundsEx(c.soundAssignments);
      const posterior = Object.entries(sounds).filter(([pid, rec]) => pid.includes("posterior") && rec);
      expect(posterior.length, `${c.id} posterior ses üretmeli`).toBeGreaterThan(0);
    }
  });

  it("tüm vaka atamalarının en az bir yarısı çözülür (eksikler bilinçli)", () => {
    for (const c of cases) {
      const map = resolveCaseSounds(c.soundAssignments);
      const resolvedCount = Object.values(map).filter(Boolean).length;
      expect(resolvedCount).toBeGreaterThan(0);
    }
  });

  it("O7: assessmentPointFilter fallback (kaynak bölgeden alınmamış) noktaları dışlar", () => {
    const lungCase = cases.find((c) => c.id === "case_normal_lung")!;
    const filtered = assessmentPointFilter(lungCase.soundAssignments);
    for (const pid of filtered) expect(pid.includes("posterior")).toBe(false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(lungCase.soundAssignments.length);
  });
});

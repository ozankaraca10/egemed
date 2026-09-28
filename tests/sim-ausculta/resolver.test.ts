import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXTERNAL_RECORDS,
  RECORDS,
  assessmentPointFilter,
  resolveAssignment,
  resolveAssignmentEx,
  resolveCaseSounds,
  resolveCaseSoundsEx,
  resolveLibrarySound,
  resolveLibrarySoundEx,
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
const cases = (JSON.parse(readFileSync("packages/assessment-bank/data/ausculta/cases.json", "utf8")) as { cases: CaseDef[] }).cases;
const autoCases = (JSON.parse(readFileSync("packages/assessment-bank/data/ausculta/cases-auto.json", "utf8")) as { cases: CaseDef[] }).cases;
const pointIds = (JSON.parse(readFileSync(`${DATA}/auscultation-points.json`, "utf8")) as { points: { id: string }[] }).points.map(
  (p) => p.id,
);
const soundIdList = RECORDS.map((r) => r.id);

const POSTERIOR_TO_ANTERIOR: Record<string, string> = {
  lung_right_upper_posterior: "lung_right_upper_anterior",
  lung_left_upper_posterior: "lung_left_upper_anterior",
  lung_right_middle_posterior: "lung_right_middle_anterior",
  lung_left_middle_posterior: "lung_left_middle_anterior",
  lung_right_lower_posterior: "lung_right_lower_anterior",
  lung_left_lower_posterior: "lung_left_lower_anterior",
};

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

  it("posterior nokta ataması kaydı yoksa anterior kayda fallback yapar ve kaynak bölgeyi bildirir (§14)", () => {
    const res = resolveAssignmentEx({ pointId: "lung_left_upper_posterior", category: "lung", acousticFinding: "rhonchi" });
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

  it("O7: assessmentPointFilter yalnız kaydı olmayan fallback noktaları dışlar", () => {
    // T227: KAUH posterior kayıtları gelince normal noktalar artık gerçek kaynaktan sunulur.
    const normalLung = cases.find((c) => c.id === "case_normal_lung")!;
    const normalFiltered = assessmentPointFilter(normalLung.soundAssignments);
    expect(normalFiltered).toHaveLength(normalLung.soundAssignments.length);
    expect(normalFiltered.some((pid) => pid.includes("posterior"))).toBe(true);
    // Kaydı olmayan bulguda (rhonchi) posterior noktalar hâlâ dışlanır.
    const rhonchi = cases.find((c) => c.id === "case_rhonchi")!;
    const rhonchiFiltered = assessmentPointFilter(rhonchi.soundAssignments);
    for (const pid of rhonchiFiltered) expect(pid.includes("posterior")).toBe(false);
    expect(rhonchiFiltered.length).toBeGreaterThan(0);
    expect(rhonchiFiltered.length).toBeLessThan(rhonchi.soundAssignments.length);
  });
});

describe("KAUH posterior kayıtları (T227)", () => {
  const posteriorPoints = Object.keys(POSTERIOR_TO_ANTERIOR);

  it("6 posterior nokta × normal/wheezing gerçek posterior kayda çözülür (fallback yok)", () => {
    for (const pointId of posteriorPoints) {
      for (const finding of ["normal", "wheezing"]) {
        const res = resolveAssignmentEx({ pointId, category: "lung", acousticFinding: finding });
        expect(res.record, `${pointId} ${finding}`).not.toBeNull();
        expect(res.fallbackFrom, `${pointId} ${finding}`).toBeUndefined();
        expect(res.record!.sourceDataset).toBe("kauh-v3");
        expect(res.record!.simulationLocation).toBe(pointId);
        expect(res.record!.nativeFilter).toBe("diaphragm");
      }
    }
  });

  it("KAUH kaydı olan her posterior nokta × ince/kaba ral gerçek kayda çözülür", () => {
    for (const finding of ["fine_crackles", "coarse_crackles"]) {
      for (const pointId of posteriorPoints) {
        const hasKauh = EXTERNAL_RECORDS.some(
          (r) => r.sourceDataset === "kauh-v3" && r.simulationLocation === pointId && r.acousticFinding === finding,
        );
        const res = resolveAssignmentEx({ pointId, category: "lung", acousticFinding: finding });
        expect(res.record, `${pointId} ${finding}`).not.toBeNull();
        if (hasKauh) {
          expect(res.fallbackFrom, `${pointId} ${finding}`).toBeUndefined();
          expect(res.record!.simulationLocation).toBe(pointId);
        } else {
          expect(res.fallbackFrom, `${pointId} ${finding}`).toBe(POSTERIOR_TO_ANTERIOR[pointId]);
        }
      }
    }
  });

  it("rhonchi/pleural_rub posterior KAUH kaydı üretmez; kayıt varsa anterior fallback olur", () => {
    let fallbackCount = 0;
    for (const finding of ["rhonchi", "pleural_rub"]) {
      for (const pointId of posteriorPoints) {
        const res = resolveAssignmentEx({ pointId, category: "lung", acousticFinding: finding });
        if (res.record === null) {
          expect(res.fallbackFrom, `${pointId} ${finding}`).toBeUndefined();
          continue;
        }
        expect(res.record.sourceDataset, `${pointId} ${finding}`).toBe("hls-cmds-v3");
        expect(res.fallbackFrom, `${pointId} ${finding}`).toBe(POSTERIOR_TO_ANTERIOR[pointId]);
        expect(res.record.simulationLocation).toBe(POSTERIOR_TO_ANTERIOR[pointId]);
        fallbackCount += 1;
      }
    }
    expect(fallbackCount).toBeGreaterThan(0);
  });

  it("CirCor eşlemesi değişmedi: yalnız soundId ile hedeflenir", () => {
    const circor = resolveAssignment({
      pointId: "cardiac_aortic",
      category: "heart",
      acousticFinding: "early_systolic_murmur",
      soundId: "circor_early_systolic_murmur_cardiac_aortic_001",
    });
    expect(circor?.sourceDataset).toBe("physionet-circor");
    // Konum eşleşmesinde birincil veri seti önceliği korunur (CirCor ezmez).
    const normal = resolveAssignment({
      pointId: "cardiac_aortic",
      category: "heart",
      acousticFinding: "normal",
      recordedLocation: "RUSB",
    });
    expect(normal?.sourceDataset).toBe("hls-cmds-v3");
  });

  it("kütüphane posterior noktada KAUH kaydını çalar; anterior HLS'te kalır", () => {
    const posterior = resolveLibrarySoundEx("lung", "wheezing", "lung_left_upper_posterior");
    expect(posterior.record?.sourceDataset).toBe("kauh-v3");
    expect(posterior.fallbackFrom).toBeUndefined();
    const anterior = resolveLibrarySoundEx("lung", "wheezing", "lung_left_upper_anterior");
    expect(anterior.record?.sourceDataset).toBe("hls-cmds-v3");
    expect(anterior.fallbackFrom).toBeUndefined();
    const rhonchi = resolveLibrarySoundEx("lung", "rhonchi", "lung_left_upper_posterior");
    expect(rhonchi.record?.simulationLocation).toBe("lung_left_upper_anterior");
    expect(rhonchi.fallbackFrom).toBe("lung_left_upper_anterior");
  });
});

describe("SPRSound pediatrik posterior kayıtları (T234)", () => {
  const allBankCases = [...cases, ...autoCases];
  const sprsoundRecords = RECORDS.filter((record) => record.sourceDataset === "sprsound");
  const populationOf = (caseDef: CaseDef): string | undefined => (caseDef as CaseDef & { population?: string }).population;

  it("12 kayıt; hiçbiri konum eşleşmesiyle otomatik seçilmez (yalnız soundId)", () => {
    expect(sprsoundRecords).toHaveLength(12);
    for (const pointId of Object.keys(POSTERIOR_TO_ANTERIOR)) {
      for (const finding of ["rhonchi", "wheezing"]) {
        const res = resolveAssignment({ pointId, category: "lung", acousticFinding: finding });
        if (res !== null) expect(res.sourceDataset, `${pointId} ${finding}`).not.toBe("sprsound");
      }
    }
  });

  it("yetişkin vakaların hiçbir ataması SPRSound kaydına çözülmez", () => {
    const adultCases = allBankCases.filter((caseDef) => populationOf(caseDef) !== "pediatrik");
    expect(adultCases.length).toBeGreaterThan(150);
    let resolved = 0;
    for (const caseDef of adultCases) {
      for (const assignment of caseDef.soundAssignments) {
        const record = resolveAssignment(assignment);
        if (record === null) continue;
        resolved += 1;
        expect(record.sourceDataset, `${caseDef.id}/${assignment.pointId}`).not.toBe("sprsound");
      }
    }
    expect(resolved).toBeGreaterThan(0);
  });

  it("case_pediatric_wheezing posterior noktaları SPRSound wheezing kayıtlarına sabitlidir", () => {
    const caseDef = cases.find((entry) => entry.id === "case_pediatric_wheezing");
    if (caseDef === undefined) throw new Error("case_pediatric_wheezing yok");
    const posterior = caseDef.soundAssignments.filter((assignment) => assignment.pointId.includes("posterior"));
    expect(posterior).toHaveLength(4);
    for (const assignment of posterior) {
      expect(assignment.soundId, assignment.pointId).toBeDefined();
      const res = resolveAssignmentEx(assignment);
      expect(res.record?.sourceDataset, assignment.pointId).toBe("sprsound");
      expect(res.record?.acousticFinding, assignment.pointId).toBe("wheezing");
      expect((res.record as unknown as { population?: string })?.population, assignment.pointId).toBe("pediatric");
      expect(res.record?.simulationLocation, assignment.pointId).toBe(assignment.pointId);
      expect(res.fallbackFrom, assignment.pointId).toBeUndefined();
    }
  });

  it("case_pediatric_rhonchi posterior noktaları SPRSound ronküs kayıtlarına sabitlidir ve O7'den geçer", () => {
    const caseDef = cases.find((entry) => entry.id === "case_pediatric_rhonchi");
    if (caseDef === undefined) throw new Error("case_pediatric_rhonchi yok");
    expect(populationOf(caseDef)).toBe("pediatrik");
    expect(caseDef.modes).toEqual(["practice", "assessment"]);
    const posterior = caseDef.soundAssignments.filter((assignment) => assignment.pointId.includes("posterior"));
    expect(posterior).toHaveLength(4);
    for (const assignment of posterior) {
      const res = resolveAssignmentEx(assignment);
      expect(res.record?.sourceDataset, assignment.pointId).toBe("sprsound");
      expect(res.record?.acousticFinding, assignment.pointId).toBe("rhonchi");
      expect(res.fallbackFrom, assignment.pointId).toBeUndefined();
    }
    // Gerçek posterior kayıt olduğu için değerlendirmede de sunulur (O7).
    expect(assessmentPointFilter(caseDef.soundAssignments)).toEqual(caseDef.soundAssignments.map((assignment) => assignment.pointId));
  });

  it("öğrenme kütüphanesi SPRSound kaydı çalmaz", () => {
    for (const finding of ["rhonchi", "wheezing"]) {
      const posterior = resolveLibrarySoundEx("lung", finding, "lung_left_lower_posterior");
      expect(posterior.record?.sourceDataset ?? "", finding).not.toBe("sprsound");
    }
  });
});

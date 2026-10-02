import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORDS } from "../../packages/sim-ausculta/src/index";
import { learnExamples } from "../../packages/sim-ausculta/src/data/learnSets";
import { AUTO_CASES, CORE_CASES, poolFor } from "./bank-cases";
import type { CaseDef } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:368-415 ve 507-580 (13 test → 13 test). */

const DATA = "packages/sim-ausculta/src/data";
const cases = CORE_CASES;
const libraryJson = JSON.parse(readFileSync(`${DATA}/library.json`, "utf8")) as {
  groups: { id: string; items: { key: string; acousticFinding: string; metaphor?: string }[] }[];
};

type PooledCase = CaseDef & { population?: string };

function populationOf(c: CaseDef): string | undefined {
  return (c as PooledCase).population;
}

/* ---------------- veri seti senkronizasyonu (§36) ---------------- */
describe("veri seti ↔ kütüphane ↔ vaka senkronizasyonu", () => {
  const libraryData = libraryJson;
  const libFindings = new Set(libraryData.groups.flatMap((g) => g.items.map((item) => item.acousticFinding)));
  const heartClasses = new Set(RECORDS.filter((r) => r.category === "heart").map((r) => r.acousticFinding));
  const lungClasses = new Set(RECORDS.filter((r) => r.category === "lung").map((r) => r.acousticFinding));
  const practice = new Set(cases.filter((c) => c.modes.includes("practice")).map((c) => c.primaryAcousticFinding));
  const assessment = new Set(cases.filter((c) => c.modes.includes("assessment")).map((c) => c.primaryAcousticFinding));

  it("her veri seti sınıfının kütüphane kalemi var", () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(libFindings.has(f), `kütüphane: ${f}`).toBe(true);
  });
  it("her veri seti sınıfı uygulama modunda kapsanıyor", () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(practice.has(f), `uygulama: ${f}`).toBe(true);
  });
  it("her veri seti sınıfı değerlendirme modunda kapsanıyor", () => {
    for (const f of [...heartClasses, ...lungClasses]) expect(assessment.has(f), `değerlendirme: ${f}`).toBe(true);
  });
  it("kütüphanedeki her ses sınıfı için en az bir çalınabilir kayıt var", () => {
    // T307: yeni 4 konunun sentetik seti HLS-CMDS'de değil, öğrenme setlerindeki bölgesel modelde.
    const items = libraryData.groups.flatMap((g) => g.items);
    for (const item of items) {
      const playable =
        RECORDS.some((r) => r.acousticFinding === item.acousticFinding && r.validationStatus === "validated") ||
        learnExamples(item.key).some((example) => example.kind !== "library" && Object.keys(example.points).length > 0);
      expect(playable, `kayıt: ${item.acousticFinding}`).toBe(true);
    }
  });
  it("kombine (mixed) sesler kütüphanede ve uygulamada temsil ediliyor", () => {
    const mixedItems = libraryData.groups.find((g) => g.id === "mixed")?.items ?? [];
    expect(mixedItems.length).toBeGreaterThan(0);
    const mixedCases = cases.filter((c) => c.primaryAcousticFinding.includes("+") && c.modes.includes("practice"));
    expect(mixedCases.length).toBeGreaterThan(0);
  });
  it("her kütüphane kaleminde ses metaforu var (izleme modu gereksinimi)", () => {
    const items = libraryJson.groups.flatMap((g) => g.items);
    for (const item of items) expect(item.metaphor && item.metaphor.length > 10, `metafor: ${item.key}`).toBe(true);
  });
  it("değerlendirme vakaları doğrulanmış eşlemeye sahip", () => {
    for (const c of cases.filter((x) => x.modes.includes("assessment"))) {
      expect(c.mappingValidation, c.id).toBe("validated");
    }
  });
  it('K5: kalp kategorili otomatik vakaların metinlerinde akciğer terimleri ("solunum sesi", "veziküler") geçmez', () => {
    const heartAuto = AUTO_CASES.filter((c) => c.id.startsWith("auto_heart_"));
    expect(heartAuto.length).toBeGreaterThan(0);
    for (const c of heartAuto) {
      const text = `${c.feedback?.summary ?? ""} ${c.questions.map((q) => `${q.feedbackCorrect} ${q.feedbackIncorrect}`).join(" ")}`;
      expect(text, c.id).not.toMatch(/solunum sesi|veziküler/i);
    }
  });
});

describe("tıbbi tutarlılık (pediatrik vitaller + soru bütünlüğü)", () => {
  // Yaşa göre beklenen istirahat aralıkları (pediatric-reference.json ile uyumlu)
  // yaş birimi: YIL (0–1 ay hariç; bebek/çocuk vakalarında yaş yıldır)
  const HR: [number, number, number][] = [
    [1, 100, 180],
    [3, 90, 160],
    [6, 80, 140],
    [12, 70, 120],
    [18, 60, 100],
    [999, 60, 100],
  ];
  const RR: [number, number, number][] = [
    [1, 30, 60],
    [3, 22, 38],
    [6, 20, 30],
    [12, 18, 25],
    [18, 12, 20],
    [999, 12, 20],
  ];
  const range = (tbl: [number, number, number][], age: number) => {
    for (const [max, lo, hi] of tbl) if (age <= max) return [lo, hi] as const;
    return [60, 100] as const;
  };
  const poolAll = [...poolFor("practice"), ...poolFor("assessment")];

  it("pediatrik vakaların vitalleri yaşa göre fizyolojik aralıkta", () => {
    for (const c of poolAll) {
      if (populationOf(c) !== "pediatrik") continue;
      const age = c.patient.age;
      const [hrLo, hrHi] = range(HR, age);
      const [rrLo, rrHi] = range(RR, age);
      const hr = c.vitalSigns.hr;
      const rr = c.vitalSigns.rr;
      expect(hr, `${c.id} HR ${String(hr)} (yaş ${age})`).toBeGreaterThanOrEqual(hrLo);
      expect(hr, `${c.id} HR üst`).toBeLessThanOrEqual(hrHi);
      expect(rr, `${c.id} RR ${String(rr)} (yaş ${age})`).toBeGreaterThanOrEqual(rrLo);
      expect(rr, `${c.id} RR üst`).toBeLessThanOrEqual(rrHi);
    }
  });
  it("yetişkin vakaların vitalleri fizyolojik aralıkta", () => {
    for (const c of poolAll) {
      if (populationOf(c) === "pediatrik") continue;
      const hr = c.vitalSigns.hr;
      const rr = c.vitalSigns.rr;
      expect(hr, `${c.id} HR`).toBeGreaterThanOrEqual(40);
      expect(hr, `${c.id} HR üst`).toBeLessThanOrEqual(140);
      expect(rr, `${c.id} RR`).toBeGreaterThanOrEqual(8);
      expect(rr, `${c.id} RR üst`).toBeLessThanOrEqual(38);
    }
  });
  it("her soruda seçenek etiketleri benzersizdir", () => {
    const errs: string[] = [];
    for (const c of poolAll) {
      for (const q of c.questions) {
        const labels = q.options.map((o) => o.label);
        const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
        if (dup.length) errs.push(`${c.id}/${q.id}: ${dup.join(", ")}`);
        const ids = q.options.map((o) => o.id);
        expect(new Set(ids).size, `${c.id}/${q.id} id benzersizliği`).toBe(ids.length);
      }
    }
    expect(errs).toEqual([]);
  });
  it("O8: bir soruda iki seçenek parantez içi kaldırılınca aynı metne indirgenmez", () => {
    // (ör. s4 "geç diyastol (presistol)" ile late_diastolic_murmur "geç diyastol (presistolik)"
    // gibi parantez öncesi eşdeğer etiketler aynı soruda birlikte distraktör olamaz)
    const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    const errs: string[] = [];
    for (const c of poolAll) {
      for (const q of c.questions) {
        const labels = q.options.map((o) => o.label);
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = norm(labels[i] ?? "");
            const b = norm(labels[j] ?? "");
            if (a === b) errs.push(`${c.id}/${q.id}: "${labels[i] ?? ""}" ~ "${labels[j] ?? ""}"`);
          }
        }
      }
    }
    expect(errs).toEqual([]);
  });
  it("pediatrik vakalar hasta yaşıyla uyumlu başlıklar kullanır", () => {
    for (const c of poolAll) {
      if (populationOf(c) !== "pediatrik") continue;
      expect(/pediatrik|çocuk/i.test(c.title), c.id).toBe(true);
    }
  });
});

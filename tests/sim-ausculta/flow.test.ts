import { describe, expect, it } from "vitest";
import { firstWeakLibraryKey, firstWeakLibraryKeyFromServer, libraryKeyForCase, resampleActiveMode, tutorialProgress, weakDomainKeys } from "../../packages/sim-ausculta/src/index";

/* ---------------- F2: "Yeni örneklem" yalnız AKTİF modun listesini yeniler ---------------- */
describe("resampleActiveMode (F2 düzeltmesi)", () => {
  const session = { practiceIds: ["p1", "p2"], assessmentIds: ["a1", "a2"] };
  it("assessment modunda yalnız assessmentIds yenilenir, practiceIds AYNEN korunur", () => {
    const out = resampleActiveMode("assessment", session, ["a3", "a4"]);
    expect(out.assessmentIds).toEqual(["a3", "a4"]);
    expect(out.practiceIds).toBe(session.practiceIds);
  });
});

/* ---------------- madde 5 (wave 2): zayıf alan → Öğrenme odağı ---------------- */
describe("libraryKeyForCase / firstWeakLibraryKey / weakDomainKeys (madde 5, wave 2)", () => {
  const libraryItems = [
    { key: "heart.normal", category: "heart", acousticFinding: "normal" },
    { key: "heart.s3", category: "heart", acousticFinding: "s3" },
    { key: "lung.normal", category: "lung", acousticFinding: "normal" },
  ];
  it("eşleşme yoksa veya vaka tanımsızsa null", () => {
    expect(libraryKeyForCase(undefined, libraryItems)).toBeNull();
    expect(
      libraryKeyForCase({ primaryAcousticFinding: "yok", soundAssignments: [{ category: "heart" }] }, libraryItems),
    ).toBeNull();
  });

  it("firstWeakLibraryKey: yanlış yanıtı olan İLK vakanın anahtarını döndürür", () => {
    const results = [
      { caseId: "c1", answers: [{ correct: true }] },
      { caseId: "c2", answers: [{ correct: false }, { correct: true }] },
      { caseId: "c3", answers: [{ correct: false }] },
    ];
    const resolve = (id: string) => (id === "c2" ? "heart.s3" : id === "c3" ? "lung.normal" : null);
    expect(firstWeakLibraryKey(results, resolve)).toBe("heart.s3");
  });

  it("weakDomainKeys: yalnız max>0 ve yüzdesi eşiğin altında olan alanları döndürür", () => {
    const domains = {
      technique: { earned: 20, max: 20 }, // %100
      localization: { earned: 5, max: 20 }, // %25 — zayıf
      recognition: { earned: 0, max: 0 }, // soru yok — hariç
      interpretation: { earned: 11, max: 20 }, // %55 — zayıf
    };
    expect(weakDomainKeys(domains, 60).sort()).toEqual(["interpretation", "localization"].sort());
  });
});

/* ---------------- T214: sunucu meta verisinden zayıf konu anahtarı ---------------- */
describe("firstWeakLibraryKeyFromServer (T214)", () => {
  const results = [
    { caseId: "srv-1", answers: [{ correct: true }] },
    { caseId: "srv-2", answers: [{ correct: false }] },
    { caseId: "srv-3", answers: [{ correct: false }] },
  ];
  it("yanlış yanıtlı İLK vakanın sunucu meta anahtarını döndürür", () => {
    expect(firstWeakLibraryKeyFromServer(results, { "srv-2": { libraryKey: "heart.s3" }, "srv-3": { libraryKey: "lung.wheezing" } })).toBe("heart.s3");
  });
});

/* ---------------- madde 5 (wave 3): interaktif öğretici — saf adım-makinesi ---------------- */
describe("tutorialProgress (madde 5, wave 3)", () => {
  it("sıra bağımsızdır — snap, drag olmadan da gelebilir (ör. klavye ile yerleştirme)", () => {
    const p = tutorialProgress(["snap"]);
    expect(p.steps).toEqual([false, true, false]);
    expect(p.currentStep).toBe(0);
  });
});

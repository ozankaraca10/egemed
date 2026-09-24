import { describe, expect, it } from "vitest";
import {
  countUnlistenedInOtherView,
  firstWeakLibraryKey,
  libraryKeyForCase,
  nextActionForSubmit,
  otherViewHintText,
  regionChipState,
  resampleActiveMode,
  tutorialProgress,
  weakDomainKeys,
} from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:922-1043 ve 1045-1076 (25 test). Satır içi sentetik girdi; cases.json yok. */

/* ---------------- madde 1: uygulamada submit sonrası advance olmaz ---------------- */
describe("nextActionForSubmit (madde 1)", () => {
  it("uygulama modunda ilk tık yalnız gönderir — advance ÇAĞRILMAZ", () => {
    expect(nextActionForSubmit("practice", false, false)).toBe("submit");
    expect(nextActionForSubmit("practice", false, true)).toBe("submit");
  });
  it('uygulama modunda geri bildirim gösterildikten (revealed) sonra "Devam Et"/"Vakayı tamamla" ilerler', () => {
    expect(nextActionForSubmit("practice", true, false)).toBe("advance");
    expect(nextActionForSubmit("practice", true, true)).toBe("finish");
  });
  it("değerlendirmede geri bildirim yok — submit hemen ilerler", () => {
    expect(nextActionForSubmit("assessment", false, false)).toBe("submit-then-advance");
    expect(nextActionForSubmit("assessment", false, true)).toBe("submit-then-finish");
  });
});

/* ---------------- F2: "Yeni örneklem" yalnız AKTİF modun listesini yeniler ---------------- */
describe("resampleActiveMode (F2 düzeltmesi)", () => {
  const session = { practiceIds: ["p1", "p2"], assessmentIds: ["a1", "a2"] };
  it("practice modunda yalnız practiceIds yenilenir, assessmentIds AYNEN korunur", () => {
    const out = resampleActiveMode("practice", session, ["p3", "p4"]);
    expect(out.practiceIds).toEqual(["p3", "p4"]);
    expect(out.assessmentIds).toBe(session.assessmentIds); // referans korunur — dokunulmadı
  });
  it("assessment modunda yalnız assessmentIds yenilenir, practiceIds AYNEN korunur", () => {
    const out = resampleActiveMode("assessment", session, ["a3", "a4"]);
    expect(out.assessmentIds).toEqual(["a3", "a4"]);
    expect(out.practiceIds).toBe(session.practiceIds);
  });
  it("learn modunda (bu buton hiç görünmese de) hiçbir liste değişmez", () => {
    const out = resampleActiveMode("learn", session, ["x"]);
    expect(out).toEqual(session);
  });
});

/* ---------------- madde 1 (wave 2): bölge chip'leri — saf durum hesabı ---------------- */
describe("regionChipState (madde 1, wave 2)", () => {
  it('stetoskopun üstünde olan nokta "active" döner', () => {
    expect(regionChipState("cardiac_mitral", "cardiac_mitral", {})).toBe("active");
  });
  it('bu oturumda dinlenmiş (listenMs>0) ama aktif olmayan nokta "listened" döner', () => {
    expect(regionChipState("cardiac_aortic", "cardiac_mitral", { cardiac_aortic: { listenMs: 1200 } })).toBe("listened");
  });
  it('hiç dinlenmemiş, aktif olmayan nokta "default" döner', () => {
    expect(regionChipState("cardiac_aortic", "cardiac_mitral", {})).toBe("default");
    expect(regionChipState("cardiac_aortic", null, { cardiac_aortic: { listenMs: 0 } })).toBe("default");
  });
  it("aktiflik dinlenmiş olmaya önceliklidir", () => {
    expect(regionChipState("cardiac_mitral", "cardiac_mitral", { cardiac_mitral: { listenMs: 5000 } })).toBe("active");
  });
});

describe("countUnlistenedInOtherView / otherViewHintText (madde 1, wave 2)", () => {
  const pts = [
    { id: "p1", view: "front" as const },
    { id: "p2", view: "front" as const },
    { id: "p3", view: "back" as const },
    { id: "p4", view: "back" as const },
  ];
  it("yalnız öbür görünümdeki, pointIds içinde olan ve dinlenmemiş noktaları sayar", () => {
    expect(countUnlistenedInOtherView(pts, ["p1", "p2", "p3", "p4"], "front", {})).toBe(2);
    expect(countUnlistenedInOtherView(pts, ["p1", "p2", "p3", "p4"], "front", { p3: { listenMs: 400 } })).toBe(1);
  });
  it("pointIds verilmezse tüm öbür-görünüm noktaları sayılır", () => {
    expect(countUnlistenedInOtherView(pts, undefined, "back", {})).toBe(2);
  });
  it('otherViewHintText: sayı 0 ise null, değilse "Arka/Ön görünümde N bölge daha"', () => {
    expect(otherViewHintText("front", 0)).toBeNull();
    expect(otherViewHintText("front", 3)).toBe("Arka görünümde 3 bölge daha");
    expect(otherViewHintText("back", 1)).toBe("Ön görünümde 1 bölge daha");
  });
});

/* ---------------- madde 5 (wave 2): zayıf alan → Öğrenme odağı ---------------- */
describe("libraryKeyForCase / firstWeakLibraryKey / weakDomainKeys (madde 5, wave 2)", () => {
  const libraryItems = [
    { key: "heart.normal", category: "heart", acousticFinding: "normal" },
    { key: "heart.s3", category: "heart", acousticFinding: "s3" },
    { key: "lung.normal", category: "lung", acousticFinding: "normal" },
  ];
  it("libraryKey doluysa doğrudan onu kullanır", () => {
    const c = { libraryKey: "heart.s3", primaryAcousticFinding: "normal", soundAssignments: [{ category: "heart" }] };
    expect(libraryKeyForCase(c, libraryItems)).toBe("heart.s3");
  });
  it("libraryKey yoksa kategori + akustik bulgu eşleşmesiyle bulur (heart.normal ≠ lung.normal)", () => {
    const heartCase = { primaryAcousticFinding: "normal", soundAssignments: [{ category: "heart" }] };
    const lungCase = { primaryAcousticFinding: "normal", soundAssignments: [{ category: "lung" }] };
    expect(libraryKeyForCase(heartCase, libraryItems)).toBe("heart.normal");
    expect(libraryKeyForCase(lungCase, libraryItems)).toBe("lung.normal");
  });
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
  it("firstWeakLibraryKey: hiç yanlış yoksa veya eşleşme yoksa null", () => {
    expect(firstWeakLibraryKey([{ caseId: "c1", answers: [{ correct: true }] }], () => "heart.s3")).toBeNull();
    expect(firstWeakLibraryKey([{ caseId: "c1", answers: [{ correct: false }] }], () => null)).toBeNull();
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
  it("weakDomainKeys: domains null ise boş dizi", () => {
    expect(weakDomainKeys(null)).toEqual([]);
  });
});

/* ---------------- madde 5 (wave 3): interaktif öğretici — saf adım-makinesi ---------------- */
describe("tutorialProgress (madde 5, wave 3)", () => {
  it("hiç olay yoksa hiçbir adım tamam değildir, sıradaki adım 0", () => {
    const p = tutorialProgress([]);
    expect(p.steps).toEqual([false, false, false]);
    expect(p.currentStep).toBe(0);
    expect(p.allDone).toBe(false);
  });
  it("yalnız drag olayı: 1. adım tamam, sıradaki 1", () => {
    const p = tutorialProgress(["drag"]);
    expect(p.steps).toEqual([true, false, false]);
    expect(p.currentStep).toBe(1);
    expect(p.allDone).toBe(false);
  });
  it("sıra bağımsızdır — snap, drag olmadan da gelebilir (ör. klavye ile yerleştirme)", () => {
    const p = tutorialProgress(["snap"]);
    expect(p.steps).toEqual([false, true, false]);
    expect(p.currentStep).toBe(0);
  });
  it("tekrarlanan olaylar tekrar sayılmaz, sonucu değiştirmez", () => {
    const p = tutorialProgress(["drag", "drag", "snap"]);
    expect(p.steps).toEqual([true, true, false]);
    expect(p.currentStep).toBe(2);
  });
  it("üç olay da gelince hepsi tamam, allDone true, currentStep 3", () => {
    const p = tutorialProgress(["drag", "snap", "head"]);
    expect(p.steps).toEqual([true, true, true]);
    expect(p.currentStep).toBe(3);
    expect(p.allDone).toBe(true);
  });
});

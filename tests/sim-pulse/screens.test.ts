import { describe, expect, it } from "vitest";
import {
  PULSE_SOURCES,
  PULSE_TUTORIAL_STEPS,
  buildAboutLimitations,
  createPulseAboutView,
  createTutorialStepViews,
  renderPulseAboutMarkup,
  shouldRunPulseTutorial,
} from "../../packages/sim-pulse/src/index";

describe("Pulse screens yardımcıları", () => {
  it("öğretici 3 adımı kaynak metinle korur", () => {
    expect(PULSE_TUTORIAL_STEPS).toEqual([
      {
        title: "Bir EKG sonucu kartı seç",
        description: "Yatay şeritten bir ritim seçin; kalp, EKG ve açıklama birlikte güncellenir.",
      },
      {
        title: "EKG’yi oynat ve bir derivasyona tıkla",
        description: "Oynat’a basın ve izlerden birine tıklayarak o derivasyonu ölçüme seçin.",
      },
      {
        title: "Kaliperi aç ve ölçüm yap",
        description: "Kaliper’i açıp iki çizgiyi sürükleyin; süre ve voltaj farkı okunur.",
      },
    ]);
    expect(createTutorialStepViews(1).map((step) => step.status)).toEqual(["done", "current", "upcoming"]);
    expect(createTutorialStepViews(9).every((step) => step.status === "done")).toBe(true);
  });

  it("öğreticiyi sadece ilk kullanım koşulunda başlatır", () => {
    const ready = {
      tutorialDone: false,
      tutorialSeen: false,
      viewed: { normal: 0, af: 0, stemi: 0 },
      caseSubmitted: Array(10).fill(false),
      quizSubmitted: Array(10).fill(false),
    };
    expect(shouldRunPulseTutorial(ready)).toBe(true);
    expect(shouldRunPulseTutorial({ ...ready, tutorialDone: true })).toBe(false);
    expect(shouldRunPulseTutorial({ ...ready, viewed: { ...ready.viewed, normal: 0.1 } })).toBe(false);
    expect(shouldRunPulseTutorial({ ...ready, caseSubmitted: [true, ...Array(9).fill(false)] })).toBe(false);
  });

  it("about görünümü sources.json verisini assetBase ile kurar", () => {
    const view = createPulseAboutView({
      curriculumLimitations: "400 sentetik madde...",
      assetBase: "/sims/pulse",
    });
    expect(view.module.name).toBe("EGEMED Pulse™");
    expect(view.module.logoUrl).toBe("/sims/pulse/assets/ege-tip-logo.png");
    expect(view.references).toHaveLength(14);
    expect(view.references.map((reference) => reference.id)).toEqual(
      expect.arrayContaining(["BRADY2018", "ECG2007", "ESCPACE2021", "PERI2025", "MON2017", "PAC2019"]),
    );
    expect(view.credits[0]?.people[0]?.name).toBe("Doç. Dr. Ozan KARACA");
    expect(view.note).toBe(PULSE_SOURCES.note);
    expect(view.limitations[1]).toBe("Simülasyon eğitim amaçlıdır; tek başına klinik tanı koymak için kullanılamaz.");
    expect(view.limitations[2]).toBe(
      "EKG sinyalleri sentetiktir; harici EKG veri seti kullanılmamıştır. Atıf ve katkı verileri sources.json dosyasında saklanır.",
    );
    expect(buildAboutLimitations("x")[0]).toBe("x");
  });

  it("about markup atıf/lisans ve sentetik uyarısını HTML içinde taşır", () => {
    const view = createPulseAboutView({
      curriculumLimitations: "sentetik, tanı aracı değil",
      assetBase: "",
    });
    const html = renderPulseAboutMarkup(view);
    expect(html).toContain("EGEMED Pulse™ Etkileşimli EKG Simülatörü");
    expect(html).toContain("https://doi.org/10.1093/eurheartj/ehae176");
    expect(html).toContain("AHA/ACCF/HRS İntraventriküler İleti Standardı");
    expect(html).toContain("sentetik, tanı aracı değil");
    expect(html).toContain("tek başına klinik tanı koymak için kullanılamaz");
  });
});

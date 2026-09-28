import { describe, expect, it } from "vitest";
import { auscultaPublicCaseSchema, type SimSessionMode } from "../../packages/contracts/src/index";
import { ausculta } from "../../packages/assessment-bank/src/index";
import type { Question } from "../../packages/assessment-bank/src/ausculta/types";
import casesCore from "../../packages/assessment-bank/data/ausculta/cases.json" with { type: "json" };
import casesAuto from "../../packages/assessment-bank/data/ausculta/cases-auto.json" with { type: "json" };

// T233 — depo sahibi kararı (28 Eyl 2026): yalnız kalp → ön, yalnız akciğer → arka,
// karma → iki görünüm (dinlenecek noktası olanlar). Banka public case'i izinli
// görünümlere süzer; noktası olmayan görünüm ve oradaki noktalar hiç gitmez.

const ALL_CASES = [
  ...((casesCore as unknown as { cases: ausculta.CaseDef[] }).cases),
  ...((casesAuto as unknown as { cases: ausculta.CaseDef[] }).cases),
];
const MODES: readonly SimSessionMode[] = ["practice", "assessment", "challenge"];

let counter = 0;
const newToken = () => `tok_${(counter++).toString(36).padStart(10, "0")}`;
const random = () => 0.42;

function build(caseDef: ausculta.CaseDef, mode: SimSessionMode, index = 1) {
  return ausculta.buildPublicCase(caseDef, { index, mode, openedAt: "2026-09-28T10:00:00.000+03:00", newToken, random });
}

function categoryOf(caseDef: ausculta.CaseDef): "heart" | "lung" | "mixed" {
  return ausculta.caseCategory(caseDef);
}

describe("T233 görünüm kuralı — tüm vakalar", () => {
  it(`${ALL_CASES.length} vaka × ${MODES.length} mod için izinli görünüm boş değil`, () => {
    expect(ALL_CASES).toHaveLength(200);
    for (const caseDef of ALL_CASES) {
      for (const mode of MODES) {
        const plan = ausculta.publicCaseViewPlan(caseDef, mode);
        expect(plan.allowed.length, `${caseDef.id}/${mode}`).toBeGreaterThan(0);
        expect(new Set(plan.allowed).size).toBe(plan.allowed.length);
      }
    }
  });

  it("public case yalnız izinli görünümün noktalarını ve görünümlerini taşır", () => {
    for (const caseDef of ALL_CASES) {
      for (const mode of MODES) {
        const plan = ausculta.publicCaseViewPlan(caseDef, mode);
        const { publicCase } = build(caseDef, mode);
        expect(publicCase.views, `${caseDef.id}/${mode}`).toEqual(plan.allowed);
        for (const point of publicCase.points) {
          const view = ausculta.viewOfPoint(point.pointId);
          expect(view, `${caseDef.id}/${mode}/${point.pointId}`).toBeDefined();
          expect(plan.allowed, `${caseDef.id}/${mode}/${point.pointId}`).toContain(view);
        }
        expect(auscultaPublicCaseSchema.safeParse(publicCase).success, `${caseDef.id}/${mode}`).toBe(true);
      }
    }
  });

  it("her soru cevaplanabilir: doğru cevabın noktası izinli görünümde", () => {
    for (const caseDef of ALL_CASES) {
      for (const mode of MODES) {
        const plan = ausculta.publicCaseViewPlan(caseDef, mode);
        for (const question of caseDef.questions) {
          for (const option of question.options.filter((entry) => question.correct.includes(entry.id))) {
            for (const pointId of ausculta.optionPointIds(option.label)) {
              const view = ausculta.viewOfPoint(pointId);
              if (view === undefined) continue;
              expect(plan.allowed, `${caseDef.id}/${question.id}`).toContain(view);
            }
          }
        }
        // Public seçenek listesi sözleşmeye uyar (en az 2 seçenek).
        for (const question of build(caseDef, mode).publicCase.questions) {
          expect(question.options.length, `${caseDef.id}/${question.id}/${mode}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("uygulama dağılımı: kalp ön, akciğer yalnız arka, karma görünümlerin kesişimi", () => {
    const counts: Record<string, number> = {};
    for (const caseDef of ALL_CASES) {
      const edition = ausculta.publicCaseViewPlan(caseDef, "practice").allowed.join("+");
      counts[edition] = (counts[edition] ?? 0) + 1;
    }
    // Yalnız akciğer sesi olan vakada ön ancak arka sunulamıyorsa açılır (kural geri düşüşü).
    for (const caseDef of ALL_CASES) {
      if (categoryOf(caseDef) !== "lung") continue;
      const plan = ausculta.publicCaseViewPlan(caseDef, "practice");
      if (plan.allowed.includes("front")) {
        expect(ausculta.presentableViews(ausculta.presentedPointIds(caseDef, "practice")), caseDef.id).not.toContain("back");
      }
    }
    for (const [edition, count] of Object.entries(counts)) {
      console.log(`  uygulama ${edition}: ${count} vaka`);
    }
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(ALL_CASES.length);
  });

  it("akciğer-only uygulama vakasında public case'te ön nokta yok", () => {
    const caseDef = ausculta.caseById("case_normal_lung");
    if (caseDef === undefined) throw new Error("case_normal_lung yok");
    const { publicCase } = build(caseDef, "practice");
    expect(publicCase.views).toEqual(["back"]);
    expect(publicCase.points.length).toBeGreaterThan(0);
    for (const point of publicCase.points) expect(ausculta.viewOfPoint(point.pointId)).toBe("back");
  });

  it("O7 ile boşalan arka görünüm geri düşüşle öne açılır (plevral sürtünme)", () => {
    const caseDef = ausculta.caseById("case_pleural_rub");
    if (caseDef === undefined) throw new Error("case_pleural_rub yok");
    const practice = build(caseDef, "practice").publicCase;
    expect(practice.views).toEqual(["back"]);
    const assessment = build(caseDef, "assessment").publicCase;
    // Posterior kayıtlar değerlendirmede O7 ile sunulmaz; ön gerçek kayıtlar kalır.
    expect(assessment.views).toEqual(["front"]);
    for (const point of assessment.points) expect(ausculta.viewOfPoint(point.pointId)).toBe("front");
  });

  it("T234: pediatrik ronküs vakası üç modda yalnız arka görünüm açar; sorular cevaplanabilir", () => {
    const caseDef = ausculta.caseById("case_pediatric_rhonchi");
    if (caseDef === undefined) throw new Error("case_pediatric_rhonchi yok");
    expect((caseDef as ausculta.CaseDef & { readonly population?: string }).population).toBe("pediatrik");
    for (const mode of MODES) {
      const plan = ausculta.publicCaseViewPlan(caseDef, mode);
      expect(plan.allowed, mode).toEqual(["back"]);
      expect(plan.pointIds, mode).toHaveLength(4);
      for (const pointId of plan.pointIds) {
        expect(ausculta.viewOfPoint(pointId), `${mode}/${pointId}`).toBe("back");
        expect(pointId.endsWith("_posterior"), `${mode}/${pointId}`).toBe(true);
      }
      const { publicCase } = build(caseDef, mode);
      expect(publicCase.views, mode).toEqual(["back"]);
      expect(publicCase.points.map((point) => point.pointId).sort(), mode).toEqual([...plan.pointIds].sort());
      for (const point of publicCase.points) {
        expect(point.audio.diaphragm ?? point.audio.bell, `${mode}/${point.pointId}`).toBeDefined();
      }
      expect(publicCase.questions, mode).toHaveLength(4);
      for (const question of publicCase.questions) {
        expect(question.options.length, `${mode}/${question.id}`).toBeGreaterThanOrEqual(2);
      }
    }
    // Değerlendirmede posterior noktalar gerçek SPRSound kayıtları olduğu için sunulur (O7).
    const { publicCase, keys } = build(caseDef, "assessment");
    const pointIds = publicCase.points.map((point) => point.pointId);
    expect(pointIds).toHaveLength(4);
    const answers = Object.fromEntries(
      caseDef.questions.map((question) => [
        question.id,
        question.correct.map((optionId) => Object.keys(keys.options[question.id] ?? {}).find((token) => keys.options[question.id]?.[token] === optionId) ?? ""),
      ]),
    );
    const telemetry = {
      visits: Object.fromEntries(pointIds.map((id, index) => [id, { dwellMs: 60_000, listenMs: 60_000, visits: 1, firstOrder: index }])),
      order: [...pointIds],
      headChanges: 0,
      headUse: { bell: 0, diaphragm: 0 },
      replayCount: 0,
    };
    const result = ausculta.gradeCase(caseDef, keys, { index: 1, mode: "assessment", answers, telemetry, hintsUsed: 0 });
    expect(result.questions.every((question) => question.correct)).toBe(true);
  });

  it("teknik rubriği yalnız sunulan noktaları ölçer: tam dinleme teknik tam puan", () => {
    const telemetryFor = (pointIds: readonly string[]) => ({
      visits: Object.fromEntries(pointIds.map((id, index) => [id, { dwellMs: 60_000, listenMs: 60_000, visits: 1, firstOrder: index }])),
      order: [...pointIds],
      headChanges: 0,
      headUse: { bell: 0, diaphragm: 0 },
      replayCount: 0,
    });
    for (const caseDef of ALL_CASES) {
      for (const mode of MODES) {
        const { publicCase, keys } = build(caseDef, mode);
        const pointIds = publicCase.points.map((point) => point.pointId);
        const result = ausculta.gradeCase(caseDef, keys, { index: 1, mode, answers: {}, telemetry: telemetryFor(pointIds), hintsUsed: 0 });
        const technique = result.domains["technique"];
        expect(technique, `${caseDef.id}/${mode}`).toBeDefined();
        expect(technique?.earned, `${caseDef.id}/${mode}`).toBe(technique?.max);
      }
    }
  });

  it("soru seçenekleri izinli görünüme süzülür; doğru cevap gizliyse görünüm eklenir", () => {
    const localizationQuestion: Question = {
      id: "q1",
      type: "localization",
      domain: "localization",
      prompt: "Hangi odak?",
      options: [
        { id: "a", label: "Mitral odak (apeks)" },
        { id: "b", label: "Aort odağı (sağ üst sternal kenar)" },
        { id: "c", label: "Sağ üst bölge (posterior)" },
      ],
      correct: ["a"],
      feedbackCorrect: "Doğru",
      feedbackIncorrect: "Yanlış",
    };
    const questions = [localizationQuestion];
    // Kalp kuralı önü açar; arka noktaya işaret eden yanlış seçenek süzülür.
    const heart = ausculta.applyViewRuleToQuestions(questions, ["front"]);
    expect(heart.allowed).toEqual(["front"]);
    expect(heart.questions[0]?.options.map((option) => option.id)).toEqual(["a", "b"]);
    // Doğru cevap gizli görünümdeki noktayı gösteriyorsa görünüm eklenir ve hiçbir seçenek süzülmez.
    const lung = ausculta.applyViewRuleToQuestions(questions, ["back"]);
    expect(lung.allowed).toEqual(["front", "back"]);
    expect(lung.questions[0]?.options.map((option) => option.id)).toEqual(["a", "b", "c"]);
    // Sözleşme gereği en az 2 seçenek: süzme sözleşmeyi bozacaksa uygulanmaz (güvenli geri düşüş).
    const narrow: Question[] = [
      {
        ...localizationQuestion,
        options: [
          { id: "a", label: "Mitral odak (apeks)" },
          { id: "b", label: "Sağ üst bölge (posterior)" },
        ],
      },
    ];
    const floored = ausculta.applyViewRuleToQuestions(narrow, ["front"]);
    expect(floored.questions[0]?.options.map((option) => option.id)).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vitest";
import { codedAttemptSummary, deterministicAttemptUuid, offsetIso, simSummaryCodes } from "../../apps/shell/src/reportAttempt";

describe("deterministik deneme kimliği", () => {
  it("aynı yerel kimlik aynı UUIDv5 biçimini üretir", async () => {
    const first = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-1");
    const second = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-1");
    const other = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-2");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("özet yalnız kodlu sayılardır; Z soneki ofsete döner", () => {
    expect(codedAttemptSummary({ score: 100, caseCount: 10 })).toEqual({ score: 100, correct: 10, total: 10 });
    expect(offsetIso("2026-09-24T12:00:00.000Z")).toBe("2026-09-24T12:00:00.000+00:00");
    expect(offsetIso("2026-09-24T15:00:00.000+03:00")).toBe("2026-09-24T15:00:00.000+03:00");
  });
});

describe("sime özgü kodlu özet (ADR-008)", () => {
  it("Pulse denemesi pulse.* kodlarını taşır; bozuk extra kodsuz kalır", () => {
    const codes = simSummaryCodes("pulse", {
      score: 90,
      extra: { ecgMode: "af", modeMastered: true, correctlyReadLeads: 3, caliperAccurate: null, rhythmRecognitionStreak: 4 },
    });
    expect(codes["pulse.v"]).toBe(1);
    expect(codes["pulse.streak"]).toBe(4);
    expect(simSummaryCodes("pulse", { score: 90, extra: { ecgMode: "yok" } })).toEqual({});
    expect(simSummaryCodes("opaca", { score: 90, extra: {} })).toEqual({});
  });

  it("Opaca denemesi opaca.* kodlarını taşır; sim konu/öğrenme sayacı eklemediyse o kodlar yazılmaz", () => {
    const codes = simSummaryCodes("opaca", {
      mode: "assessment",
      finishedAt: "2026-09-24T09:00:00.000Z",
      score: 90,
      caseCount: 10,
      hintsUsed: 0,
      extra: {
        findings: [{ finding: "pneumothorax", correct: true }],
        localizationHits: 10,
        abcdeComplete: 1,
        qualityCorrect: 2,
        interpretationCorrect: 3,
        fastPerfect: true,
      },
    });
    expect(codes["opaca.v"]).toBe(1);
    expect(codes["opaca.mode"]).toBe(1);
    expect(codes["opaca.loc"]).toBe(10);
    expect(codes["opaca.abcde"]).toBe(1);
    expect(codes["opaca.fast"]).toBe(1);
    expect(codes["opaca.t.pleura"]).toBeUndefined();
    expect(codes["opaca.learn"]).toBeUndefined();
    expect(simSummaryCodes("opaca", { score: 90, extra: { findings: "yok" } })).toEqual({});
  });

  it("sim'in eklediği konu ve öğrenme sayaçları kodlanır; bozuk öğrenme sayacı yok sayılır (S4, T140)", () => {
    const base = {
      mode: "assessment" as const,
      finishedAt: "2026-09-24T09:00:00.000Z",
      score: 90,
      caseCount: 10,
      hintsUsed: 0,
    };
    const extra = {
      findings: [{ finding: "pneumothorax", correct: true }],
      localizationHits: 1,
      abcdeComplete: 0,
      qualityCorrect: 0,
      interpretationCorrect: 0,
      fastPerfect: false,
      topicCorrect: { pleura: 2 },
    };
    const codes = simSummaryCodes("opaca", {
      ...base,
      extra: { ...extra, learn: { topicsCount: 4, stacksCount: 1, libraryTopicsTotal: 30, libraryTopicsCovered: 6 } },
    });
    expect(codes["opaca.t.pleura"]).toBe(2);
    expect(codes["opaca.learn"]).toBe(4);
    expect(codes["opaca.stacks"]).toBe(1);
    expect(codes["opaca.lib"]).toBe(30);
    expect(codes["opaca.cov"]).toBe(6);
    const broken = simSummaryCodes("opaca", { ...base, extra: { ...extra, learn: { topicsCount: "4" } } });
    expect(broken["opaca.learn"]).toBeUndefined();
    expect(broken["opaca.t.pleura"]).toBe(2);
  });

  it("Ausculta denemesi birikimli ausculta.* kodlarını taşır; bozuk extra kodsuz kalır", () => {
    const codes = simSummaryCodes("ausculta", {
      score: 70,
      extra: {
        listenDisciplineCases: 3,
        systematicExams: 1,
        cardiacFociExams: 0,
        posteriorLungExams: 0,
        heartCorrect: { normal: 2, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
        lungCorrect: { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 },
        pediatricCorrect: 0,
        mixedCorrect: 0,
        headChoiceCorrect: 1,
        correctDiagnosisCount: 2,
      },
    });
    expect(codes["ausculta.v"]).toBe(1);
    expect(codes["ausculta.listen"]).toBe(3);
    expect(codes["ausculta.sys"]).toBe(1);
    expect(codes["ausculta.diag"]).toBe(2);
    expect(codes["ausculta.h.normal"]).toBe(2);
    expect(codes["ausculta.h.extraSounds"]).toBeUndefined();
    expect(codes["ausculta.l.vesicular"]).toBeUndefined();
    expect(simSummaryCodes("ausculta", { score: 70, extra: { heartCorrect: {} } })).toEqual({});
  });
});

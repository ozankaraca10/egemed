import { describe, expect, it } from "vitest";
import {
  SUSPEND_LIMIT_12,
  SUSPEND_LIMIT_2004,
  deserializeSuspend,
  serializeSuspend,
} from "../../packages/sim-ausculta/src/index";
import type { SuspendPayload } from "../../packages/sim-ausculta/src/index";

describe("suspend data", () => {
  const payload: SuspendPayload = {
    v: 1,
    mode: "assessment",
    caseIndex: 2,
    step: 3,
    answers: { q1: ["a"], q2: ["a", "b"] },
    hintsUsed: 1,
    caseResults: [
      {
        caseId: "case_s3",
        total: 85,
        max: 100,
        mastery: true,
        domains: {
          technique: { earned: 20, max: 20 },
          localization: { earned: 20, max: 20 },
          recognition: { earned: 25, max: 25 },
          interpretation: { earned: 15, max: 20 },
          diagnosis: { earned: 0, max: 10 },
          systematic: { earned: 5, max: 5 },
        },
        answers: [],
        hintsUsed: 1,
      },
    ],
    tutorialDone: true,
    visits: { cardiac_mitral: { dwellMs: 5000, listenMs: 4200, visits: 2, firstOrder: 0 } },
    order: ["cardiac_mitral"],
    attempts: 1,
    sessionIds: [],
    sessionSeed: 0,
  };

  it("round-trip doğru çalışır", () => {
    const back = deserializeSuspend(serializeSuspend(payload));
    expect(back).not.toBeNull();
    expect(back!.mode).toBe("assessment");
    expect(back!.caseIndex).toBe(2);
    expect(back!.step).toBe(3);
    expect(back!.answers.q1).toEqual(["a"]);
    expect(back!.hintsUsed).toBe(1);
    expect(back!.tutorialDone).toBe(true);
    expect(back!.visits.cardiac_mitral!.dwellMs).toBe(5000);
    expect(back!.caseResults[0]!.total).toBe(85);
    expect(back!.caseResults[0]!.domains.technique.earned).toBe(20);
    expect(back!.caseResults[0]!.domains.diagnosis.max).toBe(10);
  });

  it("bozuk veri için null döner (çökmeme §37)", () => {
    expect(deserializeSuspend("{bozuk")).toBeNull();
    expect(deserializeSuspend("")).toBeNull();
    expect(deserializeSuspend(null)).toBeNull();
  });

  it("SCORM 1.2 limitine (4096 karakter) sığar", () => {
    const big: SuspendPayload = {
      ...payload,
      answers: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${i}`, ["a", "b"]])),
      visits: Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => [
          `point_${i}`,
          { dwellMs: 9000, listenMs: 8000, visits: 3, firstOrder: i },
        ]),
      ),
    };
    expect(serializeSuspend(big).length).toBeLessThanOrEqual(4096);
  });
});

describe("SCORM suspend boyut koruması (§27)", () => {
  const bigPayload = (): SuspendPayload => {
    const visits: SuspendPayload["visits"] = {};
    for (let i = 0; i < 200; i++) {
      visits[`lung_right_lower_posterior_${i}`] = { dwellMs: 12345, listenMs: 23456, visits: 3, firstOrder: i };
    }
    const caseResults = Array.from({ length: 10 }, (_, i) => ({
      caseId: `auto_mixed_normal_wheezing_lung_right_lower_anterior_${String(i).padStart(3, "0")}`,
      total: 87.5,
      max: 100,
      mastery: true,
      domains: {
        technique: { earned: 20, max: 20 },
        localization: { earned: 25, max: 25 },
        recognition: { earned: 40, max: 40 },
        interpretation: { earned: 15, max: 15 },
        diagnosis: { earned: 0, max: 0 },
        systematic: { earned: 5, max: 5 },
      },
      answers: [],
      hintsUsed: 0,
    }));
    return {
      v: 3,
      mode: "assessment",
      caseIndex: 7,
      step: 3,
      answers: { q1: ["a"], q2: ["b", "c"] },
      hintsUsed: 0,
      tutorialDone: true,
      attempts: 1,
      visits,
      order: Object.keys(visits),
      caseResults,
      sessionIds: Array.from({ length: 20 }, (_, i) => `auto_ped_early_systolic_murmur_aortic_${String(i).padStart(3, "0")}`),
      sessionSeed: 123456789,
    };
  };

  it("SCORM 1.2 limitinde (4096) serialize edilir ve geri okunur", () => {
    const s1 = serializeSuspend(bigPayload(), SUSPEND_LIMIT_12);
    expect(s1.length).toBeLessThanOrEqual(SUSPEND_LIMIT_12);
    const back = deserializeSuspend(s1);
    expect(back).not.toBeNull();
    expect(back!.mode).toBe("assessment");
    expect(back!.caseIndex).toBe(7);
    expect(back!.step).toBe(3);
    expect(back!.sessionIds.length).toBe(20);
    expect(back!.sessionSeed).toBe(123456789);
  });

  it("küçük yükte tam ayrıntı korunur (birim kaybı yok)", () => {
    const p = bigPayload();
    p.visits = { cardiac_aortic: { dwellMs: 4321, listenMs: 5000, visits: 2, firstOrder: 1 } };
    const s1 = serializeSuspend(p, SUSPEND_LIMIT_2004);
    const back = deserializeSuspend(s1)!;
    expect(back.visits.cardiac_aortic!.dwellMs).toBe(4321);
    expect(back.visits.cardiac_aortic!.firstOrder).toBe(1);
  });
});

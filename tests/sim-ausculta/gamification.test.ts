import { describe, expect, it } from "vitest";
import { assessmentXp, computeWeeklyGoals, evaluateBadges } from "../../packages/gamification-core/src/index";
import type { AttemptRecord, EarnedBadge } from "../../packages/gamification-core/src/index";
import { AUSCULTA_BADGES } from "../../packages/sim-ausculta/src/gamification/catalog";
import type { AuscultaStats } from "../../packages/sim-ausculta/src/gamification/catalog";
import { AUSCULTA_RULES } from "../../packages/sim-ausculta/src/gamification/rules";
import {
  CARDIAC_FOCI,
  POSTERIOR_LUNG_POINTS,
  buildAttemptRecord,
} from "../../packages/sim-ausculta/src/gamification/attempt";
import type { AuscultaCompletedCase } from "../../packages/sim-ausculta/src/gamification/attempt";
import type { CaseResult, ScoringWeights } from "../../packages/sim-ausculta/src/core/types";

const now = new Date("2026-09-24T10:00:00.000Z");
const ids = (earned: readonly EarnedBadge[]) => earned.map((badge) => badge.id);

const zeroStats = (patch: Partial<AuscultaStats> = {}): AuscultaStats => ({
  listenDisciplineCases: 0,
  systematicExams: 0,
  cardiacFociExams: 0,
  posteriorLungExams: 0,
  heartCorrect: { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
  lungCorrect: { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 },
  pediatricCorrect: 0,
  mixedCorrect: 0,
  headChoiceCorrect: 0,
  ...patch,
});

const domain = (earned: number, max = 1) => ({ earned, max });

function result(caseId: string, patch: Partial<CaseResult> = {}): CaseResult {
  const domains = {} as CaseResult["domains"];
  for (const key of ["technique", "localization", "recognition", "interpretation", "diagnosis", "systematic"] as const) {
    domains[key] = domain(1);
  }
  return {
    caseId,
    total: 100,
    max: 100,
    mastery: true,
    domains,
    answers: [],
    hintsUsed: 0,
    ...patch,
  };
}

function completed(patch: Partial<AuscultaCompletedCase> = {}): AuscultaCompletedCase {
  const id = patch.id ?? "case-1";
  return {
    id,
    result: result(id),
    population: null,
    assignments: [{ category: "heart", acousticFinding: "normal" }],
    requiredPoints: [...CARDIAC_FOCI],
    minListenMsPerPoint: 2500,
    listens: CARDIAC_FOCI.map((pointId) => ({ pointId, listenMs: 2500 })),
    findingRecognized: true,
    headChoiceCorrect: 0,
    ...patch,
  };
}

describe("Ausculta oyunlaştırması", () => {
  it("en az 16 abartısız Türkçe rozeti benzersiz kimlikle tanımlar", () => {
    expect(AUSCULTA_BADGES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(AUSCULTA_BADGES.map((badge) => badge.id)).size).toBe(AUSCULTA_BADGES.length);
    expect(AUSCULTA_BADGES.every((badge) => badge.name.length > 0 && badge.description.length > 0)).toBe(true);
    expect(AUSCULTA_BADGES.some((badge) => badge.description.includes("tanısı sayılmaz"))).toBe(true);
    expect(CARDIAC_FOCI).toEqual(["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"]);
    expect(POSTERIOR_LUNG_POINTS).toHaveLength(6);
    expect(POSTERIOR_LUNG_POINTS).not.toContain("cardiac_erb");
  });

  it("eşikte kazanır, eşiğin bir altında ve negatif sayaçta kazanmaz", () => {
    const at = zeroStats({ listenDisciplineCases: 3, systematicExams: 1, heartCorrect: { ...zeroStats().heartCorrect, normal: 3 } });
    const earned = ids(evaluateBadges(AUSCULTA_BADGES, at, [], { now }));
    expect(earned).toEqual(expect.arrayContaining(["listen-3", "systematic-1", "heart-normal"]));
    expect(earned).not.toContain("listen-8");
    expect(earned).not.toContain("systematic-5");
    const below = ids(evaluateBadges(AUSCULTA_BADGES, zeroStats({ listenDisciplineCases: 2, systematicExams: 0 }), [], { now }));
    expect(below).not.toContain("listen-3");
    expect(below).not.toContain("systematic-1");
    expect(ids(evaluateBadges(AUSCULTA_BADGES, zeroStats({ listenDisciplineCases: -1 }), [], { now }))).not.toContain("listen-3");
    expect(ids(evaluateBadges(AUSCULTA_BADGES, zeroStats(), [], { now }))).toEqual([]);
  });

  it("ses sınıfı ve pediatrik sayaç birbirine taşmaz; kazanılmış rozet yinelenmez", () => {
    const stats = zeroStats({
      heartCorrect: { ...zeroStats().heartCorrect, murmurTiming: 5 },
      pediatricCorrect: 5,
      lungCorrect: { ...zeroStats().lungCorrect, crackles: 4 },
    });
    const earned = ids(evaluateBadges(AUSCULTA_BADGES, stats, [], { now }));
    expect(earned).toEqual(expect.arrayContaining(["murmur-timing", "pediatric"]));
    expect(earned).not.toEqual(expect.arrayContaining(["lung-crackles", "heart-normal", "lung-vesicular"]));
    const again = evaluateBadges(AUSCULTA_BADGES, stats, earned.map((id) => ({ id, at: now.toISOString() })), { now });
    expect(again.map((badge) => badge.id)).not.toEqual(expect.arrayContaining(["murmur-timing", "pediatric"]));
  });

  it("haftalık hedefi Ausculta için ayarlar, XP çekirdeğini korur", () => {
    expect(AUSCULTA_RULES.week).toEqual({ assessmentSessionsGoal: 4, avgScoreGoal: 80, newBadgesGoal: 2 });
    const attempt: AttemptRecord = {
      id: "ausculta-test", mode: "assessment", finishedAt: now.toISOString(), score: 80, mastery: true,
      caseCount: 10, hintsUsed: 0, durationMs: 60_000, domains: {}, extra: {},
    };
    expect(assessmentXp(attempt, AUSCULTA_RULES)).toBe(120);
    const attempts = [0, 1, 2, 3].map((n) => ({ ...attempt, id: `a-${n}` }));
    const earned = ["listen-3", "heart-normal"].map((id) => ({ id, at: now.toISOString() }));
    const goals = computeWeeklyGoals(attempts, earned, now, AUSCULTA_RULES);
    expect(goals.goals.map((goal) => goal.done)).toEqual([true, true, true]);
  });

  it("dört odak, süre ve S1–S2 kredisini kayda yazar", () => {
    const record = buildAttemptRecord({
      sessionId: "oturum-1", mode: "assessment", cases: [completed()], durationMs: 90_000, finishedAt: now,
    });
    expect(record).toMatchObject({
      id: "ausculta-assessment-oturum-1",
      score: 100,
      mastery: true,
      caseCount: 1,
      domains: { technique: 100, systematic: 100, recognition: 100 },
      extra: {
        listenDisciplineCases: 1,
        systematicExams: 1,
        cardiacFociExams: 1,
        posteriorLungExams: 0,
        heartCorrect: { normal: 1, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
        pediatricCorrect: 0,
        mixedCorrect: 0,
      },
    });
  });

  it("süre eşiğinin altını, belirsiz normali ve pediatrik olmayanı kredilendirmez", () => {
    const short = completed({
      listens: CARDIAC_FOCI.map((pointId, index) => ({ pointId, listenMs: index === 0 ? 2499 : 2500 })),
    });
    expect(buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [short], durationMs: 1, finishedAt: now,
    })?.extra.listenDisciplineCases).toBe(0);
    expect(buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [short], durationMs: 1, finishedAt: now,
    })?.extra.cardiacFociExams).toBe(0);

    const zeroMin = completed({ minListenMsPerPoint: 0 });
    expect(buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [zeroMin], durationMs: 1, finishedAt: now,
    })?.extra.cardiacFociExams).toBe(0);

    const ambiguous = completed({
      assignments: [{ category: "mixed", acousticFinding: "normal" }],
    });
    const ambiguousRecord = buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [ambiguous], durationMs: 1, finishedAt: now,
    });
    expect(ambiguousRecord?.extra.heartCorrect.normal).toBe(0);
    expect(ambiguousRecord?.extra.lungCorrect.vesicular).toBe(0);
    expect(ambiguousRecord?.extra.mixedCorrect).toBe(0);

    const adult = completed({ population: "yetişkin" });
    expect(buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [adult], durationMs: 1, finishedAt: now,
    })?.extra.pediatricCorrect).toBe(0);

    const missed = completed({ findingRecognized: false, population: "pediatrik" });
    const missedRecord = buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [missed], durationMs: 1, finishedAt: now,
    });
    expect(missedRecord?.extra.pediatricCorrect).toBe(0);
    expect(missedRecord?.extra.heartCorrect.normal).toBe(0);
    expect(missedRecord?.extra.listenDisciplineCases).toBe(1);
  });

  it("S3 ile normal solunumu birlikte sayar; kısmi sistematiği ve eksik arkayı saymaz", () => {
    const mixed = completed({
      assignments: [{ category: "mixed", acousticFinding: "s3+normal" }],
      population: "pediatrik",
      listens: [
        ...CARDIAC_FOCI.map((pointId) => ({ pointId, listenMs: 2500 })),
        ...POSTERIOR_LUNG_POINTS.map((pointId) => ({ pointId, listenMs: 2500 })),
      ],
    });
    expect(buildAttemptRecord({
      sessionId: "s", mode: "assessment", cases: [mixed], durationMs: 1, finishedAt: now,
    })?.extra).toMatchObject({
      heartCorrect: { extraSounds: 1, normal: 0 },
      lungCorrect: { vesicular: 1 },
      mixedCorrect: 1,
      pediatricCorrect: 1,
      posteriorLungExams: 1,
      cardiacFociExams: 1,
    });

    const partialDomains = result("case-1");
    partialDomains.domains.systematic = domain(0.5);
    const partial = completed({ result: partialDomains, requiredPoints: [] });
    const partialRecord = buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [partial], durationMs: 1, finishedAt: now,
    });
    expect(partialRecord?.extra.systematicExams).toBe(0);
    expect(partialRecord?.extra.listenDisciplineCases).toBe(0);

    const fivePosterior = completed({
      requiredPoints: [],
      listens: POSTERIOR_LUNG_POINTS.slice(0, 5).map((pointId) => ({ pointId, listenMs: 2500 })),
    });
    expect(buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [fivePosterior], durationMs: 1, finishedAt: now,
    })?.extra.posteriorLungExams).toBe(0);
  });

  it("tek uygulama vakasında ipucu cezalı puanı korur", () => {
    const penalized = completed({
      result: result("case-1", { total: 75, mastery: false, hintsUsed: 1 }),
    });
    const record = buildAttemptRecord({
      sessionId: "s", mode: "practice", cases: [penalized], durationMs: 10, finishedAt: now,
    });
    expect(record).toMatchObject({ score: 75, mastery: false, hintsUsed: 1 });
  });

  it("boş veya bozuk oturumu reddeder", () => {
    const base = { sessionId: "s", mode: "practice" as const, cases: [completed()], durationMs: 1, finishedAt: now };
    expect(buildAttemptRecord({ ...base, cases: [] })).toBeNull();
    expect(buildAttemptRecord({ ...base, sessionId: "  " })).toBeNull();
    expect(buildAttemptRecord({ ...base, durationMs: -1 })).toBeNull();
    expect(buildAttemptRecord({ ...base, durationMs: Number.NaN })).toBeNull();
    expect(buildAttemptRecord({ ...base, finishedAt: new Date(Number.NaN) })).toBeNull();
    expect(buildAttemptRecord({ ...base, mode: "learn" as "practice" })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ result: result("case-1", { total: 101 }) })] })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ result: result("case-1", { hintsUsed: -1 }) })] })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ result: result("case-1", { hintsUsed: 1.5 }) })] })).toBeNull();
    const over = result("case-1");
    over.domains.technique = domain(2, 1);
    expect(buildAttemptRecord({ ...base, cases: [completed({ result: over })] })).toBeNull();
    const missing = result("case-1");
    delete (missing.domains as Partial<Record<keyof ScoringWeights, unknown>>).diagnosis;
    expect(buildAttemptRecord({ ...base, cases: [completed({ result: missing })] })).toBeNull();
    expect(buildAttemptRecord({
      ...base,
      cases: [completed({ id: "a" }), completed({ id: "a", result: result("a") })],
    })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ id: "a", result: result("b") })] })).toBeNull();
    expect(buildAttemptRecord({
      ...base,
      cases: [completed({ listens: [{ pointId: "cardiac_aortic", listenMs: 1 }, { pointId: "cardiac_aortic", listenMs: 2 }] })],
    })).toBeNull();
    expect(buildAttemptRecord({
      ...base,
      cases: [completed({ listens: [{ pointId: "cardiac_aortic", listenMs: -1 }] })],
    })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ minListenMsPerPoint: Number.NaN })] })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ headChoiceCorrect: -1 })] })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ headChoiceCorrect: 1.2 })] })).toBeNull();
    expect(buildAttemptRecord({ ...base, cases: [completed({ requiredPoints: ["cardiac_aortic", "cardiac_aortic"] })] })).toBeNull();
  });
});

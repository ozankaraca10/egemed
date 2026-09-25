import { describe, expect, it } from "vitest";
import {
  OPACA_BADGES,
  OPACA_BADGE_RULES,
  OPACA_SUMMARY_VERSION,
  OPACA_TOPICS,
  STUDY_KEY,
  encodeOpacaSummary,
  opacaStatsFromSummaries,
} from "../../packages/gami-catalogs/src/index";
import { OPACA_BADGES as SIM_OPACA_BADGES, STUDY_KEY as SIM_STUDY_KEY } from "../../packages/sim-opaca/src/gamification/catalog";
import { OPACA_RULES } from "../../packages/sim-opaca/src/gamification/rules";
import { computeStats, TOPIC_BADGE_MATCH } from "../../packages/sim-opaca/src/gamification/stats";
import type { OpacaAttemptRecord } from "../../packages/sim-opaca/src/gamification/attempt";
import { CT_STACKS_ITEM_KEY } from "../../packages/sim-opaca/src/gamification/attempt";
import { attemptSummarySchema, BADGE_KEY_PATTERN } from "../../packages/contracts/src/index";
import { evaluateBadges } from "../../packages/gamification-core/src/badges";

/** Deterministik tohumlu üreteç (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_MS = Date.UTC(2026, 8, 1);
const FIXED_NOW = new Date("2026-09-24T09:00:00.000Z");

/** Gerçek bulgu kimlikleri (findings.json) + eşleşmeyen bir junk kimlik. */
const FINDINGS_POOL = [
  "pneumothorax",
  "pleural_effusion",
  "pleural_thickening",
  "cardiomegaly",
  "nodule_mass",
  "tuberculosis",
  "tuberculosis_cavity",
  "tuberculosis_fibrosis",
  "miliary_pattern",
  "steeple_sign",
  "air_trapping",
  "foreign_body_radiopaque",
  "hiatal_hernia",
  "diaphragm_hernia_congenital",
  "elevated_hemidiaphragm",
  "fracture",
  "rib_fracture",
  "clavicle_fracture",
  "scoliosis",
  "westermark_sign",
  "hampton_hump",
  "ct_filling_defect",
  "bilinmeyen_bulgu",
] as const;

function randomAttempt(next: () => number, index: number): OpacaAttemptRecord {
  const caseCount = Math.floor(next() * 30) + 1;
  const assessment = next() < 0.55;
  const findings = Array.from({ length: Math.floor(next() * 4) }, () => ({
    finding: FINDINGS_POOL[Math.floor(next() * FINDINGS_POOL.length)]!,
    correct: next() < 0.6,
  }));
  return {
    id: `opaca-attempt-${index}`,
    mode: assessment ? "assessment" : "practice",
    finishedAt: new Date(BASE_MS + index * 3_600_000 + Math.floor(next() * 86_400_000 * 14)).toISOString(),
    score: Math.floor(next() * 101),
    mastery: next() < 0.5,
    caseCount,
    hintsUsed: Math.floor(next() * 4),
    durationMs: 60_000,
    domains: {},
    extra: {
      findings,
      localizationHits: Math.floor(next() * 20),
      abcdeComplete: next() < 0.4 ? 1 : 0,
      qualityCorrect: Math.floor(next() * Math.min(11, caseCount + 1)),
      interpretationCorrect: Math.floor(next() * Math.min(11, caseCount + 1)),
      fastPerfect: assessment && next() < 0.3,
    },
  };
}

function randomLearn(next: () => number) {
  const topics = Array.from({ length: Math.floor(next() * 12) }, (_, i) => `opaca:topic-${i}`);
  const stacks = Array.from({ length: Math.floor(next() * 4) }, (_, i) => `tcia_ct_${i}`);
  return { topics, items: { [CT_STACKS_ITEM_KEY]: stacks } };
}

/** Sim'in kayıt anındaki kodlu özet girdisi; birikimli sayaçlar altın istatistikten gelir. */
function toSummaryInput(attempt: OpacaAttemptRecord, counters: { topics: number; stacks: number; total: number; covered: number }) {
  const topicCorrect: Record<string, number> = {};
  if (attempt.mode === "assessment") {
    for (const f of attempt.extra.findings) {
      if (!f.correct) continue;
      for (const [topic, match] of Object.entries(TOPIC_BADGE_MATCH)) {
        if (match(f.finding)) topicCorrect[topic] = (topicCorrect[topic] ?? 0) + 1;
      }
    }
  }
  return {
    mode: attempt.mode,
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    caseCount: attempt.caseCount,
    hintsUsed: attempt.hintsUsed,
    extra: {
      localizationHits: attempt.extra.localizationHits,
      abcdeComplete: attempt.extra.abcdeComplete,
      qualityCorrect: attempt.extra.qualityCorrect,
      interpretationCorrect: attempt.extra.interpretationCorrect,
      fastPerfect: attempt.extra.fastPerfect,
      topicCorrect,
    },
    learn: {
      topicsCount: counters.topics,
      stacksCount: counters.stacks,
      libraryTopicsTotal: counters.total,
      libraryTopicsCovered: counters.covered,
    },
  };
}

describe("Opaca kodlu özet ve rozet istatistiği (ADR-008)", () => {
  it("rozet kimlikleri gami_badges biçimine uyar; konular sim eşlemesiyle aynı", () => {
    for (const badge of OPACA_BADGES) {
      expect(BADGE_KEY_PATTERN.test(badge.id), badge.id).toBe(true);
    }
    expect(Object.keys(TOPIC_BADGE_MATCH)).toEqual([...OPACA_TOPICS]);
    expect(OPACA_TOPICS).toHaveLength(OPACA_BADGES.filter((b) => b.category === "topic").length);
  });

  it("rozet eşikleri sim kurallarıyla aynıdır; tek kaynak sim-opaca kataloğudur", () => {
    expect(OPACA_BADGE_RULES).toEqual(OPACA_RULES.badges);
    expect(OPACA_BADGES).toBe(SIM_OPACA_BADGES);
    expect(STUDY_KEY).toBe(SIM_STUDY_KEY);
  });

  it("özetlerden türetilen istatistik denemelerden türetilenle birebir aynıdır (tohumlu tur)", () => {
    const next = rng(20260924);
    const ctx = { now: FIXED_NOW };
    for (let round = 0; round < 40; round += 1) {
      const attempts = Array.from({ length: 1 + Math.floor(next() * 12) }, (_, i) => randomAttempt(next, round * 100 + i));
      const learn = randomLearn(next);
      const gold = computeStats(attempts, learn, [], FIXED_NOW);
      const counters = {
        topics: gold.learnTopicsCount,
        stacks: gold.ctStacksCompletedCount,
        total: gold.allTopicsTotal,
        covered: gold.allTopicsCoveredCount,
      };
      const summaries = attempts.map((attempt) => encodeOpacaSummary(toSummaryInput(attempt, counters)));
      for (const summary of summaries) expect(attemptSummarySchema.safeParse(summary).success).toBe(true);
      const badgeStats = {
        streakLongest: gold.streakLongest,
        assessmentCount: gold.assessmentCount,
        practiceCaseTotal: gold.practiceCaseTotal,
        localizationHits: gold.localizationHits,
        abcdeCompleteCount: gold.abcdeCompleteCount,
        qualityCorrect: gold.qualityCorrect,
        interpretationCorrect: gold.interpretationCorrect,
        fastPerfectCount: gold.fastPerfectCount,
        bestAssessmentScore: gold.bestAssessmentScore,
        perfectSessionCount: gold.perfectSessionCount,
        noHintPracticeSessionCount: gold.noHintPracticeSessionCount,
        topicCorrect: gold.topicCorrect,
        learnTopicsCount: gold.learnTopicsCount,
        ctStacksCompletedCount: gold.ctStacksCompletedCount,
        allTopicsCoveredCount: gold.allTopicsCoveredCount,
        allTopicsTotal: gold.allTopicsTotal,
      };
      expect(opacaStatsFromSummaries(summaries)).toEqual(badgeStats);
      expect(evaluateBadges(OPACA_BADGES, opacaStatsFromSummaries(summaries), [], ctx).map((b) => b.id)).toEqual(
        evaluateBadges(SIM_OPACA_BADGES, badgeStats, [], ctx).map((b) => b.id),
      );
    }
  });

  it("bozuk, sürümsüz ya da sınır dışı kodlar istatistiği şişiremez", () => {
    const stats = opacaStatsFromSummaries([
      { "opaca.score": 999 },
      {
        "opaca.v": OPACA_SUMMARY_VERSION,
        "opaca.mode": 1,
        "opaca.score": 999,
        "opaca.loc": 99_999,
        "opaca.abcde": 9,
        "opaca.day": 5,
        "opaca.t.pleura": 99_999,
        "opaca.learn": 99_999,
        "opaca.bilinmeyen": 7,
      },
    ]);
    expect(stats.assessmentCount).toBe(1);
    expect(stats.bestAssessmentScore).toBe(100);
    expect(stats.localizationHits).toBe(10_000);
    expect(stats.abcdeCompleteCount).toBe(1);
    expect(stats.practiceCaseTotal).toBe(0);
    expect(stats.streakLongest).toBe(1);
    expect(stats.topicCorrect.pleura).toBe(1000);
    expect(stats.learnTopicsCount).toBe(99_999);
  });
});

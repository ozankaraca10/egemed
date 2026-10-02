/** `?demo=full|empty|winner` için hazır demo durumları (yalnız dev). */

import type { EarnedBadge } from "@egemed/gamification-core";
import { evaluateBadges } from "@egemed/gamification-core";
import { startOfMonthTr } from "@egemed/gamification-core";
import { FINDINGS } from "../data/terminology";
import { OPACA_BADGES } from "./catalog";
import type { OpacaAttemptRecord } from "./attempt";
import { computeStats } from "./stats";
import { emptyState, type OpacaGamiState } from "./storage";

export type DemoKind = "full" | "empty" | "winner";

const DAY_MS = 86_400_000;

function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEACHING_FINDING_IDS = Object.entries(FINDINGS)
  .filter(([, def]) => def.teaching)
  .map(([id]) => id);

function mkAttempt(over: Partial<OpacaAttemptRecord> & Pick<OpacaAttemptRecord, "id" | "mode" | "finishedAt">): OpacaAttemptRecord {
  const { extra: extraPartial, ...rest } = over;
  return {
    score: 0,
    mastery: false,
    caseCount: 1,
    hintsUsed: 0,
    durationMs: 5 * 60_000,
    domains: {},
    ...rest,
    extra: {
      findings: [],
      localizationHits: 0,
      abcdeComplete: 0,
      qualityCorrect: 0,
      interpretationCorrect: 0,
      fastPerfect: false,
      ...extraPartial,
    },
  };
}

function isoAtOffset(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * DAY_MS).toISOString();
}

function replayEarned(state: OpacaGamiState): EarnedBadge[] {
  const sorted = [...state.attempts].sort((a, b) => (a.finishedAt < b.finishedAt ? -1 : 1));
  let earned: EarnedBadge[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const at = new Date(sorted[i]!.finishedAt);
    const stats = computeStats(sorted.slice(0, i + 1), state.learn, earned, at);
    earned = [...earned, ...evaluateBadges(OPACA_BADGES, stats, earned, { now: at })];
  }
  return earned;
}

function demoStateEmpty(): OpacaGamiState {
  return emptyState();
}

function demoStateFull(now: Date): OpacaGamiState {
  const rng = mulberry32(seedFromString("opaca-demo-full"));
  const attempts: OpacaAttemptRecord[] = [];
  const assessmentOffsets = [0, 1, 2, ...Array.from({ length: 25 }, (_, i) => 5 + i * 3)];
  assessmentOffsets.forEach((daysAgo, i) => {
    const score = Math.round((70 + rng() * 28) * 10) / 10;
    const findingId = TEACHING_FINDING_IDS[i % TEACHING_FINDING_IDS.length]!;
    const correct = rng() > 0.15;
    attempts.push(
      mkAttempt({
        id: `demo-full-assess-${i}`,
        mode: "assessment",
        finishedAt: isoAtOffset(now, daysAgo),
        score,
        mastery: score >= 80,
        caseCount: 5,
        hintsUsed: 0,
        extra: {
          findings: [{ finding: findingId, correct }],
          localizationHits: correct ? 1 : 0,
          abcdeComplete: i % 3 === 0 ? 1 : 0,
          qualityCorrect: correct ? 2 : 1,
          interpretationCorrect: correct ? 2 : 1,
          fastPerfect: score >= 90 && i % 4 === 0,
        },
        domains: {
          technique: Math.min(100, Math.round(score + 6)),
          systematic: Math.round(score - 4),
          quality: Math.min(100, Math.round(score + 3)),
          recognition: Math.round(score),
          localization: Math.round(score - 10),
          interpretation: Math.round(score - 27),
          diagnosis: Math.round(score - 18),
        },
      }),
    );
  });
  const practiceOffsets = [4, 7, 34, 37, 65, 68];
  practiceOffsets.forEach((daysAgo, i) => {
    attempts.push(
      mkAttempt({
        id: `demo-full-practice-${i}`,
        mode: "practice",
        finishedAt: isoAtOffset(now, daysAgo),
        caseCount: 7,
        hintsUsed: 0,
        mastery: i % 2 === 0,
        score: 0,
      }),
    );
  });
  const learn = {
    topics: [
      "technique.systematic",
      "technique.projection",
      "finding.pneumothorax",
      "finding.pleural_effusion",
      "finding.cardiomegaly",
      "finding.nodule_mass",
      "finding.tuberculosis",
      "finding.fracture",
      "finding.hiatal_hernia",
      "finding.westermark_sign",
      "ct.axial_anatomy",
      "ct.windows",
    ],
    items: { ctStacks: ["ct-thorax-demo-1"] },
  };
  const state: OpacaGamiState = {
    v: 1,
    attempts,
    learn,
    earned: [],
    profile: { displayName: "Selin Çelik", public: true, cohort: 5 },
  };
  state.earned = replayEarned(state);
  return state;
}

function demoStateWinner(now: Date): OpacaGamiState {
  const rng = mulberry32(seedFromString("opaca-demo-winner"));
  const thisMonthStart = startOfMonthTr(now);
  const prevMonthAnchor = new Date(thisMonthStart.getTime() - DAY_MS);
  const prevMonthStart = startOfMonthTr(prevMonthAnchor);
  const dayOffsetsIntoMonth = [2, 5, 9, 14, 18];
  const attempts: OpacaAttemptRecord[] = dayOffsetsIntoMonth.map((d, i) => {
    const finishedAt = new Date(prevMonthStart.getTime() + d * DAY_MS).toISOString();
    const score = Math.round((90 + rng() * 9) * 10) / 10;
    const findingId = TEACHING_FINDING_IDS[i % TEACHING_FINDING_IDS.length]!;
    return mkAttempt({
      id: `demo-winner-assess-${i}`,
      mode: "assessment",
      finishedAt,
      score,
      mastery: true,
      caseCount: 5,
      extra: {
        findings: [{ finding: findingId, correct: true }],
        localizationHits: 3,
        abcdeComplete: 1,
        qualityCorrect: 3,
        interpretationCorrect: 3,
        fastPerfect: i === 0,
      },
    });
  });
  const learn = {
    topics: ["technique.systematic", "finding.pneumothorax", "finding.cardiomegaly"],
    items: {},
  };
  const state: OpacaGamiState = {
    v: 1,
    attempts,
    learn,
    earned: [],
    profile: { displayName: "Demo Kazanan", public: true, cohort: 4 },
  };
  state.earned = replayEarned(state);
  return state;
}

export function demoStateFor(kind: DemoKind, now: Date): OpacaGamiState {
  switch (kind) {
    case "empty":
      return demoStateEmpty();
    case "winner":
      return demoStateWinner(now);
    case "full":
      return demoStateFull(now);
  }
}

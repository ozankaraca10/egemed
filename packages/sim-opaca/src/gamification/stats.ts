/** EGEMED Opaca — deneme geçmişinden toplu istatistik (rozet/hedef girdisi). */

import type { EarnedBadge, LearnActivity } from "@egemed/gamification-core";
import { computeStreak, levelForXp, totalXpFor } from "@egemed/gamification-core";
import type { OpacaStats as OpacaBadgeStats } from "@egemed/gami-catalogs";
import { FINDINGS, LIBRARY_ITEMS } from "../data/terminology";
import type { OpacaAttemptRecord, OpacaLearnCounters } from "./attempt";
import { CT_STACKS_ITEM_KEY } from "./attempt";
import { OPACA_RULES } from "./rules";

/** Rozet konu eşlemesi — findings.json gruplarından türetilir. */
export const TOPIC_BADGE_MATCH: Record<string, (findingId: string) => boolean> = {
  pleura: (id) => FINDINGS[id]?.group === "pleura",
  cardiac: (id) => FINDINGS[id]?.group === "cardiac",
  nodule: (id) => id === "nodule_mass",
  tb: (id) => FINDINGS[id]?.group === "infection",
  pediatric: (id) => FINDINGS[id]?.group === "pediatric",
  diaphragm: (id) => FINDINGS[id]?.group === "diaphragm",
  bone: (id) => FINDINGS[id]?.group === "bone" && id.endsWith("fracture"),
  vascular: (id) => FINDINGS[id]?.group === "vascular",
};

/** UI'nin tükettiği tam istatistik: rozet alanları `@egemed/gami-catalogs`'tan (ADR-008),
 *  XP/düzey/seri/rozet sayısı sim'e özgü kalan alanlar. */
export interface OpacaStats extends OpacaBadgeStats {
  totalXp: number;
  level: number;
  streakCurrent: number;
  earnedBadgeCount: number;
}

export function computeStats(
  attempts: OpacaAttemptRecord[],
  learn: LearnActivity,
  earned: EarnedBadge[],
  now: Date,
): OpacaStats {
  const assessments = attempts.filter((a) => a.mode === "assessment");
  const practices = attempts.filter((a) => a.mode === "practice");

  const totalXp = totalXpFor(attempts, learn, OPACA_RULES);
  const { level } = levelForXp(totalXp, OPACA_RULES);
  const { current: streakCurrent, longest: streakLongest } = computeStreak(attempts, now);

  const localizationHits = assessments.reduce((s, a) => s + a.extra.localizationHits, 0);
  const abcdeCompleteCount = assessments.reduce((s, a) => s + a.extra.abcdeComplete, 0);
  const qualityCorrect = assessments.reduce((s, a) => s + a.extra.qualityCorrect, 0);
  const interpretationCorrect = assessments.reduce((s, a) => s + a.extra.interpretationCorrect, 0);
  const fastPerfectCount = assessments.filter((a) => a.extra.fastPerfect).length;
  const bestAssessmentScore = assessments.reduce((max, a) => Math.max(max, a.score), 0);
  const perfectSessionCount = assessments.filter((a) => a.score === 100).length;
  const noHintPracticeSessionCount = practices.filter(
    (a) => a.hintsUsed === 0 && a.caseCount >= OPACA_RULES.badges.noHintsCaseMin,
  ).length;
  const practiceCaseTotal = practices.reduce((s, a) => s + a.caseCount, 0);

  const topicCorrect: Record<string, number> = {};
  for (const key of Object.keys(TOPIC_BADGE_MATCH)) topicCorrect[key] = 0;
  const correctFindingsByTopic = new Set<string>();
  for (const a of assessments) {
    for (const f of a.extra.findings) {
      if (!f.correct) continue;
      for (const [topicId, match] of Object.entries(TOPIC_BADGE_MATCH)) {
        if (match(f.finding)) topicCorrect[topicId] = (topicCorrect[topicId] ?? 0) + 1;
      }
    }
  }
  for (const a of assessments) {
    for (const f of a.extra.findings) {
      if (f.correct) correctFindingsByTopic.add(f.finding);
    }
  }

  const learnTopicsCount = new Set(learn.topics).size;
  const ctStacksCompletedCount = new Set(learn.items[CT_STACKS_ITEM_KEY] ?? []).size;
  const learnTopicSet = new Set(learn.topics);

  let allTopicsCoveredCount = 0;
  for (const item of LIBRARY_ITEMS) {
    if (item.finding) {
      if (correctFindingsByTopic.has(item.finding)) allTopicsCoveredCount++;
    } else if (learnTopicSet.has(item.key)) {
      allTopicsCoveredCount++;
    }
  }

  return {
    totalXp,
    level,
    streakCurrent,
    streakLongest,
    assessmentCount: assessments.length,
    practiceCaseTotal,
    localizationHits,
    abcdeCompleteCount,
    qualityCorrect,
    interpretationCorrect,
    fastPerfectCount,
    bestAssessmentScore,
    perfectSessionCount,
    noHintPracticeSessionCount,
    topicCorrect,
    learnTopicsCount,
    ctStacksCompletedCount,
    allTopicsCoveredCount,
    allTopicsTotal: LIBRARY_ITEMS.length,
    earnedBadgeCount: earned.length,
  };
}

/** Bu denemedeki konu başına doğru bulgu sayısı (yalnız değerlendirme; `computeStats` ile aynı sayım). */
export function attemptTopicCorrect(attempt: OpacaAttemptRecord): Record<string, number> {
  const counts: Record<string, number> = {};
  if (attempt.mode !== "assessment") return counts;
  for (const f of attempt.extra.findings) {
    if (!f.correct) continue;
    for (const [topicId, match] of Object.entries(TOPIC_BADGE_MATCH)) {
      if (match(f.finding)) counts[topicId] = (counts[topicId] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * ADR-008 S4: sunucuya raporlanan deneme, konu ve öğrenme rozetleri için sim verisi gerektiren
 * sayaçlarla zenginleştirilir (kabuk bunları kodlu özete çevirir). Yerel kayıt değişmez.
 * `learnKnown` false ise (öğrenme etkinliği bu depoda tutulmuyorsa) öğrenme sayaçları eklenmez;
 * sunucu bunları en büyük değer olarak birleştirdiği için eksik değer eskisini düşürmez.
 */
export function withServerCounters(attempt: OpacaAttemptRecord, stats: OpacaStats, learnKnown: boolean): OpacaAttemptRecord {
  const learn: OpacaLearnCounters = {
    topicsCount: stats.learnTopicsCount,
    stacksCount: stats.ctStacksCompletedCount,
    libraryTopicsTotal: stats.allTopicsTotal,
    libraryTopicsCovered: stats.allTopicsCoveredCount,
  };
  return {
    ...attempt,
    extra: {
      ...attempt.extra,
      topicCorrect: attemptTopicCorrect(attempt),
      ...(learnKnown ? { learn } : {}),
    },
  };
}

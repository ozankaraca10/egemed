/** EGEMED Pulse — sonuç ekranı kazanım modeli (`@egemed/gami-ui` GamiGainsModel).
 *  Opaca `sessionGains.ts` ve Ausculta `gains.ts` emsali: oturum XP'si, yeni ya da
 *  sıradaki rozet ve düzey ilerlemesi. Saf fonksiyon; zaman `now` parametresidir. */

import {
  BADGE_CATEGORY_LABEL,
  BADGE_TIER_LABEL,
  attemptXp,
  badgeViews,
  levelForXp,
  sortBadgeViews,
  totalXpFor,
  trDate,
} from "@egemed/gamification-core";
import type { BadgeView } from "@egemed/gamification-core";
import type { GamiBadgeModel, GamiGainsModel } from "@egemed/gami-ui";
import type { PulseAttemptRecord } from "./attempt";
import { PULSE_BADGES } from "./catalog";
import type { PulseStats } from "./catalog";
import { computePulseStats } from "./repo";
import type { PulseGamiState } from "./repo";
import { PULSE_RULES } from "./rules";

function toGamiBadge(view: BadgeView<PulseStats>): GamiBadgeModel {
  return {
    id: view.def.id,
    name: view.def.name,
    tier: view.def.tier ?? null,
    tierLabel: view.def.tier ? BADGE_TIER_LABEL[view.def.tier] : null,
    description: view.def.description,
    category: view.def.category,
    categoryLabel: BADGE_CATEGORY_LABEL[view.def.category],
    state: view.state,
    value: view.value,
    max: view.max,
    earnedLabel: view.earnedAt ? trDate(view.earnedAt) : null,
    rule: view.rule,
    studyKey: view.studyKey,
    iconName: view.def.icon ?? "Star",
    lockedNote: null,
    assessmentOnly: view.def.category === "topic" || view.def.category === "skill",
  };
}

export interface PulseSessionGainsInput {
  /** Yazımdan sonraki durum (yeni deneme ve rozetler dahil). */
  readonly state: PulseGamiState;
  /** Yazımla yeni kazanılan rozet kimlikleri. */
  readonly earnedIds: readonly string[];
  readonly attempt: PulseAttemptRecord;
  readonly now: Date;
}

/** Sonuç kartı: bu oturumun XP'si, yeni veya sıradaki rozet ve düzey ilerlemesi. */
export function pulseSessionGains(input: PulseSessionGainsInput): GamiGainsModel {
  const views = badgeViews(PULSE_BADGES, computePulseStats(input.state.attempts), input.state.earned, { now: input.now });
  const freshIds = new Set(input.earnedIds);
  const fresh = views.filter((view) => freshIds.has(view.def.id));
  const next = sortBadgeViews(views).find((view) => view.state === "progress") ?? null;
  const picked = fresh[0] ?? next;
  const level = levelForXp(totalXpFor(input.state.attempts, input.state.learn, PULSE_RULES), PULSE_RULES);
  const bonus = input.attempt.mode === "assessment" && input.attempt.score >= PULSE_RULES.xp.assessmentBonusThreshold
    ? PULSE_RULES.xp.assessmentBonus
    : 0;
  return {
    badge: picked ? toGamiBadge(picked) : null,
    badgeFresh: fresh.length > 0,
    xp: attemptXp(input.attempt, PULSE_RULES),
    bonus,
    level: level.level,
    xpInto: level.xpIntoLevel,
    xpSpan: level.levelEndXp - level.levelStartXp,
    xpToNext: level.xpToNext,
    rank: null,
    confetti: fresh.length > 0 && input.attempt.mastery,
  };
}

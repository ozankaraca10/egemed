import { attemptXp, badgeViews, levelForXp, type AttemptRecord, type GamiMode, type Period } from "@egemed/gamification-core";
import type { GamiBadgeModel, GamiGainsModel } from "@egemed/gami-ui";
import { buildAchievementsModel } from "@egemed/gami-ui";
import { AUSCULTA_BADGES, type AuscultaStats } from "./catalog";
import { AUSCULTA_RULES } from "./rules";
import type { AuscultaGamiState } from "./repo";

/** Sonuç kartı: bu oturumun XP'si, sıradaki veya yeni rozet ve yerel sıra. */
export function auscultaSessionGains(input: {
  state: AuscultaGamiState;
  now: Date;
  mode: GamiMode;
  score: number;
  mastery: boolean;
  caseCount: number;
  hintsUsed: number;
  durationMs: number;
  rank: { period: Period; rank: number | null; of: number } | null;
}): GamiGainsModel {
  const session = [...input.state.attempts]
    .filter((item) => item.mode === input.mode)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, input.mode === "assessment" ? 1 : Math.max(1, input.caseCount));
  const synthetic: AttemptRecord<string, AuscultaStats> = {
    id: "session",
    mode: input.mode,
    finishedAt: input.now.toISOString(),
    score: input.score,
    mastery: input.mastery,
    caseCount: input.caseCount,
    hintsUsed: input.hintsUsed,
    durationMs: input.durationMs,
    domains: {},
    extra: input.state.stats,
  };
  const xp = (session.length ? session : [synthetic]).reduce((sum, item) => sum + attemptXp(item, AUSCULTA_RULES), 0);
  const bonus = input.mode === "assessment" && input.score >= AUSCULTA_RULES.xp.assessmentBonusThreshold ? AUSCULTA_RULES.xp.assessmentBonus : 0;
  const freshAt = session[0]?.finishedAt ?? "";
  const freshIds = new Set(input.state.earned.filter((badge) => freshAt !== "" && badge.at >= freshAt).map((badge) => badge.id));
  const views = badgeViews(AUSCULTA_BADGES, input.state.stats, input.state.earned, { now: input.now });
  const fresh = views.filter((view) => view.state === "earned" && freshIds.has(view.def.id));
  const next = views.filter((view) => view.state === "progress").sort((a, b) => b.value / Math.max(1, b.max) - a.value / Math.max(1, a.max))[0] ?? null;
  const picked = fresh[0] ?? next ?? null;
  const badges = buildAchievementsModel({
    now: input.now,
    period: "last30",
    attempts: input.state.attempts,
    rules: AUSCULTA_RULES,
    catalog: AUSCULTA_BADGES,
    stats: input.state.stats,
    earned: input.state.earned,
    badgeContext: { now: input.now },
    level: levelForXp(0, AUSCULTA_RULES),
    streak: { current: 0, longest: 0 },
    goals: { weekStartTr: input.now, goals: [] },
    profile: { public: false, displayName: null },
    weekRows: null,
    domainMeta: [],
  }).badges;
  const badge: GamiBadgeModel | null = picked ? badges.find((item) => item.id === picked.def.id) ?? null : null;
  const level = levelForXp(input.state.attempts.reduce((sum, item) => sum + attemptXp(item, AUSCULTA_RULES), 0), AUSCULTA_RULES);
  return {
    badge,
    badgeFresh: fresh.length > 0,
    xp,
    bonus,
    level: level.level,
    xpInto: level.xpIntoLevel,
    xpSpan: level.levelEndXp - level.levelStartXp,
    xpToNext: level.xpToNext,
    rank: input.rank ? { ...input.rank, delta: null } : null,
    confetti: fresh.length > 0 && input.mastery,
  };
}

/** Oyunlaştırma ekranlarının saf veri hazırlığı. Sim katalog, kural, istatistik ve alan metası parametredir. */
import type { ReactNode } from "react";
import {
  BADGE_CATEGORY_LABEL,
  BADGE_TIER_LABEL,
  achievementsRangeTr,
  badgeViews,
  buildChartSeries,
  endOfMonthTr,
  periodRangeTr,
  rewardStandings,
  sortBadgesByDifficulty,
  startOfWeekTr,
  trDate,
  trShortDate,
  type AchievementsPeriod,
  type AttemptRecord,
  type BadgeCategory,
  type BadgeContext,
  type BadgeDef,
  type CohortFilter,
  type EarnedBadge,
  type GamiLeaderboardRow,
  type GamiRules,
  type LevelInfo,
  type MonthlyReward,
  type Period,
  type StreakInfo,
  type WeeklyGoalsResult,
} from "@egemed/gamification-core";
import type { GamiBadgeModel, GamiCongrats, GamiDomainItem, GamiMeStatus, GamiProfileModel, GamiTableItem } from "./types";

export const GAMI_ACHIEVEMENT_PERIODS: { id: AchievementsPeriod; label: string; short: string }[] = [
  { id: "last30", label: "Son 30 gün", short: "son 30 gün" },
  { id: "last12w", label: "Son 12 hafta", short: "son 12 hafta" },
  { id: "academic", label: "Akademik yıl", short: "akademik yıl" },
];

export const GAMI_LEADERBOARD_PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "week", label: "Bu hafta" },
  { id: "month", label: "Bu ay" },
  { id: "academic_year", label: "Akademik yıl" },
];

export const GAMI_LEADERBOARD_COHORTS: { id: CohortFilter; label: string }[] = [
  { id: "all", label: "Tüm dönemler" },
  ...([1, 2, 3, 4, 5, 6] as const).map((c) => ({ id: c, label: `Dönem ${c}` })),
];

export const GAMI_BADGE_CATEGORIES = (Object.keys(BADGE_CATEGORY_LABEL) as BadgeCategory[]).map((id) => ({
  id,
  label: BADGE_CATEGORY_LABEL[id],
}));

export const GAMI_BADGE_CATEGORY_ALL = "all" as const;
export type GamiBadgeCategoryFilter = typeof GAMI_BADGE_CATEGORY_ALL | BadgeCategory;

/**
 * Rozet koleksiyonu kategori filtresi: "Tümü" + yalnız o anda listede bulunan
 * kategoriler (seçim yereldir; URL/depoya yazılmaz).
 */
export function badgeCategoryOptions(
  badges: readonly { readonly category: BadgeCategory }[],
  categories: readonly { readonly id: BadgeCategory; readonly label: string }[],
): { readonly id: GamiBadgeCategoryFilter; readonly label: string }[] {
  return [
    { id: GAMI_BADGE_CATEGORY_ALL, label: "Tümü" },
    ...categories.filter((category) => badges.some((badge) => badge.category === category.id)),
  ];
}

/** Kategori filtresi; "Tümü" listedeki tüm rozetleri döner. */
export function filterBadgesByCategory<T extends { readonly category: BadgeCategory }>(
  badges: readonly T[],
  category: GamiBadgeCategoryFilter,
): T[] {
  return category === GAMI_BADGE_CATEGORY_ALL ? [...badges] : badges.filter((badge) => badge.category === category);
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const parts = (d: Date) => {
  const w = new Date(d.getTime() + 3 * 3_600_000);
  return { d: w.getUTCDate(), m: w.getUTCMonth(), y: w.getUTCFullYear() };
};

function periodLabel(period: Period, now: Date): string {
  const s = parts(periodRangeTr(period, now).start);
  const endDate =
    period === "today"
      ? now
      : period === "week"
        ? new Date(startOfWeekTr(now).getTime() + 6 * 86_400_000)
        : period === "month"
          ? endOfMonthTr(now)
          : new Date(Date.UTC(s.y + 1, 7, 31, 12));
  const e = parts(endDate);
  if (period === "today") return `${s.d} ${MONTHS[s.m]} ${s.y}`;
  if (s.y === e.y && s.m === e.m) return `${s.d}–${e.d} ${MONTHS[s.m]} ${s.y}`;
  if (s.y === e.y) return `${s.d} ${MONTHS[s.m]} – ${e.d} ${MONTHS[e.m]} ${s.y}`;
  return `${s.d} ${MONTHS[s.m]} ${s.y} – ${e.d} ${MONTHS[e.m]} ${e.y}`;
}

function tableItems(rows: readonly GamiLeaderboardRow[], withPodium: boolean): GamiTableItem[] {
  const ranked = rows.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const from = withPodium ? 4 : 1;
  const head = ranked.filter((r) => r.rank! >= from && r.rank! <= 10);
  const out: GamiTableItem[] = head.map((row) => ({ kind: "row", row }));
  const me = ranked.find((r) => r.isMe);
  if (me && me.rank! > 10) {
    const near = ranked.filter((r) => r.rank! >= Math.max(11, me.rank! - 1) && r.rank! <= me.rank! + 1);
    if (near[0]!.rank! > 11) out.push({ kind: "gap" });
    near.forEach((row) => out.push({ kind: "row", row }));
  }
  return out;
}

function countdownText(now: Date): string {
  const ms = Math.max(0, endOfMonthTr(now).getTime() + 1 - now.getTime());
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} gün ${h} saat`;
  if (h > 0) return `${h} saat ${m} dk`;
  return `${m} dk`;
}

function meRewardStatus(
  standings: { rows: { id: string; candidate: boolean; reason: string; periodScore: number | null; attemptsCount: number }[]; cutoff: number },
  reward: MonthlyReward,
): GamiMeStatus | null {
  const me = standings.rows.find((r) => r.id === "me");
  if (!me) return null;
  const eligibleRanked = standings.rows
    .filter((r) => r.reason === "eligible" && r.periodScore !== null)
    .sort((a, b) => b.periodScore! - a.periodScore!);
  if (me.candidate) return { tone: "green", text: `Şu an ödül sırasındasın — ${eligibleRanked.findIndex((r) => r.id === "me") + 1}.` };
  if (me.reason === "min_assessments") {
    const left = reward.eligibility.minAssessments - me.attemptsCount;
    return { tone: "gray", text: `Uygunluk için bu ay ${left} değerlendirme daha tamamla`, action: "assess" };
  }
  if (me.reason === "private_profile") return { tone: "gray", text: "Ödüle aday olmak için sıralamada adınla görünmelisin", action: "privacy" };
  if (me.reason === "cohort") {
    const c = reward.eligibility.cohorts;
    return { tone: "gray", text: `Bu ödül Dönem ${Math.min(...c)}–${Math.max(...c)} öğrencilerine açıktır` };
  }
  if (me.periodScore === null) return { tone: "gray", text: "Bu ay henüz sıralamada değilsin", action: "assess" };
  const gap = Math.max(0, Math.round((standings.cutoff - me.periodScore) * 10) / 10);
  return { tone: "purple", text: `Ödül sırasına ${gap.toLocaleString("tr-TR")} puan` };
}

export interface AchievementsModelInput<TStats, TContext extends BadgeContext, TDomain extends string, TExtra> {
  now: Date;
  period: AchievementsPeriod;
  attempts: readonly AttemptRecord<TDomain, TExtra>[];
  rules: GamiRules;
  catalog: readonly BadgeDef<TStats, TContext>[];
  stats: TStats;
  earned: readonly EarnedBadge[];
  badgeContext: TContext;
  level: LevelInfo;
  streak: StreakInfo;
  goals: WeeklyGoalsResult;
  profile: { public: boolean; displayName: string | null };
  weekRows: readonly GamiLeaderboardRow[] | null;
  domainMeta: readonly { key: TDomain; label: string; icon: ReactNode }[];
  weakPct?: number;
  lockedNote?: (id: string) => string | null;
  assessmentOnly?: (category: BadgeCategory) => boolean;
  congrats?: GamiCongrats | null;
  /** Sunucu özeti varken yerel deneme olmasa da profil şeridi açılır. */
  activity?: boolean;
}

export interface AchievementsModel {
  periods: typeof GAMI_ACHIEVEMENT_PERIODS;
  periodShort: string;
  rangeLabel: string;
  weekLabel: string;
  points: ReturnType<typeof buildChartSeries>;
  badges: GamiBadgeModel[];
  categories: typeof GAMI_BADGE_CATEGORIES;
  domains: GamiDomainItem[];
  domainRange: string;
  profile: GamiProfileModel | null;
  hasAttempts: boolean;
  goals: WeeklyGoalsResult["goals"];
  congrats: GamiCongrats | null;
}

export function buildAchievementsModel<TStats, TContext extends BadgeContext, TDomain extends string, TExtra>(
  input: AchievementsModelInput<TStats, TContext, TDomain, TExtra>,
): AchievementsModel {
  const { start, end } = achievementsRangeTr(input.period, input.now);
  const range = { s: start.toISOString(), e: end.toISOString() };
  const inPeriod = input.attempts.filter((a) => a.finishedAt >= range.s && a.finishedAt <= range.e);
  const assessments = inPeriod.filter((a) => a.mode === "assessment");
  const practiceCases = inPeriod.filter((a) => a.mode === "practice").reduce((n, a) => n + a.caseCount, 0);
  const avg = assessments.length ? assessments.reduce((n, a) => n + a.score, 0) / assessments.length : null;
  const periodShort = GAMI_ACHIEVEMENT_PERIODS.find((p) => p.id === input.period)?.short ?? GAMI_ACHIEVEMENT_PERIODS[0]!.short;
  const weekStart = input.goals.weekStartTr.toISOString();
  const weekEnd = new Date(input.goals.weekStartTr.getTime() + 6 * 86_400_000).toISOString();
  const weakPct = input.weakPct ?? 60;
  const assessmentOnly = input.assessmentOnly ?? ((category: BadgeCategory) => category === "topic" || category === "skill");
  const me = input.weekRows?.find((r) => r.isMe);
  const ranked = input.weekRows?.filter((r) => r.rank !== null).length ?? 0;
  const hasAttempts = input.activity ?? input.attempts.length > 0;
  const domains: GamiDomainItem[] = [];
  for (const d of input.domainMeta) {
    const vals = assessments.map((a) => a.domains[d.key]).filter((v): v is number => typeof v === "number");
    if (!vals.length) continue;
    const pct = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    domains.push({ key: d.key, label: d.label, icon: d.icon, pct, weak: pct < weakPct });
  }
  const badges = sortBadgesByDifficulty(badgeViews(input.catalog, input.stats, input.earned, input.badgeContext)).map((v): GamiBadgeModel => ({
    id: v.def.id,
    name: v.def.name,
    tier: v.def.tier ?? null,
    tierLabel: v.def.tier ? BADGE_TIER_LABEL[v.def.tier] : null,
    description: v.def.description,
    category: v.def.category,
    categoryLabel: BADGE_CATEGORY_LABEL[v.def.category],
    state: v.state,
    value: v.value,
    max: v.max,
    earnedLabel: v.earnedAt ? trDate(v.earnedAt) : null,
    rule: v.rule,
    studyKey: v.studyKey,
    iconName: v.def.icon ?? "Star",
    capstone: v.def.capstone === true,
    lockedNote: input.lockedNote?.(v.def.id) ?? null,
    assessmentOnly: assessmentOnly(v.def.category),
  }));
  return {
    periods: GAMI_ACHIEVEMENT_PERIODS,
    periodShort,
    rangeLabel: `${trShortDate(range.s)} – ${trShortDate(range.e)}`,
    weekLabel: `${trShortDate(weekStart)} – ${trShortDate(weekEnd)}`,
    points: buildChartSeries(input.attempts, range.s, range.e, input.rules),
    badges,
    categories: GAMI_BADGE_CATEGORIES,
    domains,
    domainRange: `Değerlendirme · ${periodShort}`,
    profile: hasAttempts ? {
      level: input.level.level,
      xpInto: input.level.xpIntoLevel,
      xpSpan: input.level.levelEndXp - input.level.levelStartXp,
      xpToNext: input.level.xpToNext,
      avatarId: "me",
      avatarName: input.profile.public ? input.profile.displayName ?? "Sen" : null,
      streakCurrent: input.streak.current,
      streakLongest: input.streak.longest,
      periodAssessments: assessments.length,
      periodPractice: practiceCases,
      periodAvg: avg,
      periodLabel: periodShort,
      weekRank: me?.rank ?? null,
      weekRanked: ranked,
    } : null,
    hasAttempts,
    goals: input.goals.goals,
    congrats: input.congrats ?? null,
  };
}

export interface LeaderboardModelInput {
  now: Date;
  clock: Date;
  period: Period;
  cohort: CohortFilter;
  rows: readonly GamiLeaderboardRow[];
  prevRows: readonly GamiLeaderboardRow[] | null;
  monthRows: readonly GamiLeaderboardRow[] | null;
  reward: MonthlyReward | null;
  boardReady: boolean;
}

export interface LeaderboardModel {
  periods: typeof GAMI_LEADERBOARD_PERIODS;
  cohorts: typeof GAMI_LEADERBOARD_COHORTS;
  periodLabel: string;
  countdown: string;
  status: GamiMeStatus | null;
  candidates: Set<string> | null;
  items: GamiTableItem[];
  meDelta: number | null;
  qualify: { left: number } | null;
  rankedEmpty: boolean;
  rows: readonly GamiLeaderboardRow[];
}

export function buildLeaderboardModel(input: LeaderboardModelInput): LeaderboardModel {
  const standings = input.reward && input.monthRows
    ? rewardStandings(input.monthRows.map((r) => ({
      id: r.id, cohort: r.cohort, public: r.isPublic, periodScore: r.periodScore, attemptsCount: r.attemptsCount, reachedAt: r.reachedAt,
    })), input.reward)
    : null;
  const candidates = input.period === "month" && input.cohort === "all" && standings
    ? new Set(standings.rows.filter((r) => r.candidate).map((r) => r.id))
    : null;
  const ranked = input.rows.filter((r) => r.rank !== null);
  const me = input.rows.find((r) => r.isMe);
  const prevMe = input.prevRows?.find((r) => r.isMe);
  return {
    periods: GAMI_LEADERBOARD_PERIODS,
    cohorts: GAMI_LEADERBOARD_COHORTS,
    periodLabel: periodLabel(input.period, input.now),
    countdown: countdownText(input.clock),
    status: input.reward && standings ? meRewardStatus(standings, input.reward) : null,
    candidates,
    items: tableItems(input.rows, ranked.length >= 3),
    meDelta: me?.rank && prevMe?.rank ? prevMe.rank - me.rank : null,
    qualify: me && me.rank === null ? { left: Math.max(1, 2 - me.attemptsCount) } : null,
    rankedEmpty: input.boardReady && ranked.length === 0,
    rows: input.rows,
  };
}

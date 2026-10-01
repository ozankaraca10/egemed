import { attemptXp, levelForXp, periodRangeTr, periodScore, rankRows, type AttemptRecord, type Cohort, type CohortFilter, type GamiLeaderboardRow, type GamiRules, type Period } from "@egemed/gamification-core";

/**
 * Yerel depo sıralaması: yalnız oturum sahibi. Sunucu yokken demo bandı sayfada kalır.
 * T295 (1 Eki 2026): görünmemeyi seçen (`public=false`) satır listelenmez; kendi
 * XP/sıra hesabı çağıranda kalır (oturum kazanımı satır istemez, sıra okur).
 */
export function localLeaderboardRows<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  rules: GamiRules,
  now: Date,
  period: Period,
  cohort: CohortFilter,
  profile: { public: boolean; displayName: string | null; cohort: Cohort | null },
): GamiLeaderboardRow[] {
  const { start, end } = periodRangeTr(period, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const mine = attempts.filter((a) => a.mode === "assessment" && a.finishedAt >= startIso && a.finishedAt <= endIso);
  const scored = periodScore(mine, rules);
  const xp = attempts.reduce((sum, item) => sum + attemptXp(item, rules), 0);
  const row: GamiLeaderboardRow = {
    id: "me",
    displayName: profile.displayName ?? "Sen",
    isMe: true,
    isPublic: profile.public,
    cohort: profile.cohort,
    periodScore: scored.score,
    attemptsCount: scored.attemptsCount,
    reachedAt: scored.reachedAt,
    totalXp: xp,
    level: levelForXp(xp, rules).level,
    rank: null,
  };
  const visible = profile.public && (cohort === "all" || profile.cohort === cohort);
  return rankRows(visible ? [row] : [], rules);
}

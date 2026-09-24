/** EGEMED CLIX — haftalık 3 sistem hedefi, Pazartesi 00:00 TR'de sıfırlanır.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/goals.ts.
 *  Saf fonksiyon; zaman parametre (`now`), kurallar parametre (`rules`). */

import type { AttemptRecord, EarnedBadge } from "./types";
import type { GamiRules } from "./rules";
import { startOfWeekTr } from "./time";

export interface WeeklyGoal {
  id: "weekly-assessments" | "weekly-avg-score" | "weekly-new-badges";
  label: string;
  value: number;
  max: number;
  done: boolean;
}

export interface WeeklyGoalsResult {
  weekStartTr: Date;
  goals: WeeklyGoal[];
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Haftalık hedefleri, mevcut haftaya (Pazartesi 00:00 TR → now) ait denemeler ve kazanılan
 *  rozetlerden hesaplar. `earned[].at` haftaya düşenler "bu hafta kazanılan yeni rozet" sayılır. */
export function computeWeeklyGoals<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  earned: readonly EarnedBadge[],
  now: Date,
  rules: GamiRules,
): WeeklyGoalsResult {
  const weekStart = startOfWeekTr(now);
  const weekAssessments = attempts.filter((a) => a.mode === "assessment" && inRange(a.finishedAt, weekStart, now));

  const sessionsCount = weekAssessments.length;
  const sessionsGoal: WeeklyGoal = {
    id: "weekly-assessments",
    label: `${rules.week.assessmentSessionsGoal} değerlendirme oturumu`,
    value: Math.min(sessionsCount, rules.week.assessmentSessionsGoal),
    max: rules.week.assessmentSessionsGoal,
    done: sessionsCount >= rules.week.assessmentSessionsGoal,
  };

  const avg = sessionsCount > 0 ? weekAssessments.reduce((s, a) => s + a.score, 0) / sessionsCount : 0;
  const avgGoal: WeeklyGoal = {
    id: "weekly-avg-score",
    label: `Ortalama başarı ≥ %${rules.week.avgScoreGoal}`,
    value: sessionsCount > 0 && avg >= rules.week.avgScoreGoal ? 1 : 0,
    max: 1,
    done: sessionsCount > 0 && avg >= rules.week.avgScoreGoal,
  };

  const newBadgesCount = earned.filter((e) => inRange(e.at, weekStart, now)).length;
  const badgesGoal: WeeklyGoal = {
    id: "weekly-new-badges",
    label: `${rules.week.newBadgesGoal} yeni rozet kazan`,
    value: Math.min(newBadgesCount, rules.week.newBadgesGoal),
    max: rules.week.newBadgesGoal,
    done: newBadgesCount >= rules.week.newBadgesGoal,
  };

  return { weekStartTr: weekStart, goals: [sessionsGoal, avgGoal, badgesGoal] };
}

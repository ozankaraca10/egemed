/** Liderlik Tahtası görünüm yardımcıları (K-B1…K-B6). */

import type { Period } from "@egemed/gamification-core";
import { endOfMonthTr, periodRangeTr } from "@egemed/gamification-core";

export function previousPeriodNow(period: Period, now: Date): Date {
  return new Date(periodRangeTr(period, now).start.getTime() - 1);
}

export function daysLeft(now: Date): number {
  return Math.ceil((endOfMonthTr(now).getTime() + 1 - now.getTime()) / 86_400_000);
}

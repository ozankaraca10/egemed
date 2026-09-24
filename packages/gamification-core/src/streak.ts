/** EGEMED CLIX — günlük seri.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/streak.ts.
 *  "Seri: art arda TR takvim günleri; o gün en az bir tamamlanmış oturum (uygulama ya da değerlendirme).
 *  Bugün veya dün etkinlik varsa seri sürer." Saf fonksiyon; zaman parametre (`now`). */

import type { AttemptRecord } from "./types";
import { startOfDayTr } from "./time";

export interface StreakInfo {
  /** Güncel seri: bugünden (ya da bugün henüz oturum yoksa dünden) geriye kesintisiz gün sayısı. */
  current: number;
  /** Tüm geçmişteki en uzun kesintisiz gün serisi. */
  longest: number;
}

const MS_PER_DAY = 86_400_000;

function dayIndexTr(iso: string): number {
  return Math.floor(startOfDayTr(new Date(iso)).getTime() / MS_PER_DAY);
}

export function computeStreak<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  now: Date,
): StreakInfo {
  if (attempts.length === 0) return { current: 0, longest: 0 };

  const days = Array.from(new Set(attempts.map((a) => dayIndexTr(a.finishedAt)))).sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const day = days[i];
    const previous = days[i - 1];
    run = day !== undefined && previous !== undefined && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const daySet = new Set(days);
  const todayIdx = Math.floor(startOfDayTr(now).getTime() / MS_PER_DAY);
  let anchor = todayIdx;
  if (!daySet.has(anchor)) {
    anchor = todayIdx - 1; // bugün henüz oturum yoksa dünden say
    if (!daySet.has(anchor)) return { current: 0, longest };
  }
  let current = 0;
  let cursor = anchor;
  while (daySet.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, longest };
}

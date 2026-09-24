/** EGEMED — aylık ödül seçimi ve kazanan geçmişi (saf fonksiyonlar).
 *  Salt okunur kaynak: egemed-opaca/src/gamification/rewards.ts.
 *  Ödül yapılandırması ve kazanan VERİSİ Opaca'ya özgüdür → sim paketinde; burada yalnız
 *  seçim/okuma mantığı vardır. `now` her zaman parametredir. */

import { monthKeyTr } from "./time";
import type { MonthlyReward, RewardWinner } from "./types";

/** Ay anahtarına ('YYYY-MM') göre yapılandırılmış ödül. İstenen ay katalogda yoksa o aydan önceki
 *  en son yapılandırılmış ödül aynı koşullarla o ay için geçerli sayılır (ödül ay başında
 *  kendiliğinden kaybolmaz); hiç yapılandırma yoksa null. */
export function monthlyRewardFor(
  catalog: Readonly<Record<string, MonthlyReward>>,
  month: string,
): MonthlyReward | null {
  const exact = catalog[month];
  if (exact) return exact;
  const prev = Object.keys(catalog)
    .filter((m) => m < month)
    .sort()
    .at(-1);
  const fallback = prev === undefined ? undefined : catalog[prev];
  return fallback ? { ...fallback, month } : null;
}

/** `now`'un bulunduğu aydan geriye son N ayın kazananları (içinde bulunulan ay hariç),
 *  en yeni ay önce; ay içinde sıra (rank) artan. */
export function rewardWinnersHistory(
  history: readonly RewardWinner[],
  lastNMonths: number,
  now: Date,
): RewardWinner[] {
  const currentMonth = monthKeyTr(now);
  const months = Array.from(new Set(history.map((w) => w.month)))
    .filter((m) => m < currentMonth)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, lastNMonths);
  const monthSet = new Set(months);
  return history
    .filter((w) => monthSet.has(w.month))
    .sort((a, b) => (a.month === b.month ? a.rank - b.rank : a.month < b.month ? 1 : -1));
}

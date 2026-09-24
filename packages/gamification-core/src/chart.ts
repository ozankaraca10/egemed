/** EGEMED — ilerleme grafiği verisi. Salt okunur kaynak: egemed-opaca/src/gamification/chart.ts.
 *  Saf; XP kuralı parametre (`rules`), TR kısa tarih çekirdeğin takvim modülündedir. */

import type { GamiRules } from "./rules";
import { trShortDate } from "./time";
import type { AttemptRecord } from "./types";
import { attemptXp } from "./xp";

export interface ChartPoint {
  at: string; // ISO
  label: string; // "8 Eyl"
  score: number;
  cumulativeXp: number;
}

/** Dönem içindeki değerlendirme puanları + o ana kadarki toplam XP (dönem öncesi denemeler dahil). */
export function buildChartSeries<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  startIso: string,
  endIso: string,
  rules: GamiRules,
): ChartPoint[] {
  const sorted = [...attempts].sort((a, b) => (a.finishedAt < b.finishedAt ? -1 : a.finishedAt > b.finishedAt ? 1 : 0));
  let xp = 0;
  const out: ChartPoint[] = [];
  for (const a of sorted) {
    xp += attemptXp(a, rules);
    if (a.mode !== "assessment" || a.finishedAt < startIso || a.finishedAt > endIso) continue;
    out.push({ at: a.finishedAt, label: trShortDate(a.finishedAt), score: a.score, cumulativeXp: xp });
  }
  return out;
}

/** XP ekseni için "yuvarlak" üst sınır (100, 200, 500, 1.000, 2.000, 5.000 …). */
export function niceMax(v: number): number {
  if (v <= 100) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Genişliğe göre x etiket aralığı: etiketler arası en az ~64 px; son nokta her zaman etiketlenir. */
export function labelEvery(pointCount: number, plotWidth: number): number {
  if (pointCount <= 1) return 1;
  const maxLabels = Math.max(2, Math.floor(plotWidth / 64));
  return Math.max(1, Math.ceil(pointCount / maxLabels));
}

/** EGEMED — dönem puanı, sıralama, ödül uygunluğu.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/ranking.ts.
 *  Saf fonksiyonlar; davranış birebir. Kurallar parametre (`rules`), ödül yapılandırması veri
 *  olarak dışarıdan gelir. Bu dosya `now` almaz — çağıran taraf dönem penceresine göre önceden
 *  filtrelenmiş denemeleri/satırları verir. */

import type { GamiRules } from "./rules";
import type { AttemptRecord, Cohort, EligibilityReason, MonthlyReward } from "./types";

/** Tüm sınıflar — "herkese açık ödül" kontrolü için (kohort listesi sırası önemsizdir). */
export const ALL_COHORTS: readonly Cohort[] = [1, 2, 3, 4, 5, 6];

export interface PeriodScoreResult {
  /** Sıralamaya girmek için asgari deneme sağlanmadıysa null. */
  score: number | null;
  attemptsCount: number;
  /** Bu puana ilk ulaşılan an (en iyi N'i tamamlayan en son denemenin zamanı) — eşitlik kuralı için. */
  reachedAt: string | null;
}

/** Dönem puanı: (yalnız değerlendirme modundaki) denemelerin en iyi N'inin ortalaması, `roundDecimals`
 *  ondalık. Sıralamaya girmek için asgari deneme (`rules.ranking.minAttempts`) şartı vardır. */
export function periodScore<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  rules: GamiRules,
): PeriodScoreResult {
  // Eşit puanlarda önce tamamlanan deneme seçilir ("önce ulaşan öne geçer" ile tutarlı).
  const scored = attempts
    .filter((a) => a.mode === "assessment")
    .sort((a, b) => b.score - a.score || (a.finishedAt < b.finishedAt ? -1 : a.finishedAt > b.finishedAt ? 1 : 0));
  const attemptsCount = scored.length;
  if (attemptsCount < rules.ranking.minAttempts) return { score: null, attemptsCount, reachedAt: null };

  const top = scored.slice(0, rules.ranking.bestOfCount);
  const avg = top.reduce((s, a) => s + a.score, 0) / top.length;
  const factor = 10 ** rules.ranking.roundDecimals;
  const score = Math.round(avg * factor) / factor;

  // "Önce ulaşan": en iyi N'i oluşturan denemeler arasında en son tamamlanan (o ana kadar bu skor
  // henüz oluşmamıştı; o an itibarıyla oluştu).
  const reachedAt = top.reduce<string | null>(
    (latest, a) => (!latest || a.finishedAt > latest ? a.finishedAt : latest),
    null,
  );

  return { score, attemptsCount, reachedAt };
}

/** Eşitlik kuralı: puana önce ulaşan öne geçer (reachedAt küçük olan üstte). `null` en sona düşer. */
export function cmpReachedAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export interface ScoredRow {
  id: string;
  periodScore: number | null;
  attemptsCount: number;
  reachedAt: string | null;
}

/** Genel sıralama: yeterli deneme + puanı olanlar puana göre (eşitlikte önce ulaşana göre) sıralanır;
 *  yetersiz olanlar `rank: null` ile listede kalır (dışlanmaz, yalnız sıra numarası almazlar). */
export function rankRows<T extends ScoredRow>(rows: readonly T[], rules: GamiRules): (T & { rank: number | null })[] {
  const withRank = rows.map((r) => ({ ...r, rank: null as number | null }));
  const eligible = withRank.filter((r) => r.periodScore !== null && r.attemptsCount >= rules.ranking.minAttempts);
  eligible.sort((a, b) => (b.periodScore ?? 0) - (a.periodScore ?? 0) || cmpReachedAt(a.reachedAt, b.reachedAt));
  eligible.forEach((r, i) => {
    r.rank = i + 1;
  });
  return withRank;
}

export interface RewardStandingRow {
  id: string;
  cohort: Cohort | null;
  public: boolean;
  periodScore: number | null;
  attemptsCount: number;
  reachedAt: string | null;
}

export interface RewardStandingResult extends RewardStandingRow {
  reason: EligibilityReason;
  /** Uygun olanlar arasında ilk `winnersCount` içinde mi. */
  candidate: boolean;
}

/** "Uygunlar arasında ilk winnersCount" hesabı. Uygun OLMAYAN biri puanla ilk N'de olsa bile aday
 *  değildir; sıradaki uygun kişi onun yerini alır. */
export function rewardStandings(
  rows: readonly RewardStandingRow[],
  reward: MonthlyReward,
): { rows: RewardStandingResult[]; cutoff: number } {
  const reasonFor = (r: RewardStandingRow): EligibilityReason => {
    // Dönemi bilinmeyen öğrenci (LMS dönem bilgisi vermez) yalnız ödül TÜM sınıflara açıksa uygundur.
    const allCohorts = ALL_COHORTS.every((c) => reward.eligibility.cohorts.includes(c));
    if (r.cohort === null ? !allCohorts : !reward.eligibility.cohorts.includes(r.cohort)) return "cohort";
    if (r.attemptsCount < reward.eligibility.minAssessments) return "min_assessments";
    if (reward.eligibility.requirePublicName && !r.public) return "private_profile";
    return "eligible";
  };

  const withReason = rows.map((r) => ({ ...r, reason: reasonFor(r) }));
  const eligible = withReason
    .filter((r) => r.reason === "eligible" && r.periodScore !== null)
    .sort((a, b) => (b.periodScore ?? 0) - (a.periodScore ?? 0) || cmpReachedAt(a.reachedAt, b.reachedAt));

  const winners = new Set(eligible.slice(0, reward.winnersCount).map((r) => r.id));
  const cutoffRow = eligible[Math.min(reward.winnersCount, eligible.length) - 1];
  const cutoff = cutoffRow?.periodScore ?? 0;

  return {
    rows: withReason.map((r) => ({ ...r, candidate: winners.has(r.id) })),
    cutoff,
  };
}

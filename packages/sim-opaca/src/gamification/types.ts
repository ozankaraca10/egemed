/** Opaca oyunlaştırma görünüm tipleri (repo çıktısı). */

import type { Cohort, CohortFilter, Period } from "@egemed/gamification-core";

export type { Cohort, CohortFilter, Period };

/** Liderlik tablosu satırı — repo tarafından çözümlenmiş görünüm modeli. */
export interface LeaderboardRow {
  id: string;
  displayName: string;
  isMe: boolean;
  isPublic: boolean;
  cohort: Cohort | null;
  periodScore: number | null;
  attemptsCount: number;
  reachedAt: string | null;
  totalXp: number;
  level: number;
  rank: number | null;
}

export interface LeaderboardView {
  period: Period;
  cohort: CohortFilter;
  generatedAt: string;
  isDemo: true;
  rows: LeaderboardRow[];
}

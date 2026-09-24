/** Opaca oyunlaştırma görünüm tipleri (repo çıktısı). */

import type {
  Cohort,
  CohortFilter,
  GamiLeaderboardRow,
  GamiLeaderboardView,
  Period,
} from "@egemed/gamification-core";

export type { Cohort, CohortFilter, Period };

/** Liderlik tablosu satırı — `@egemed/gamification-core` PORT çıktısı ile hizalı. */
export type LeaderboardRow = GamiLeaderboardRow;

export type LeaderboardView = GamiLeaderboardView;

/** Sim oyunlaştırma deposu PORT'u — yerel (LocalRepo) ve API (`createApiGamiRepository`) uygulamaları bu arayüzü paylaşır.
 *  Salt tip tanımları; sim'e özgü deneme tipi jenerik parametreyle taşınır. */

import type {
  AttemptRecord,
  Cohort,
  CohortFilter,
  GamiProfile,
  MonthlyReward,
  Period,
  RewardWinner,
} from "./types";

/** Liderlik tablosu satırı — repo tarafından çözümlenmiş görünüm modeli. */
export interface GamiLeaderboardRow {
  readonly id: string;
  readonly displayName: string;
  readonly isMe: boolean;
  readonly isPublic: boolean;
  readonly cohort: Cohort | null;
  readonly periodScore: number | null;
  readonly attemptsCount: number;
  readonly reachedAt: string | null;
  readonly totalXp: number;
  readonly level: number;
  readonly rank: number | null;
}

export interface GamiLeaderboardView {
  readonly period: Period;
  readonly cohort: CohortFilter;
  readonly generatedAt: string;
  readonly isDemo: boolean;
  readonly rows: readonly GamiLeaderboardRow[];
}

/** Öğrenme modu etkinliği — sim'e özgü alan adları `items` içinde taşınır. */
export interface GamiLearnActivityInput {
  readonly topic?: string | undefined;
  readonly ctStack?: string | undefined;
  readonly items?: Readonly<Record<string, string>> | undefined;
}

/** Sim oyunlaştırma deposu PORT'u (packages/sim-opaca/src/gamification/repo.ts referans). */
export interface GamiRepository<TAttempt extends AttemptRecord = AttemptRecord> {
  getMe(): Promise<GamiProfile & { readonly id: string }>;
  updateMe(patch: Partial<GamiProfile>): Promise<void>;
  recordAttempt(attempt: TAttempt): Promise<void>;
  recordLearn(activity: GamiLearnActivityInput, now: Date): Promise<void>;
  listAttempts(): Promise<readonly TAttempt[]>;
  getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<GamiLeaderboardView>;
  getMonthlyReward(month: string): Promise<MonthlyReward | null>;
  getRewardWinners(lastNMonths: number, now: Date): Promise<RewardWinner[]>;
}

/** API deposunda henüz karşılığı olmayan PORT yöntemi — yerel kuyruk tutulmaz (ADR-004). */
export class GamiRepositoryUnsupportedError extends Error {
  readonly name = "GamiRepositoryUnsupportedError";

  constructor(readonly method: string) {
    super(`GamiRepository.${method} API deposunda desteklenmiyor.`);
  }
}

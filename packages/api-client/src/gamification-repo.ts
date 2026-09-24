/** EGEMED — oyunlaştırma API deposu adaptörü (T56, E3 §d, ADR-007).
 *  Sim PORT'u (`GamiRepository`) ile `@egemed/api-client` gamification uçlarını eşler.
 *  Ağ/şema hataları doğrudan fırlatılır; yerel kuyruk YOKTUR (ADR-004). */

import type { AttemptWriteRequest, GamiSimSummary, GamiSummaryResponse, SimId } from "@egemed/contracts";
import {
  GamiRepositoryUnsupportedError,
  TR_OFFSET_MS,
  type AttemptRecord,
  type CohortFilter,
  type GamiLeaderboardView,
  type GamiLearnActivityInput,
  type GamiProfile,
  type GamiRepository,
  type MonthlyReward,
  type Period,
  type RewardWinner,
} from "@egemed/gamification-core";

interface GamificationApiClient {
  getSummary(simId: SimId): Promise<GamiSummaryResponse>;
  writeAttempt(simId: SimId, input: AttemptWriteRequest): Promise<void>;
}

const ME_ID = "me";

export interface EncodeAttemptInput<TAttempt extends AttemptRecord> {
  readonly attempt: TAttempt;
  readonly attemptNo: number;
  readonly startedAt: string;
}

export interface CreateApiGamiRepositoryOptions<TAttempt extends AttemptRecord = AttemptRecord> {
  readonly client: GamificationApiClient;
  readonly simId: SimId;
  /** Sim'e özgü kodlu özet üretimi — ham yanıt API'ye gönderilmez. */
  readonly encodeAttempt: (input: EncodeAttemptInput<TAttempt>) => AttemptWriteRequest;
}

function toTrIso(epochMs: number): string {
  const wall = new Date(epochMs + TR_OFFSET_MS);
  const y = wall.getUTCFullYear();
  const mo = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wall.getUTCDate()).padStart(2, "0");
  const h = String(wall.getUTCHours()).padStart(2, "0");
  const mi = String(wall.getUTCMinutes()).padStart(2, "0");
  const s = String(wall.getUTCSeconds()).padStart(2, "0");
  const ms = String(wall.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}+03:00`;
}

function nextAttemptNo(summary: GamiSimSummary): number {
  if (summary.attempts.length === 0) return 1;
  return Math.max(...summary.attempts.map((attempt) => attempt.attemptNo)) + 1;
}

function startedAtForAttempt(attempt: AttemptRecord): string {
  const finishedMs = Date.parse(attempt.finishedAt);
  if (!Number.isFinite(finishedMs)) {
    throw new Error("Deneme finishedAt geçerli ISO 8601 olmalıdır.");
  }
  const startedMs = Math.max(0, finishedMs - attempt.durationMs);
  return toTrIso(startedMs);
}

function attemptFromSummary<TAttempt extends AttemptRecord>(
  summary: GamiSimSummary,
): readonly TAttempt[] {
  return summary.attempts.map((row) => ({
    id: `${summary.simId}-${row.attemptNo}`,
    mode: "assessment",
    finishedAt: row.finishedAt,
    score: row.score ?? 0,
    mastery: row.passed ?? false,
    caseCount: 1,
    hintsUsed: 0,
    durationMs: 0,
    domains: {},
    extra: {},
  })) as unknown as readonly TAttempt[];
}

function leaderboardFromSummary(
  summary: GamiSimSummary,
  period: Period,
  cohort: CohortFilter,
  now: Date,
): GamiLeaderboardView {
  return {
    period,
    cohort,
    generatedAt: toTrIso(now.getTime()),
    isDemo: false,
    rows: [
      {
        id: ME_ID,
        displayName: "Anonim öğrenci",
        isMe: true,
        isPublic: true,
        cohort: null,
        periodScore: null,
        attemptsCount: summary.attempts.length,
        reachedAt: null,
        totalXp: summary.xp,
        level: summary.level,
        rank: summary.leaderboard.rank,
      },
    ],
  };
}

function unsupported(method: string): never {
  throw new GamiRepositoryUnsupportedError(method);
}

export function createApiGamiRepository<TAttempt extends AttemptRecord>(
  options: CreateApiGamiRepositoryOptions<TAttempt>,
): GamiRepository<TAttempt> {
  let cachedSummary: GamiSimSummary | null = null;

  async function loadSummary(): Promise<GamiSimSummary> {
    if (cachedSummary !== null) return cachedSummary;
    const response = await options.client.getSummary(options.simId);
    cachedSummary = response.data;
    return cachedSummary;
  }

  function invalidateSummary(): void {
    cachedSummary = null;
  }

  return {
    async getMe(): Promise<GamiProfile & { readonly id: string }> {
      await loadSummary();
      return {
        id: ME_ID,
        displayName: null,
        public: true,
        cohort: null,
      };
    },

    async updateMe(patch: Partial<GamiProfile>): Promise<void> {
      void patch;
      unsupported("updateMe");
    },

    async recordAttempt(attempt: TAttempt): Promise<void> {
      const summary = await loadSummary();
      const body = options.encodeAttempt({
        attempt,
        attemptNo: nextAttemptNo(summary),
        startedAt: startedAtForAttempt(attempt),
      });
      await options.client.writeAttempt(options.simId, body);
      invalidateSummary();
    },

    async recordLearn(activity: GamiLearnActivityInput, now: Date): Promise<void> {
      void activity;
      void now;
      unsupported("recordLearn");
    },

    async listAttempts(): Promise<readonly TAttempt[]> {
      const summary = await loadSummary();
      return attemptFromSummary(summary);
    },

    async getLeaderboard(
      period: Period,
      cohort: CohortFilter,
      now: Date,
    ): Promise<GamiLeaderboardView> {
      const summary = await loadSummary();
      return leaderboardFromSummary(summary, period, cohort, now);
    },

    async getMonthlyReward(month: string): Promise<MonthlyReward | null> {
      void month;
      unsupported("getMonthlyReward");
    },

    async getRewardWinners(lastNMonths: number, now: Date): Promise<RewardWinner[]> {
      void lastNMonths;
      void now;
      unsupported("getRewardWinners");
    },
  };
}

export { GamiRepositoryUnsupportedError };

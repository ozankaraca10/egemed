/** EGEMED — oyunlaştırma API deposu adaptörü (T56, E3 §d, ADR-007; A4 daraltması).
 *  Sim PORT'u (`GamiRepository`) ile `@egemed/api-client` gamification uçlarını eşler.
 *  A4 (ADR-009): puanlı deneme yazımı istemcide YOKTUR; uygulama/değerlendirme/düello
 *  denemesini sunucu oturumu yazar, bu yüzden `recordAttempt` desteklenmez. Kalan tek
 *  yazma yolu puansız öğrenme kaydıdır (`POST .../attempts` `{ topic }`). Ağ/şema
 *  hataları doğrudan fırlatılır; yerel kuyruk YOKTUR (ADR-004). */

import type {
  GamiLeaderboardResponse,
  GamiSimSummary,
  LearnRecordResponse,
  LearnWriteRequest,
  SimId,
} from "@egemed/contracts";
import {
  GamiRepositoryUnsupportedError,
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
  getSummary(simId: SimId): Promise<{ data: GamiSimSummary }>;
  getLeaderboard(
    simId: SimId,
    query: { readonly period: Period; readonly cohort: CohortFilter; readonly page: number; readonly pageSize: number },
  ): Promise<GamiLeaderboardResponse>;
  writeLearn(simId: SimId, input: LearnWriteRequest): Promise<LearnRecordResponse>;
}

const ME_ID = "me";

export interface CreateApiGamiRepositoryOptions {
  readonly client: GamificationApiClient;
  readonly simId: SimId;
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

function leaderboardFromResponse(
  response: GamiLeaderboardResponse,
  period: Period,
  cohort: CohortFilter,
): GamiLeaderboardView {
  return {
    period,
    cohort,
    generatedAt: response.data.generatedAt,
    isDemo: response.data.isDemo,
    rows: response.data.rows.map((row) => ({
      id: row.isMe ? ME_ID : row.id,
      displayName: row.displayName,
      isMe: row.isMe,
      isPublic: row.isPublic,
      cohort: row.cohort,
      periodScore: row.periodScore,
      attemptsCount: row.attemptsCount,
      reachedAt: row.reachedAt,
      totalXp: row.totalXp,
      level: row.level,
      rank: row.rank,
    })),
  };
}

function unsupported(method: string): never {
  throw new GamiRepositoryUnsupportedError(method);
}

/**
 * A4: puansız öğrenme anahtarı sim ad alanına çevrilir (`<sim>:topic:<key>` /
 * `<sim>:stack:<key>`); serbest metin gönderilmez. Anahtar yoksa kayıt yapılmaz.
 */
export function learnTopicFor(simId: SimId, activity: GamiLearnActivityInput): string | null {
  const isTopic = typeof activity.topic === "string" && activity.topic.trim().length > 0;
  const isStack = typeof activity.ctStack === "string" && activity.ctStack.trim().length > 0;
  if (!isTopic && !isStack) return null;
  const kind = isTopic ? "topic" : "stack";
  const key = (isTopic ? activity.topic : activity.ctStack)?.trim().toLowerCase() ?? "";
  return `${simId}:${kind}:${key}`;
}

export function createApiGamiRepository<TAttempt extends AttemptRecord>(
  options: CreateApiGamiRepositoryOptions,
): GamiRepository<TAttempt> {
  let cachedSummary: GamiSimSummary | null = null;

  async function loadSummary(): Promise<GamiSimSummary> {
    if (cachedSummary !== null) return cachedSummary;
    const response = await options.client.getSummary(options.simId);
    cachedSummary = response.data;
    return cachedSummary;
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

    /** A4 (ADR-009): puanlı denemeyi yalnız sunucu oturumu yazar; istemci göndermez. */
    async recordAttempt(attempt: TAttempt): Promise<void> {
      void attempt;
      unsupported("recordAttempt");
    },

    async recordLearn(activity: GamiLearnActivityInput, now: Date): Promise<void> {
      void now;
      const topic = learnTopicFor(options.simId, activity);
      if (topic === null) return;
      await options.client.writeLearn(options.simId, { topic });
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
      void now;
      const response = await options.client.getLeaderboard(options.simId, {
        period,
        cohort,
        page: 1,
        pageSize: 100,
      });
      return leaderboardFromResponse(response, period, cohort);
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

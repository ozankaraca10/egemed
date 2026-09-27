import { ApiError, apiIssueCode, type ApiClient } from "@egemed/api-client";
import type { ChallengeBody, SimId } from "@egemed/contracts";
import type { TrKey } from "@egemed/ui/i18n";

/**
 * Meydan Okuma veri kaynağı (ADR-010). API oturumunda `client.challenges`; sahte
 * geliştirme oturumunda yoktur (düello iki gerçek kullanıcı ve sunucu ister).
 */
export interface ChallengeSource {
  create(simId: SimId): Promise<ChallengeBody>;
  join(code: string): Promise<ChallengeBody>;
  list(): Promise<readonly ChallengeBody[]>;
  get(challengeId: string): Promise<ChallengeBody>;
}

export function createApiChallengeSource(client: Pick<ApiClient, "challenges">): ChallengeSource {
  return {
    create: async (simId) => (await client.challenges.create(simId)).data,
    join: async (code) => (await client.challenges.join(code)).data,
    list: async () => (await client.challenges.list()).data,
    get: async (challengeId) => (await client.challenges.get(challengeId)).data,
  };
}

/** API hatasını kullanıcı iletisi anahtarına çevirir. */
export function challengeErrorKey(error: unknown): TrKey {
  if (!(error instanceof ApiError)) return "challenges.error.generic";
  const issue = apiIssueCode(error);
  if (issue === "own_challenge") return "challenges.error.own";
  if (issue === "challenge_taken") return "challenges.error.taken";
  if (issue === "too_many_open_challenges") return "challenges.error.tooMany";
  if (error.code === "rate_limited") return "challenges.error.rate";
  if (error.code === "not_found") return "challenges.error.notFound";
  return "challenges.error.generic";
}

/** Görüntüleyenin bakışından düello sonucu. */
export function outcomeFor(challenge: ChallengeBody): "win" | "lose" | "draw" | "pending" {
  if (challenge.winner === null) return "pending";
  if (challenge.winner === "draw") return "draw";
  const me = challenge.participants.find((participant) => participant.isMe);
  if (me === undefined) return "pending";
  return me.role === challenge.winner ? "win" : "lose";
}

/** mm:ss süre gösterimi. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

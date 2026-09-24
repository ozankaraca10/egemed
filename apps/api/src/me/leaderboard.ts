import { DEFAULT_RULES, periodRangeTr, periodScore, rankRows, type Period } from "@egemed/gamification-core";
import type { Cohort, CohortFilter } from "@egemed/gamification-core";
import type { SimId } from "@egemed/contracts";

/** Liderlik tablosunda tam ad/e-posta yerine gösterilen anonim etiket. */
export const ANONYMOUS_LEADERBOARD_LABEL = "Anonim öğrenci";

export interface LeaderboardPeerSeed {
  readonly userId: string;
  readonly displayName: string;
  readonly unitCode: string | null;
  /** KVKK opt-out simülasyonu; şema alanı yoksa varsayılan `true`. */
  readonly public?: boolean | undefined;
}

export interface LeaderboardAttemptSeed {
  readonly userId: string;
  readonly simId: SimId;
  readonly finishedAt: number;
  readonly score: number | null;
}

export interface LeaderboardRowDraft {
  readonly userId: string;
  readonly displayName: string;
  readonly isPublic: boolean;
  readonly cohort: Cohort | null;
  readonly periodScore: number | null;
  readonly attemptsCount: number;
  readonly reachedAt: string | null;
  readonly totalXp: number;
  readonly level: number;
  readonly rank: number | null;
}

export function formatLmsDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) return trimmed.replace(/\s+/g, " ");
  const last = trimmed.slice(0, commaIdx).trim();
  const first = trimmed.slice(commaIdx + 1).trim();
  if (last.length === 0 || first.length === 0) {
    return trimmed.replace(/,/g, "").replace(/\s+/g, " ").trim();
  }
  return `${first} ${last}`;
}

/** Tabloda yalnız baş harfler gösterilir; ad-soyad veya e-posta asla dönmez. */
export function leaderboardInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : null;
  const letters = last ? [first[0], last[0]] : [first[0]];
  return letters.map((ch) => ch!.toLocaleUpperCase("tr-TR")).join("");
}

export function cohortFromUnitCode(code: string | null | undefined): Cohort | null {
  if (code === null || code === undefined || code.length === 0) return null;
  const match = /^(\d)-sinif$/.exec(code);
  if (match === null) return null;
  const value = Number(match[1]);
  if (value >= 1 && value <= 6) return value as Cohort;
  return null;
}

export function resolveLeaderboardDisplayName(input: {
  readonly displayName: string;
  readonly isPublic: boolean;
}): { readonly displayName: string; readonly isPublic: boolean } {
  if (!input.isPublic) {
    return { displayName: ANONYMOUS_LEADERBOARD_LABEL, isPublic: false };
  }
  const formatted = formatLmsDisplayName(input.displayName);
  const initials = leaderboardInitials(formatted);
  if (initials.length === 0) {
    return { displayName: ANONYMOUS_LEADERBOARD_LABEL, isPublic: false };
  }
  return { displayName: initials, isPublic: true };
}

function cohortMatches(filter: CohortFilter, cohort: Cohort | null): boolean {
  return filter === "all" || cohort === filter;
}

function periodScoreForAttempts(
  attempts: readonly { readonly finishedAt: number; readonly score: number | null }[],
  period: Period,
  at: number,
): { readonly periodScore: number | null; readonly attemptsCount: number; readonly reachedAt: string | null } {
  const range = periodRangeTr(period, new Date(at));
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const scoredAttempts = attempts
    .filter((attempt) => attempt.finishedAt >= startMs && attempt.finishedAt <= endMs)
    .map((attempt) => ({
      id: "attempt",
      mode: "assessment" as const,
      finishedAt: new Date(attempt.finishedAt).toISOString(),
      score: attempt.score ?? 0,
      mastery: false,
      caseCount: 1,
      hintsUsed: 0,
      durationMs: 0,
      domains: {},
      extra: {},
    }));
  const result = periodScore(scoredAttempts, DEFAULT_RULES);
  return {
    periodScore: result.score,
    attemptsCount: result.attemptsCount,
    reachedAt: result.reachedAt,
  };
}

export function buildLeaderboardRows(input: {
  readonly viewerUserId: string;
  readonly peers: readonly LeaderboardPeerSeed[];
  readonly profiles: ReadonlyMap<string, { readonly xp: number; readonly level: number }>;
  readonly attempts: readonly LeaderboardAttemptSeed[];
  readonly simId: SimId;
  readonly period: Period;
  readonly cohort: CohortFilter;
  readonly at: number;
}): readonly LeaderboardRowDraft[] {
  const drafts: LeaderboardRowDraft[] = [];
  for (const peer of input.peers) {
    const profile = input.profiles.get(peer.userId);
    const cohort = cohortFromUnitCode(peer.unitCode);
    if (!cohortMatches(input.cohort, cohort)) continue;
    const userAttempts = input.attempts.filter(
      (attempt) => attempt.userId === peer.userId && attempt.simId === input.simId,
    );
    const period = periodScoreForAttempts(userAttempts, input.period, input.at);
    const visibility = resolveLeaderboardDisplayName({
      displayName: peer.displayName,
      isPublic: peer.public ?? true,
    });
    drafts.push({
      userId: peer.userId,
      displayName: visibility.displayName,
      isPublic: visibility.isPublic,
      cohort,
      periodScore: period.periodScore,
      attemptsCount: period.attemptsCount,
      reachedAt: period.reachedAt,
      totalXp: profile?.xp ?? 0,
      level: profile?.level ?? 1,
      rank: null,
    });
  }

  const ranked = rankRows(
    drafts.map((row) => ({
      id: row.userId,
      periodScore: row.periodScore,
      attemptsCount: row.attemptsCount,
      reachedAt: row.reachedAt,
    })),
    DEFAULT_RULES,
  );
  const rankByUser = new Map(ranked.map((row) => [row.id, row.rank]));
  return drafts.map((row) => ({
    ...row,
    rank: rankByUser.get(row.userId) ?? null,
  }));
}

export interface LeaderboardRowResponse {
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

export function toLeaderboardRowResponses(
  rows: readonly LeaderboardRowDraft[],
  viewerUserId: string,
): readonly LeaderboardRowResponse[] {
  return rows.map((row, index) => ({
    id: row.userId === viewerUserId ? "me" : `peer-${row.rank ?? index + 1}`,
    displayName: row.displayName,
    isMe: row.userId === viewerUserId,
    isPublic: row.isPublic,
    cohort: row.cohort,
    periodScore: row.periodScore,
    attemptsCount: row.attemptsCount,
    reachedAt: row.reachedAt,
    totalXp: row.totalXp,
    level: row.level,
    rank: row.rank ?? null,
  }));
}

export function paginateRows<T>(rows: readonly T[], page: number, pageSize: number): {
  readonly rows: readonly T[];
  readonly total: number;
} {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total };
}

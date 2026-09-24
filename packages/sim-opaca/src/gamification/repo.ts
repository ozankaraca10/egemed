/** `GamiRepository` PORT'u + `LocalRepo` yerel uygulaması. */

import type {
  Cohort,
  CohortFilter,
  GamiProfile,
  GamiRepository,
  MonthlyReward,
  Period,
  RewardWinner,
} from "@egemed/gamification-core";
import { evaluateBadges } from "@egemed/gamification-core";
import { periodRangeTr, periodScore, rankRows } from "@egemed/gamification-core";
import { OPACA_BADGES } from "./catalog";
import { OPACA_RULES } from "./rules";
import type { OpacaAttemptRecord } from "./attempt";
import { CT_STACKS_ITEM_KEY } from "./attempt";
import { demoPeriodRow, DEMO_PEERS } from "./mock";
import { monthlyRewardFor, rewardWinnersHistory } from "./rewards";
import { computeStats } from "./stats";
import { loadState, saveState, type OpacaGamiState } from "./storage";
import type { LeaderboardRow, LeaderboardView } from "./types";

export type { GamiRepository } from "@egemed/gamification-core";
export { formatGamiSyncError } from "./errors";

/** Geriye dönük ad — `@egemed/gamification-core` PORT'u ile aynı. */
export type GamificationRepo = GamiRepository<OpacaAttemptRecord>;

export type OpacaGamiRepo = LocalRepo | GamiRepository<OpacaAttemptRecord>;

export function isLocalRepo(repo: OpacaGamiRepo): repo is LocalRepo {
  return repo instanceof LocalRepo;
}

const ME_ID = "me";
const ANONYMOUS_LABEL = "Anonim öğrenci";

export function formatLmsName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const commaIdx = s.indexOf(",");
  if (commaIdx === -1) return s.replace(/\s+/g, " ");
  const last = s.slice(0, commaIdx).trim();
  const first = s.slice(commaIdx + 1).trim();
  if (!last || !first) return s.replace(/,/g, "").replace(/\s+/g, " ").trim();
  return `${first} ${last}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : null;
  const letters = last ? [first[0], last[0]] : [first[0]];
  return letters.map((ch) => ch!.toLocaleUpperCase("tr-TR")).join("");
}

export interface LocalRepoOptions {
  lmsStudentName?: string | null;
  stateOverride?: OpacaGamiState;
}

export class LocalRepo implements GamiRepository<OpacaAttemptRecord> {
  private lmsStudentName: string | null;
  private override: OpacaGamiState | null;

  constructor(opts: LocalRepoOptions = {}) {
    this.lmsStudentName = opts.lmsStudentName ?? null;
    this.override = opts.stateOverride ?? null;
  }

  setLmsStudentName(name: string | null | undefined): void {
    if (name && !this.lmsStudentName) this.lmsStudentName = name;
  }

  private load(): OpacaGamiState {
    return this.override ?? loadState();
  }

  private save(s: OpacaGamiState): void {
    if (this.override) this.override = s;
    else saveState(s);
  }

  snapshot(): OpacaGamiState {
    return this.load();
  }

  private defaultDisplayName(): string | null {
    return this.lmsStudentName ? formatLmsName(this.lmsStudentName) || null : null;
  }

  async getMe(): Promise<GamiProfile & { id: string }> {
    const s = this.load();
    return {
      id: ME_ID,
      displayName: s.profile.displayName ?? this.defaultDisplayName(),
      public: s.profile.public,
      cohort: s.profile.cohort,
    };
  }

  async updateMe(patch: Partial<GamiProfile>): Promise<void> {
    const s = this.load();
    s.profile = { ...s.profile, ...patch };
    this.save(s);
  }

  async recordAttempt(attempt: OpacaAttemptRecord): Promise<void> {
    const s = this.load();
    if (s.attempts.some((a) => a.id === attempt.id)) return;
    s.attempts.push(attempt);
    const finishedAt = new Date(attempt.finishedAt);
    const stats = computeStats(s.attempts, s.learn, s.earned, finishedAt);
    const newlyEarned = evaluateBadges(OPACA_BADGES, stats, s.earned, { now: finishedAt });
    s.earned = [...s.earned, ...newlyEarned];
    this.save(s);
  }

  async recordLearn(activity: { topic?: string; ctStack?: string }, now: Date): Promise<void> {
    const s = this.load();
    let changed = false;
    if (activity.topic && !s.learn.topics.includes(activity.topic)) {
      s.learn.topics.push(activity.topic);
      changed = true;
    }
    if (activity.ctStack) {
      const stacks = s.learn.items[CT_STACKS_ITEM_KEY] ?? [];
      if (!stacks.includes(activity.ctStack)) {
        s.learn.items[CT_STACKS_ITEM_KEY] = [...stacks, activity.ctStack];
        changed = true;
      }
    }
    if (!changed) return;
    const stats = computeStats(s.attempts, s.learn, s.earned, now);
    s.earned = [...s.earned, ...evaluateBadges(OPACA_BADGES, stats, s.earned, { now })];
    this.save(s);
  }

  async listAttempts(): Promise<OpacaAttemptRecord[]> {
    return this.load().attempts;
  }

  async getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<LeaderboardView> {
    const s = this.load();
    const { start, end } = periodRangeTr(period, now);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const myAttemptsInPeriod = s.attempts.filter(
      (a) => a.mode === "assessment" && a.finishedAt >= startIso && a.finishedAt <= endIso,
    );
    const myScore = periodScore(myAttemptsInPeriod, OPACA_RULES);
    const myStats = computeStats(s.attempts, s.learn, s.earned, now);
    const myDisplayName = s.profile.public ? (s.profile.displayName ?? this.defaultDisplayName()) : null;

    const meRow: LeaderboardRow = {
      id: ME_ID,
      displayName: myDisplayName ?? ANONYMOUS_LABEL,
      isMe: true,
      isPublic: s.profile.public,
      cohort: s.profile.cohort,
      periodScore: myScore.score,
      attemptsCount: myScore.attemptsCount,
      reachedAt: myScore.reachedAt,
      totalXp: myStats.totalXp,
      level: myStats.level,
      rank: null,
    };

    const cohortMatches = (c: Cohort | null) => cohort === "all" || c === cohort;
    const peerRows: LeaderboardRow[] = DEMO_PEERS.filter((p) => cohortMatches(p.cohort)).map((p) => {
      const row = demoPeriodRow(p, period, now);
      return {
        id: p.id,
        displayName: p.public && p.displayName ? p.displayName : ANONYMOUS_LABEL,
        isMe: false,
        isPublic: p.public && !!p.displayName,
        cohort: p.cohort,
        periodScore: row.periodScore,
        attemptsCount: row.attemptsCount,
        reachedAt: row.reachedAt,
        totalXp: row.totalXp,
        level: row.level,
        rank: null,
      };
    });

    const rows = cohortMatches(s.profile.cohort) ? [...peerRows, meRow] : peerRows;
    const ranked = rankRows(rows, OPACA_RULES);

    return { period, cohort, generatedAt: now.toISOString(), isDemo: true, rows: ranked };
  }

  async getMonthlyReward(month: string): Promise<MonthlyReward | null> {
    return monthlyRewardFor(month);
  }

  async getRewardWinners(lastNMonths: number, now: Date): Promise<RewardWinner[]> {
    return rewardWinnersHistory(lastNMonths, now);
  }
}

/** Testler ve dispose için modül düzeyinde depo sıfırlama. */
export function resetGamiRepo(): void {
  localRepo = null;
  injectedRepo = null;
}

let localRepo: LocalRepo | null = null;
let injectedRepo: GamiRepository<OpacaAttemptRecord> | null = null;

/** Kabuk/SimModule: API deposu enjekte eder; `null` yerel davranışa döner. */
export function configureGamiRepository(repo: GamiRepository<OpacaAttemptRecord> | null): void {
  injectedRepo = repo;
  if (repo === null) localRepo = null;
}

export interface GamiRepoInit {
  lmsName?: string | null;
  demoState?: OpacaGamiState;
}

export function getGamiRepo(init: GamiRepoInit = {}): OpacaGamiRepo {
  if (injectedRepo) return injectedRepo;
  if (!localRepo) {
    const opts: LocalRepoOptions = { lmsStudentName: init.lmsName ?? null };
    if (init.demoState !== undefined) opts.stateOverride = init.demoState;
    localRepo = new LocalRepo(opts);
  }
  if (init.lmsName) localRepo.setLmsStudentName(init.lmsName);
  return localRepo;
}

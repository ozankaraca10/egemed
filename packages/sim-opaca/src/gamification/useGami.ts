/** Oyunlaştırma React köprüsü. */

import { useEffect, useMemo, useState } from "react";
import {
  computeStreak,
  computeWeeklyGoals,
  levelForXp,
  type StreakInfo,
  type WeeklyGoalsResult,
  type LevelInfo,
} from "@egemed/gamification-core";
import { useStore } from "../core/StoreProvider";
import type { DemoKind } from "./demo";
import { OPACA_RULES } from "./rules";
import { demoStateFor } from "./demo";
import { getGamiRepo, type LocalRepo } from "./repo";
import { computeStats, type OpacaStats } from "./stats";
import type { OpacaGamiState } from "./storage";
import type { LeaderboardView } from "./types";

export interface GamiView {
  state: OpacaGamiState;
  stats: OpacaStats;
  level: LevelInfo;
  streak: StreakInfo;
  goals: WeeklyGoalsResult;
  now: Date;
  hasAttempts: boolean;
  repo: LocalRepo;
}

export function useGami(version = 0, demo: DemoKind | null = null): GamiView {
  const { now: nowMs } = useStore();
  const now = useMemo(() => new Date(nowMs()), [nowMs, version]);
  const repo = useMemo(() => {
    if (demo) return getGamiRepo({ demoState: demoStateFor(demo, now) });
    return getGamiRepo();
  }, [demo, now]);
  return useMemo(() => {
    const state = repo.snapshot();
    const stats = computeStats(state.attempts, state.learn, state.earned, now);
    return {
      state,
      stats,
      level: levelForXp(stats.totalXp, OPACA_RULES),
      streak: computeStreak(state.attempts, now),
      goals: computeWeeklyGoals(state.attempts, state.earned, now, OPACA_RULES),
      now,
      hasAttempts: state.attempts.length > 0,
      repo,
    };
  }, [repo, now, version]);
}

export function useLeaderboard(
  period: LeaderboardView["period"],
  cohort: LeaderboardView["cohort"],
  now: Date,
  repoArg: LocalRepo,
  version = 0,
) {
  const [view, setView] = useState<LeaderboardView | null>(null);
  useEffect(() => {
    let alive = true;
    repoArg.getLeaderboard(period, cohort, now).then((v) => {
      if (alive) setView(v);
    });
    return () => {
      alive = false;
    };
  }, [period, cohort, now, repoArg, version]);
  return view;
}

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
import { useGamiContext } from "./GamiContext";
import { getGamiRepo, isLocalRepo, type OpacaGamiRepo } from "./repo";
import type { OpacaAttemptRecord } from "./attempt";
import { computeStats, type OpacaStats } from "./stats";
import { emptyState, type OpacaGamiState } from "./storage";
import type { LeaderboardView } from "./types";

export interface GamiView {
  state: OpacaGamiState;
  stats: OpacaStats;
  level: LevelInfo;
  streak: StreakInfo;
  goals: WeeklyGoalsResult;
  now: Date;
  hasAttempts: boolean;
  repo: OpacaGamiRepo;
  loading: boolean;
}

function stateFromRemote(
  attempts: ReadonlyArray<OpacaAttemptRecord>,
  profile: OpacaGamiState["profile"],
): OpacaGamiState {
  return {
    v: 1,
    attempts: [...attempts],
    learn: { topics: [], items: {} },
    earned: [],
    profile,
  };
}

export function useGami(version = 0, demo: DemoKind | null = null): GamiView {
  const { now: nowMs } = useStore();
  const { reportSyncError } = useGamiContext();
  const now = useMemo(() => new Date(nowMs()), [nowMs, version]);
  const repo = useMemo(() => {
    if (demo) return getGamiRepo({ demoState: demoStateFor(demo, now) });
    return getGamiRepo();
  }, [demo, now]);
  const [remoteState, setRemoteState] = useState<OpacaGamiState | null>(null);
  const [loading, setLoading] = useState(!isLocalRepo(repo));

  useEffect(() => {
    if (isLocalRepo(repo)) {
      setRemoteState(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([repo.listAttempts(), repo.getMe()])
      .then(([attempts, me]) => {
        if (!alive) return;
        setRemoteState(
          stateFromRemote(attempts, {
            displayName: me.displayName,
            public: me.public,
            cohort: me.cohort,
          }),
        );
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        reportSyncError(error, "read");
        setRemoteState(emptyState());
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [repo, version, reportSyncError]);

  return useMemo(() => {
    const state = isLocalRepo(repo) ? repo.snapshot() : (remoteState ?? emptyState());
    const stats = computeStats([...state.attempts], state.learn, state.earned, now);
    return {
      state,
      stats,
      level: levelForXp(stats.totalXp, OPACA_RULES),
      streak: computeStreak(state.attempts, now),
      goals: computeWeeklyGoals(state.attempts, state.earned, now, OPACA_RULES),
      now,
      hasAttempts: state.attempts.length > 0,
      repo,
      loading,
    };
  }, [repo, remoteState, now, version, loading]);
}

export function useLeaderboard(
  period: LeaderboardView["period"],
  cohort: LeaderboardView["cohort"],
  now: Date,
  repoArg: OpacaGamiRepo,
  version = 0,
) {
  const { reportSyncError } = useGamiContext();
  const [view, setView] = useState<LeaderboardView | null>(null);
  useEffect(() => {
    let alive = true;
    repoArg
      .getLeaderboard(period, cohort, now)
      .then((v) => {
        if (alive) setView(v);
      })
      .catch((error: unknown) => {
        if (alive) {
          reportSyncError(error, "read");
          setView(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [period, cohort, now, repoArg, version, reportSyncError]);
  return view;
}

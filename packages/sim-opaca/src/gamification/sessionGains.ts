import { useEffect, useState } from "react";
import { attemptXp, badgeViews, levelForXp, type BadgeView, type GamiMode, type Period } from "@egemed/gamification-core";
import type { GamiGainsModel } from "@egemed/gami-ui";
import type { CaseDef, CaseResult } from "../core/types";
import { toGamiBadge } from "../ui/opacaGami";
import { buildAttemptRecord } from "./attempt";
import { OPACA_BADGES, type OpacaBadgeContext } from "./catalog";
import { useGamiContext } from "./GamiContext";
import { daysLeft } from "./leaderboardView";
import { isLocalRepo, type OpacaGamiRepo } from "./repo";
import { OPACA_RULES } from "./rules";
import { computeStats, type OpacaStats } from "./stats";
import type { OpacaGamiState } from "./storage";

type OpacaBadgeView = BadgeView<OpacaStats, OpacaBadgeContext>;

async function rankOf(repo: OpacaGamiRepo, period: Period, now: Date) {
  const v = await repo.getLeaderboard(period, "all", now);
  const me = v.rows.find((r) => r.isMe);
  return { rank: me?.rank ?? null, of: v.rows.filter((r) => r.rank !== null).length };
}

async function loadRepoState(repo: OpacaGamiRepo): Promise<OpacaGamiState> {
  if (isLocalRepo(repo)) return repo.snapshot();
  const [attempts, me] = await Promise.all([repo.listAttempts(), repo.getMe()]);
  return {
    v: 1,
    attempts: [...attempts],
    learn: { topics: [], items: {} },
    earned: [],
    profile: { displayName: me.displayName, public: me.public, cohort: me.cohort },
  };
}

export function useOpacaSessionGains(input: {
  repo: OpacaGamiRepo;
  mode: GamiMode;
  results: CaseResult[];
  caseById: (id: string) => CaseDef | undefined;
  seed: number;
  durationMs: number;
  finishedAt: Date;
} | null): GamiGainsModel | null {
  const { reportAttempt, reportSyncError } = useGamiContext();
  const [gains, setGains] = useState<GamiGainsModel | null>(null);
  const mode = input?.mode;
  const seed = input?.seed;
  const durationMs = input?.durationMs;
  const finishedAt = input?.finishedAt;
  const repo = input?.repo;
  const caseById = input?.caseById;
  const results = input?.results;
  useEffect(() => {
    if (!repo || !caseById || !results || mode === undefined || seed === undefined || durationMs === undefined || !finishedAt) return;
    let alive = true;
    const at = finishedAt;
    const attempt = buildAttemptRecord({ mode, results, caseById, sessionSeed: seed, durationMs, finishedAt: at });
    if (!attempt) return;
    const period: Period = daysLeft(at) < 7 ? "month" : "week";
    void (async () => {
      try {
        const beforeState = await loadRepoState(repo);
        const already = beforeState.attempts.some((a) => a.id === attempt.id);
        const beforeEarned = new Set(beforeState.earned.map((e) => e.id));
        const before = mode === "assessment" ? await rankOf(repo, period, at) : null;
        await repo.recordAttempt(attempt);
        try {
          const reported = reportAttempt?.(attempt) as void | Promise<void>;
          if (reported instanceof Promise) void reported.catch(() => undefined);
        } catch {
          // Rapor hatası sonuç ekranını bozmaz.
        }
        const afterState = await loadRepoState(repo);
        const stats = computeStats(afterState.attempts, afterState.learn, afterState.earned, at);
        const views: OpacaBadgeView[] = badgeViews(OPACA_BADGES, stats, afterState.earned, { now: at });
        const fresh = already ? [] : views.filter((v) => v.state === "earned" && !beforeEarned.has(v.def.id));
        const next = views.filter((v) => v.state === "progress").sort((a, b) => b.value / b.max - a.value / a.max)[0] ?? null;
        const after = mode === "assessment" ? await rankOf(repo, period, at) : null;
        const bonus = mode === "assessment" && attempt.score >= OPACA_RULES.xp.assessmentBonusThreshold ? OPACA_RULES.xp.assessmentBonus : 0;
        const picked = fresh[0] ?? next;
        const level = levelForXp(stats.totalXp, OPACA_RULES);
        if (!alive) return;
        setGains({
          badge: picked ? toGamiBadge(picked) : null,
          badgeFresh: fresh.length > 0,
          xp: attemptXp(attempt, OPACA_RULES),
          bonus,
          level: level.level,
          xpInto: level.xpIntoLevel,
          xpSpan: level.levelEndXp - level.levelStartXp,
          xpToNext: level.xpToNext,
          rank: after ? { period, rank: after.rank, of: after.of, delta: before?.rank && after.rank ? before.rank - after.rank : null } : null,
          confetti: fresh.length > 0 && attempt.mastery,
        });
      } catch (error: unknown) {
        if (!alive) return;
        reportSyncError(error, "write");
      }
    })();
    return () => { alive = false; };
  }, [caseById, durationMs, finishedAt, mode, repo, reportAttempt, reportSyncError, results, seed]);
  return input ? gains : null;
}

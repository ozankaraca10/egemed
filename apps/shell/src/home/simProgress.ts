import { useEffect, useMemo, useState } from "react";
import type { GamiSimSummary, LearnStatus } from "@egemed/contracts";
import { useShellDataSources } from "../dataSources";
import { isFacultyLike, type ShellSession } from "../session";
import { SIM_IDS, type SimId } from "../SimCard";

/**
 * T296 — Ana sayfa ve Simülatörler kartlarının ortak ilerleme özeti. Kaynaklar
 * kabuk veri bağlamındandır (oturumsuz/ziyaretçide boş). Öğrenme durumu
 * yalnız API oturumunda bilinir; bilinmiyorsa `learnComplete: null` (kartlar
 * kilit iddia etmez, kapıyı sim ve sunucu uygular).
 */
export interface SimProgress {
  readonly simId: SimId;
  /** null: bilinmiyor. Yönetici/öğretim üyesi/uzmanlık öğrencisi için her zaman true (muaf). */
  readonly learnComplete: boolean | null;
  readonly level: number | null;
  readonly bestScore: number | null;
  readonly rank: { readonly rank: number; readonly total: number } | null;
  readonly streak: number;
  readonly weekly: { readonly current: number; readonly target: number } | null;
  /** Son etkinlik (ISO; deneme bitişi ya da seri günü); hiç yoksa null. */
  readonly lastActive: string | null;
}

function fromSummary(simId: SimId, summary: GamiSimSummary | undefined, learnComplete: boolean | null): SimProgress {
  if (summary === undefined) {
    return { simId, learnComplete, level: null, bestScore: null, rank: null, streak: 0, weekly: null, lastActive: null };
  }
  const scores = summary.attempts.map((attempt) => attempt.score).filter((score): score is number => score !== null);
  const dates = [...summary.attempts.map((attempt) => attempt.finishedAt), ...(summary.streak.lastDate === null ? [] : [summary.streak.lastDate])].sort();
  return {
    simId,
    learnComplete,
    level: summary.level,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    rank: summary.leaderboard.total > 0 ? { rank: summary.leaderboard.rank, total: summary.leaderboard.total } : null,
    streak: summary.streak.current,
    weekly: { current: summary.weeklyGoal.currentXp, target: summary.weeklyGoal.targetXp },
    lastActive: dates.at(-1) ?? null,
  };
}

/** Saf birleştirme (test edilebilir): özetler + öğrenme durumu → sim başına ilerleme. */
export function buildSimProgress(
  summaries: readonly GamiSimSummary[],
  learn: LearnStatus | null,
  learnExempt: boolean,
): Record<SimId, SimProgress> {
  const entries = SIM_IDS.map((simId) => {
    const learnComplete = learnExempt ? true : learn === null ? null : learn[simId].complete;
    return [simId, fromSummary(simId, summaries.find((summary) => summary.simId === simId), learnComplete)] as const;
  });
  return Object.fromEntries(entries) as Record<SimId, SimProgress>;
}

/** En son etkinlik gösterilen sim (Bugün kartının "kaldığın yerden devam" hedefi); hiç yoksa null. */
export function resumeSim(progress: Record<SimId, SimProgress>): SimProgress | null {
  const active = SIM_IDS.map((id) => progress[id]).filter((item) => item.lastActive !== null);
  active.sort((a, b) => (a.lastActive ?? "").localeCompare(b.lastActive ?? ""));
  return active.at(-1) ?? null;
}

export function useSimProgress(session: ShellSession | null): Record<SimId, SimProgress> | null {
  const sources = useShellDataSources();
  const gamification = useMemo(() => (sources === null || session === null ? null : sources.gamification(session)), [sources, session]);
  const learnSource = useMemo(() => (sources === null || session === null ? null : sources.learn(session)), [sources, session]);
  const [summaries, setSummaries] = useState<readonly GamiSimSummary[] | null>(null);
  const [learn, setLearn] = useState<LearnStatus | null>(null);
  useEffect(() => {
    let alive = true;
    if (gamification === null) {
      setSummaries(null);
      return undefined;
    }
    gamification.getSummaries().then(
      (next) => { if (alive) setSummaries(next); },
      () => { if (alive) setSummaries([]); },
    );
    return () => { alive = false; };
  }, [gamification]);
  useEffect(() => {
    let alive = true;
    if (learnSource === null) return undefined;
    learnSource.status().then(
      (next) => { if (alive) setLearn(next); },
      () => undefined,
    );
    return () => { alive = false; };
  }, [learnSource]);
  if (session === null || summaries === null) return null;
  const exempt = session.role === "admin" || isFacultyLike(session);
  return buildSimProgress(summaries, learn, exempt);
}

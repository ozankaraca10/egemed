/** API oturumunda İlerlemem: özet ve liderlik satırları askıya alınarak okunur. */
import { Component, Suspense, use, useMemo, useState, type ReactNode } from "react";
import { levelForXp, type CohortFilter, type EarnedBadge, type GamiLeaderboardRow, type GamiRules, type LevelInfo, type Period, type StreakInfo } from "@egemed/gamification-core";
import { GamiSyncErrorBanner } from "./GamiSyncErrorBanner";

export interface ServerGamiSummary {
  readonly xp: number;
  readonly level: number;
  readonly streak: { readonly current: number; readonly best: number };
  readonly badges: readonly { readonly key: string; readonly awardedAt: string }[];
}

export interface ServerGamiData {
  readonly summary: ServerGamiSummary;
  readonly rows: readonly GamiLeaderboardRow[];
}

export interface GamiServerSource {
  summary(): Promise<ServerGamiSummary>;
  leaderboard(period: Period, cohort: CohortFilter): Promise<{ readonly rows: readonly GamiLeaderboardRow[] }>;
}

/** Katalogda karşılığı olan sunucu rozetleri kazanıldı sayılır; ilerleme çubuğu yerel kalır. */
export function earnedFromServer(
  catalog: readonly { id: string }[],
  badges: readonly { key: string; awardedAt: string }[],
): EarnedBadge[] {
  const ids = new Set(catalog.map((item) => item.id));
  const earned: EarnedBadge[] = [];
  for (const badge of badges) {
    if (ids.has(badge.key)) earned.push({ id: badge.key, at: badge.awardedAt });
  }
  return earned;
}

export function levelFromServer(xp: number, level: number, rules: GamiRules): LevelInfo {
  return { ...levelForXp(Math.max(0, xp), rules), level: Math.max(1, level) };
}

export function streakFromServer(streak: { current: number; best: number }): StreakInfo {
  return { current: streak.current, longest: streak.best };
}

export function serverHasActivity(summary: ServerGamiSummary, attemptCount: number): boolean {
  return summary.xp > 0 || summary.badges.length > 0 || attemptCount > 0;
}

/**
 * Askıya alınan bileşen yalnız hazır vaatleri okur. Vaatler Suspense sınırının
 * DIŞINDA (GamiServerFrame) üretilir: askıya alınan ilk çizimde bileşen durumu
 * atıldığından, içeride useMemo her denemede yeni istek açıp sonsuz
 * “Yükleniyor”a düşüyordu (T124 bulgusu).
 */
function ServerRead({
  summaryPromise,
  boardPromise,
  children,
}: {
  summaryPromise: Promise<ServerGamiSummary>;
  boardPromise: Promise<{ readonly rows: readonly GamiLeaderboardRow[] }>;
  children: (data: ServerGamiData) => ReactNode;
}) {
  const summary = use(summaryPromise);
  const board = use(boardPromise);
  return children({ summary, rows: board.rows });
}

class GamiLoadBoundary extends Component<
  { children: ReactNode; icon: ReactNode; onDismiss: () => void },
  { error: unknown | null }
> {
  state = { error: null as unknown | null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <GamiSyncErrorBanner
          icon={this.props.icon}
          message="Sunucu ilerlemesi okunamadı."
          onDismiss={this.props.onDismiss}
        />
      );
    }
    return this.props.children;
  }
}

export function GamiServerFrame({
  source,
  period,
  cohort,
  icon,
  fallback,
  children,
}: {
  source: GamiServerSource;
  period: Period;
  cohort: CohortFilter;
  icon: ReactNode;
  fallback: ReactNode;
  children: (data: ServerGamiData) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const summaryPromise = useMemo(() => source.summary(), [source, attempt]);
  const boardPromise = useMemo(() => source.leaderboard(period, cohort), [source, period, cohort, attempt]);
  return (
    <GamiLoadBoundary key={attempt} icon={icon} onDismiss={() => setAttempt((value) => value + 1)}>
      <Suspense fallback={fallback}>
        <ServerRead boardPromise={boardPromise} summaryPromise={summaryPromise}>
          {children}
        </ServerRead>
      </Suspense>
    </GamiLoadBoundary>
  );
}

export function gamiLoadingStatus(): ReactNode {
  return <p className="eg-gami-note" role="status">Yükleniyor</p>;
}

/// <reference lib="dom" />
/**
 * Pulse "İlerlemem" sayfası — Opaca ve Ausculta ile AYNI tasarım (depo sahibi
 * kararı, 25 Eylül 2026). `@egemed/gami-ui` görünümleri kaynak runtime'ın gölge
 * kökünde bir React kökünde çizilir; veri Pulse'un kullanıcı×sim ad alanlı yerel
 * oyunlaştırma deposundan gelir. API oturumunda kabuk `gamification` verirse
 * rozet, XP ve liderlik sunucudan okunur ve "Demo verisi" bandı gizlenir.
 */
import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  attemptXp,
  computeStreak,
  computeWeeklyGoals,
  levelForXp,
  periodRangeTr,
  periodScore,
  rankRows,
  totalXpFor,
  type AchievementsPeriod,
  type Cohort,
  type CohortFilter,
  type GamiLeaderboardRow,
  type Period,
  type WeeklyGoal,
} from "@egemed/gamification-core";
import type { SimRewardsSnapshot, SimRewardsSource } from "@egemed/sim-host";
import {
  buildAchievementsModel,
  buildLeaderboardModel,
  defaultGamiIcons,
  earnedFromServer,
  GamiAchievementsView,
  GamiLeaderboardView,
  GamiProgressPage,
  GamiServerFrame,
  gamiLoadingStatus,
  levelFromServer,
  serverHasActivity,
  streakFromServer,
  type GamiPageTab,
  type GamiServerSource,
  type ServerGamiData,
} from "@egemed/gami-ui";
import { PULSE_BADGES } from "../gamification/catalog";
import type { PulseAttemptRecord, PulseDomain } from "../gamification/attempt";
import { computePulseStats } from "../gamification/repo";
import type { PulseGamiState } from "../gamification/repo";
import { PULSE_RULES } from "../gamification/rules";

const DOMAIN_META: { key: PulseDomain; label: string; icon: ReactNode }[] = [
  { icon: defaultGamiIcons.chart({}), key: "rhythmRecognition", label: "Ritim tanıma" },
  { icon: defaultGamiIcons.target({ height: 16, width: 16 }), key: "leadReading", label: "Derivasyon okuma" },
  { icon: defaultGamiIcons.clock({ height: 16, width: 16 }), key: "intervalMeasurement", label: "Aralık ölçümü" },
];

const TONES = ["t-blue", "t-purple", "t-green", "t-amber"] as const;

function avatarOf(id: string, name: string | null) {
  if (!name) return { text: "AÖ", tone: "t-anon" as const };
  let hash = 7;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : parts[0]?.[0] ?? "";
  return { text: letters.toLocaleUpperCase("tr-TR"), tone: TONES[hash % TONES.length] ?? "t-blue" };
}

const goalIcon = (id: WeeklyGoal["id"]) => {
  if (id === "weekly-assessments") return defaultGamiIcons.chart({});
  if (id === "weekly-avg-score") return defaultGamiIcons.checkCircle({ height: 16, width: 16 });
  return defaultGamiIcons.award({ height: 16, width: 16 });
};

type Profile = { public: boolean; displayName: string | null; cohort: Cohort | null };

/** Yerel sıralama: yalnız oturum sahibi (sunucu sıralaması API oturumunda gelir). */
function localRows(attempts: readonly PulseAttemptRecord[], now: Date, period: Period, cohort: CohortFilter, profile: Profile): GamiLeaderboardRow[] {
  const { start, end } = periodRangeTr(period, now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const mine = attempts.filter((a) => a.mode === "assessment" && a.finishedAt >= startIso && a.finishedAt <= endIso);
  const scored = periodScore(mine, PULSE_RULES);
  const xp = attempts.reduce((sum, item) => sum + attemptXp(item, PULSE_RULES), 0);
  const row: GamiLeaderboardRow = {
    attemptsCount: scored.attemptsCount,
    cohort: profile.cohort,
    displayName: profile.public ? profile.displayName ?? "Sen" : "Anonim öğrenci",
    id: "me",
    isMe: true,
    isPublic: profile.public,
    level: levelForXp(xp, PULSE_RULES).level,
    periodScore: scored.score,
    rank: null,
    reachedAt: scored.reachedAt,
    totalXp: xp,
  };
  return rankRows(cohort === "all" || profile.cohort === cohort ? [row] : [], PULSE_RULES);
}

export interface PulseProgressActions {
  /** Değerlendirmeye (kaynak sınav görünümü) geçer. */
  readonly onAssessment: () => void;
  /** İncelemeye (kaynak simülasyon görünümü) geçer. */
  readonly onStudy: () => void;
  /** Sayfayı kapatıp simülatöre döner. */
  readonly onClose: () => void;
}

function PulseProgressBody({
  state,
  now,
  actions,
  server,
  rewards,
  tab,
  setTab,
  period,
  setPeriod,
  boardPeriod,
  setBoardPeriod,
  cohort,
  setCohort,
  privacy,
  setPrivacy,
}: {
  state: PulseGamiState;
  now: Date;
  actions: PulseProgressActions;
  server: ServerGamiData | null;
  rewards: SimRewardsSnapshot | null;
  tab: GamiPageTab;
  setTab: (tab: GamiPageTab) => void;
  period: AchievementsPeriod;
  setPeriod: (period: AchievementsPeriod) => void;
  boardPeriod: Period;
  setBoardPeriod: (period: Period) => void;
  cohort: CohortFilter;
  setCohort: (cohort: CohortFilter) => void;
  privacy: Profile;
  setPrivacy: (update: (current: Profile) => Profile) => void;
}): JSX.Element {
  const summary = useMemo(() => {
    const xp = server ? server.summary.xp : totalXpFor(state.attempts, state.learn, PULSE_RULES);
    const earned = server ? earnedFromServer(PULSE_BADGES, server.summary.badges) : state.earned;
    return {
      earned,
      goals: computeWeeklyGoals(state.attempts, earned, now, PULSE_RULES),
      level: server ? levelFromServer(xp, server.summary.level, PULSE_RULES) : levelForXp(xp, PULSE_RULES),
      stats: computePulseStats(state.attempts),
      streak: server ? streakFromServer(server.summary.streak) : computeStreak(state.attempts, now),
    };
  }, [now, server, state]);
  const localWeek = useMemo(() => localRows(state.attempts, now, "week", "all", privacy), [now, privacy, state.attempts]);
  const weekRows = server && tab !== "leaderboard" ? server.rows : localWeek;
  const achievements = useMemo(
    () =>
      buildAchievementsModel({
        attempts: state.attempts,
        badgeContext: { now },
        ...(server ? { activity: serverHasActivity(server.summary, state.attempts.length) } : {}),
        catalog: PULSE_BADGES,
        domainMeta: DOMAIN_META,
        earned: summary.earned,
        goals: summary.goals,
        level: summary.level,
        now,
        period,
        profile: privacy,
        rules: PULSE_RULES,
        stats: summary.stats,
        streak: summary.streak,
        weekRows,
      }),
    [now, period, privacy, state, summary, weekRows],
  );
  const localBoard = useMemo(() => localRows(state.attempts, now, boardPeriod, cohort, privacy), [boardPeriod, cohort, now, privacy, state.attempts]);
  const rows = server && tab === "leaderboard" ? server.rows : localBoard;
  const monthRows = boardPeriod === "month" && server && tab === "leaderboard"
    ? rows
    : server && tab === "leaderboard"
      ? null
      : localRows(state.attempts, now, "month", "all", privacy);
  const prevRows = useMemo(() => {
    const prev = new Date(periodRangeTr(boardPeriod, now).start.getTime() - 1);
    return localRows(state.attempts, prev, boardPeriod, cohort, privacy);
  }, [boardPeriod, cohort, now, privacy, state.attempts]);
  const leaderboard = useMemo(
    () =>
      buildLeaderboardModel({
        boardReady: true,
        clock: now,
        cohort,
        monthRows,
        now,
        period: boardPeriod,
        prevRows: server && tab === "leaderboard" ? null : prevRows,
        reward: rewards?.current ?? null,
        rows,
      }),
    [boardPeriod, cohort, monthRows, now, prevRows, rewards, rows, server, tab],
  );

  return (
    <div className="screen egemed-pulse-progress">
      <div className="egemed-pulse-progress__bar">
        <button className="egemed-pulse-progress__close" onClick={actions.onClose} type="button">
          ← Simülatöre dön
        </button>
      </div>
      <GamiProgressPage active={tab} demo={server === null} icons={defaultGamiIcons} onTab={setTab}>
        {tab === "achievements" ? (
          <GamiAchievementsView
            avatarOf={avatarOf}
            badges={achievements.badges}
            categories={achievements.categories}
            congrats={achievements.congrats}
            congratsIcon={defaultGamiIcons.award({ height: 28, width: 28 })}
            domainRange={achievements.domainRange}
            domains={achievements.domains}
            doneIcon={defaultGamiIcons.check({ height: 16, width: 16 })}
            goalIcon={goalIcon}
            goals={achievements.goals}
            hasAttempts={achievements.hasAttempts}
            icons={defaultGamiIcons}
            onAssessment={actions.onAssessment}
            onLeaderboard={() => setTab("leaderboard")}
            onPeriod={setPeriod}
            onScrollBadges={() => undefined}
            onStudy={() => actions.onStudy()}
            period={achievements.hasAttempts ? period : null}
            periods={achievements.periods}
            points={achievements.points}
            profile={achievements.profile}
            rangeLabel={achievements.rangeLabel}
            subtitle="Değerlendirme ve uygulama oturumlarından kazandığın ilerleme."
            title={<h2 className="results-title-v2">Başarılarım</h2>}
            weekLabel={achievements.weekLabel}
          />
        ) : (
          <GamiLeaderboardView
            avatarOf={avatarOf}
            candidates={leaderboard.candidates}
            cohort={cohort}
            cohorts={leaderboard.cohorts}
            countdown={leaderboard.countdown}
            icons={defaultGamiIcons}
            items={leaderboard.items}
            meDelta={leaderboard.meDelta}
            onCloseTerms={() => undefined}
            onCohort={setCohort}
            onPeriod={setBoardPeriod}
            onPrivacy={(patch) =>
              setPrivacy((current) => ({
                cohort: patch.cohort === undefined ? current.cohort : patch.cohort,
                displayName: current.displayName,
                public: patch.public ?? current.public,
              }))
            }
            onQualify={actions.onAssessment}
            onStatusAction={(action) => {
              if (action === "assess") actions.onAssessment();
            }}
            onTerms={() => undefined}
            period={boardPeriod}
            periodLabel={leaderboard.periodLabel}
            periods={leaderboard.periods}
            privacy={{ cohort: privacy.cohort, isPublic: privacy.public, name: privacy.displayName }}
            qualify={leaderboard.qualify}
            rankedEmpty={leaderboard.rankedEmpty}
            reward={rewards?.current ?? null}
            rows={leaderboard.rows}
            status={leaderboard.status}
            subtitle="Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme)."
            terms={false}
            title={<h2 className="results-title-v2">Liderlik Tahtası</h2>}
            winners={[...(rewards?.winners ?? [])]}
          />
        )}
      </GamiProgressPage>
    </div>
  );
}

export function PulseProgressPage({
  state,
  now,
  actions,
  gamification,
  rewards = null,
}: {
  state: PulseGamiState;
  now: Date;
  actions: PulseProgressActions;
  gamification?: GamiServerSource;
  rewards?: SimRewardsSnapshot | null;
}): JSX.Element {
  const [tab, setTab] = useState<GamiPageTab>("achievements");
  const [period, setPeriod] = useState<AchievementsPeriod>("last30");
  const [boardPeriod, setBoardPeriod] = useState<Period>("week");
  const [cohort, setCohort] = useState<CohortFilter>("all");
  const [privacy, setPrivacy] = useState<Profile>({ cohort: null, displayName: null, public: false });
  const body = (server: ServerGamiData | null) => (
    <PulseProgressBody
      actions={actions}
      boardPeriod={boardPeriod}
      cohort={cohort}
      now={now}
      period={period}
      privacy={privacy}
      server={server}
      rewards={rewards}
      setBoardPeriod={setBoardPeriod}
      setCohort={setCohort}
      setPeriod={setPeriod}
      setPrivacy={setPrivacy}
      setTab={setTab}
      state={state}
      tab={tab}
    />
  );
  if (gamification === undefined) return body(null);
  const remotePeriod = tab === "leaderboard" ? boardPeriod : "week";
  const remoteCohort = tab === "leaderboard" ? cohort : "all";
  return (
    <GamiServerFrame
      cohort={remoteCohort}
      fallback={gamiLoadingStatus()}
      icon={defaultGamiIcons.info({ height: 16, width: 16 })}
      period={remotePeriod}
      source={gamification}
    >
      {body}
    </GamiServerFrame>
  );
}

export interface PulseProgressHandle {
  update(state: PulseGamiState, now: Date): void;
  dispose(): void;
}

function PulseProgressConnected({
  state,
  now,
  actions,
  gamification,
  rewards,
}: {
  state: PulseGamiState;
  now: Date;
  actions: PulseProgressActions;
  gamification?: GamiServerSource;
  rewards?: SimRewardsSource;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<SimRewardsSnapshot | null>(() => rewards?.snapshot() ?? null);
  useEffect(() => {
    if (rewards === undefined) {
      setSnapshot(null);
      return;
    }
    setSnapshot(rewards.snapshot());
    return rewards.subscribe(setSnapshot);
  }, [rewards]);
  return <PulseProgressPage actions={actions} now={now} rewards={snapshot} state={state} {...(gamification === undefined ? {} : { gamification })} />;
}

/** Gölge kök içindeki `container`a React kökü kurar; durum değiştikçe `update`. */
export function mountPulseProgress(
  container: HTMLElement,
  actions: PulseProgressActions,
  gamification?: GamiServerSource,
  rewards?: SimRewardsSource,
): PulseProgressHandle {
  const root: Root = createRoot(container);
  return {
    dispose: () => root.unmount(),
    update: (state, now) => root.render(
      <PulseProgressConnected
        actions={actions}
        now={now}
        state={state}
        {...(gamification === undefined ? {} : { gamification })}
        {...(rewards === undefined ? {} : { rewards })}
      />,
    ),
  };
}

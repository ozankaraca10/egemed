import type { JSX, ReactNode } from "react";
import { useMemo, useState } from "react";
import type { AchievementsPeriod, Cohort, CohortFilter, Period, WeeklyGoal } from "@egemed/gamification-core";
import { periodRangeTr } from "@egemed/gamification-core";
import { buildAchievementsModel, buildLeaderboardModel, defaultGamiIcons, earnedFromServer, GamiAchievementsView, GamiLeaderboardView, GamiProgressPage, GamiServerFrame, gamiLoadingStatus, levelFromServer, serverHasActivity, streakFromServer, type GamiModalEnv, type GamiPageTab, type GamiServerSource, type ServerGamiData } from "@egemed/gami-ui";
import { poolFor } from "../data/pool";
import { sampleSession, SESSION_SIZE } from "../core/session";
import { useStore } from "../core/StoreProvider";
import type { ScoringWeights } from "../core/types";
import { AUSCULTA_BADGES } from "../gamification/catalog";
import { localLeaderboardRows } from "../gamification/leaderboard";
import type { LocalGamiRepository } from "../gamification/repo";
import { AUSCULTA_RULES } from "../gamification/rules";
import { useGamiProgress } from "../gamification/useGami";
import { sessionSeed } from "./entry";
import { Footer } from "../ui/chrome";
import { IconCheckCircle, IconDoc, IconLungs, IconStethoscope, IconWave } from "../ui/icons";
import type { ModalEnv } from "../ui/modal-env";
import { ScreenHeading } from "../ui/ScreenHeading";

const DOMAIN_META: { key: keyof ScoringWeights; label: string; icon: ReactNode }[] = [
  { key: "technique", label: "Oskültasyon tekniği", icon: <IconStethoscope /> },
  { key: "localization", label: "Anatomik lokalizasyon", icon: <IconLungs /> },
  { key: "recognition", label: "Ses tanımlama", icon: <IconWave /> },
  { key: "interpretation", label: "Klinik yorum", icon: <IconDoc /> },
  { key: "diagnosis", label: "Tanı (varsa)", icon: <IconCheckCircle /> },
  { key: "systematic", label: "Sistematik muayene", icon: <IconStethoscope /> },
];

const TONES = ["t-blue", "t-purple", "t-green", "t-amber"] as const;

function avatarOf(id: string, name: string | null) {
  if (!name) return { tone: "t-anon" as const, text: "AÖ" };
  let hash = 7;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : parts[0]?.[0] ?? "";
  return { tone: TONES[hash % TONES.length] ?? "t-blue", text: letters.toLocaleUpperCase("tr-TR") };
}

const goalIcon = (id: WeeklyGoal["id"]) => {
  if (id === "weekly-assessments") return defaultGamiIcons.chart({});
  if (id === "weekly-avg-score") return defaultGamiIcons.checkCircle({ width: 16, height: 16 });
  return defaultGamiIcons.award({ width: 16, height: 16 });
};

function ProgressBody({
  embedded = false,
  repository,
  modalEnv,
  tab,
  onTab,
  server,
  period,
  setPeriod,
  boardPeriod,
  setBoardPeriod,
  cohort,
  setCohort,
  privacy,
  setPrivacy,
}: {
  embedded?: boolean;
  repository: LocalGamiRepository;
  modalEnv?: ModalEnv;
  tab?: GamiPageTab;
  onTab?: (tab: GamiPageTab) => void;
  server: ServerGamiData | null;
  period: AchievementsPeriod;
  setPeriod: (period: AchievementsPeriod) => void;
  boardPeriod: Period;
  setBoardPeriod: (period: Period) => void;
  cohort: CohortFilter;
  setCohort: (cohort: CohortFilter) => void;
  privacy: { public: boolean; displayName: string | null; cohort: Cohort | null };
  setPrivacy: (update: (current: { public: boolean; displayName: string | null; cohort: Cohort | null }) => { public: boolean; displayName: string | null; cohort: Cohort | null }) => void;
}): JSX.Element {
  const { dispatch, now } = useStore();
  const at = new Date(now());
  const progress = useGamiProgress(at, repository);
  const [localTab, setLocalTab] = useState<GamiPageTab>("achievements");
  const activeTab = tab ?? localTab;
  const selectTab = (next: GamiPageTab) => {
    setLocalTab(next);
    onTab?.(next);
  };

  const localWeek = useMemo(
    () => localLeaderboardRows(progress.state.attempts, AUSCULTA_RULES, at, "week", "all", privacy),
    [at, privacy, progress.state.attempts],
  );
  const weekRows = server && activeTab !== "leaderboard" ? server.rows : localWeek;
  const earned = server ? earnedFromServer(AUSCULTA_BADGES, server.summary.badges) : progress.state.earned;
  const achievements = useMemo(() => buildAchievementsModel({
    now: at,
    period,
    attempts: progress.state.attempts,
    rules: AUSCULTA_RULES,
    catalog: AUSCULTA_BADGES,
    stats: progress.state.stats,
    earned,
    badgeContext: { now: at },
    level: server ? levelFromServer(server.summary.xp, server.summary.level, AUSCULTA_RULES) : progress.level,
    streak: server ? streakFromServer(server.summary.streak) : progress.streak,
    goals: progress.goals,
    profile: privacy,
    weekRows,
    domainMeta: DOMAIN_META,
    ...(server ? { activity: serverHasActivity(server.summary, progress.state.attempts.length) } : {}),
  }), [at, earned, period, privacy, progress, server, weekRows]);
  const localBoard = useMemo(
    () => localLeaderboardRows(progress.state.attempts, AUSCULTA_RULES, at, boardPeriod, cohort, privacy),
    [at, boardPeriod, cohort, privacy, progress.state.attempts],
  );
  const rows = server && activeTab === "leaderboard" ? server.rows : localBoard;
  const prevRows = useMemo(() => {
    const prev = new Date(periodRangeTr(boardPeriod, at).start.getTime() - 1);
    return localLeaderboardRows(progress.state.attempts, AUSCULTA_RULES, prev, boardPeriod, cohort, privacy);
  }, [at, boardPeriod, cohort, privacy, progress.state.attempts]);
  const leaderboard = useMemo(() => buildLeaderboardModel({
    now: at,
    clock: at,
    period: boardPeriod,
    cohort,
    rows,
    prevRows: server && activeTab === "leaderboard" ? null : prevRows,
    monthRows: null,
    reward: null,
    boardReady: true,
  }), [activeTab, at, boardPeriod, cohort, prevRows, rows, server]);

  const startAssessment = () => {
    const seed = sessionSeed(now());
    dispatch({
      type: "startSession",
      practiceIds: sampleSession(poolFor("practice"), seed, SESSION_SIZE),
      assessmentIds: sampleSession(poolFor("assessment"), seed + 1, SESSION_SIZE),
      seed,
    });
    dispatch({ type: "startMode", mode: "assessment" });
  };

  return (
    <>
      <div className="screen">
        <GamiProgressPage active={activeTab} demo={server === null} onTab={selectTab} icons={defaultGamiIcons}>
          {activeTab === "achievements" ? (
            <GamiAchievementsView
              title={<ScreenHeading className="results-title-v2">Başarılarım</ScreenHeading>}
              subtitle="Değerlendirme ve uygulama oturumlarından kazandığın ilerleme."
              period={achievements.hasAttempts ? period : null}
              periods={achievements.periods}
              onPeriod={setPeriod}
              congrats={achievements.congrats}
              congratsIcon={defaultGamiIcons.award({ width: 28, height: 28 })}
              hasAttempts={achievements.hasAttempts}
              profile={achievements.profile}
              avatarOf={avatarOf}
              onLeaderboard={() => selectTab("leaderboard")}
              onAssessment={startAssessment}
              points={achievements.points}
              rangeLabel={achievements.rangeLabel}
              goals={achievements.goals}
              goalIcon={goalIcon}
              doneIcon={defaultGamiIcons.check({ width: 16, height: 16 })}
              weekLabel={achievements.weekLabel}
              domains={achievements.domains}
              domainRange={achievements.domainRange}
              badges={achievements.badges}
              categories={achievements.categories}
              onStudy={(key) => {
                dispatch({ type: "setLearnFocus", key });
                dispatch({ type: "startMode", mode: "learn" });
                dispatch({ type: "goto", screen: "learn" });
              }}
              onScrollBadges={() => undefined}
              {...(modalEnv ? { modalEnv: modalEnv as GamiModalEnv } : {})}
              icons={defaultGamiIcons}
            />
          ) : (
            <GamiLeaderboardView
              title={<ScreenHeading className="results-title-v2">Liderlik Tahtası</ScreenHeading>}
              subtitle="Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme)."
              reward={null}
              period={boardPeriod}
              periods={leaderboard.periods}
              onPeriod={setBoardPeriod}
              cohort={cohort}
              cohorts={leaderboard.cohorts}
              onCohort={setCohort}
              periodLabel={leaderboard.periodLabel}
              countdown={leaderboard.countdown}
              status={leaderboard.status}
              onTerms={() => undefined}
              onStatusAction={(action) => {
                if (action === "assess") startAssessment();
              }}
              rankedEmpty={leaderboard.rankedEmpty}
              rows={leaderboard.rows}
              candidates={leaderboard.candidates}
              items={leaderboard.items}
              meDelta={leaderboard.meDelta}
              qualify={leaderboard.qualify}
              onQualify={startAssessment}
              privacy={{ name: privacy.displayName, isPublic: privacy.public, cohort: privacy.cohort }}
              onPrivacy={(patch) => setPrivacy((current) => ({
                public: patch.public ?? current.public,
                displayName: current.displayName,
                cohort: patch.cohort === undefined ? current.cohort : patch.cohort,
              }))}
              winners={[]}
              terms={false}
              onCloseTerms={() => undefined}
              {...(modalEnv ? { modalEnv: modalEnv as GamiModalEnv } : {})}
              avatarOf={avatarOf}
              icons={defaultGamiIcons}
            />
          )}
        </GamiProgressPage>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}

export function ProgressScreen({
  embedded = false,
  repository,
  modalEnv,
  tab,
  onTab,
  gamification,
}: {
  embedded?: boolean;
  repository: LocalGamiRepository;
  modalEnv?: ModalEnv;
  tab?: GamiPageTab;
  onTab?: (tab: GamiPageTab) => void;
  gamification?: GamiServerSource;
}): JSX.Element {
  const [period, setPeriod] = useState<AchievementsPeriod>("last30");
  const [boardPeriod, setBoardPeriod] = useState<Period>("week");
  const [cohort, setCohort] = useState<CohortFilter>("all");
  const [privacy, setPrivacy] = useState<{ public: boolean; displayName: string | null; cohort: Cohort | null }>({
    public: false,
    displayName: null,
    cohort: null,
  });
  const activeTab = tab ?? "achievements";
  const body = (server: ServerGamiData | null) => (
    <ProgressBody
      boardPeriod={boardPeriod}
      cohort={cohort}
      embedded={embedded}
      period={period}
      privacy={privacy}
      repository={repository}
      server={server}
      setBoardPeriod={setBoardPeriod}
      setCohort={setCohort}
      setPeriod={setPeriod}
      setPrivacy={setPrivacy}
      {...(modalEnv ? { modalEnv } : {})}
      {...(tab === undefined ? {} : { tab })}
      {...(onTab === undefined ? {} : { onTab })}
    />
  );
  if (gamification === undefined) return body(null);
  return (
    <GamiServerFrame
      cohort={activeTab === "leaderboard" ? cohort : "all"}
      fallback={gamiLoadingStatus()}
      icon={defaultGamiIcons.info({ height: 16, width: 16 })}
      period={activeTab === "leaderboard" ? boardPeriod : "week"}
      source={gamification}
    >
      {body}
    </GamiServerFrame>
  );
}

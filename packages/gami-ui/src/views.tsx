import { GamiFairPlay } from "./GamiModeJourney";
import type { GamiRewardMarks } from "./model";
import type { ReactNode } from "react";
import type { AchievementsPeriod, BadgeCategory, ChartPoint, Cohort, CohortFilter, GamiLeaderboardRow, MonthlyReward, Period, RewardWinner, WeeklyGoal } from "@egemed/gamification-core";
import { GamiBadgeGrid, GamiRecentBadges } from "./GamiBadge";
import { GamiDemoBanner } from "./GamiDemoBanner";
import { GamiDomainPanel } from "./GamiDomainPanel";
import { GamiEmptyCard } from "./GamiEmptyCard";
import { GamiLeaderboardTable, GamiPodium, GamiPrivacyCard, GamiRewardBanner, GamiRewardHistory, GamiRewardTerms } from "./GamiLeaderboard";
import { GamiPageTabs, type GamiPageTab } from "./GamiPageTabs";
import { GamiProfileStrip } from "./GamiProfileStrip";
import { GamiProgressChart } from "./GamiProgressChart";
import { GamiSeg } from "./GamiSeg";
import { GamiWeeklyGoals } from "./GamiWeeklyGoals";
import type { GamiFocusable, GamiModalEnv } from "./modal";
import type { GamiAvatarOf, GamiBadgeModel, GamiCongrats, GamiDomainItem, GamiIcons, GamiMeStatus, GamiProfileModel, GamiTableItem } from "./types";

export function GamiProgressPage({ active, onTab, icons, demoIcon, demo = true, children }: {
  active: GamiPageTab;
  onTab: (id: GamiPageTab) => void;
  icons: Pick<GamiIcons, "award" | "chart" | "info">;
  demoIcon?: ReactNode;
  /** API oturumunda sunucu verisi varken bant gizlenir. */
  demo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="results-wrap-v2 eg-gami-page">
      {demo ? <GamiDemoBanner icon={demoIcon ?? icons.info({ width: 16, height: 16 })} /> : null}
      <GamiPageTabs
        active={active}
        onChange={onTab}
        icons={{ achievements: icons.award({ width: 16, height: 16 }), leaderboard: icons.chart({}) }}
      />
      {/* Adil oyun kuralı (depo sahibi kararı 30 Eyl 2026): rozet ve liderlik alanlarında net uyarı. */}
      <GamiFairPlay icon={icons.info({ width: 14, height: 14 })} />
      {children}
    </div>
  );
}

export function GamiAchievementsView({
  title,
  subtitle,
  period,
  periods,
  onPeriod,
  congrats,
  congratsIcon,
  hasAttempts,
  profile,
  avatarOf,
  onLeaderboard,
  onAssessment,
  points,
  rangeLabel,
  goals,
  goalIcon,
  doneIcon,
  weekLabel,
  domains,
  domainRange,
  badges,
  categories,
  onStudy,
  onScrollBadges,
  modalEnv,
  icons,
  badgeCount,
}: {
  title: ReactNode;
  subtitle: string;
  period: AchievementsPeriod | null;
  periods: { id: AchievementsPeriod; label: string }[];
  onPeriod: (id: AchievementsPeriod) => void;
  congrats: GamiCongrats | null;
  congratsIcon: ReactNode;
  hasAttempts: boolean;
  profile: GamiProfileModel | null;
  avatarOf: GamiAvatarOf;
  onLeaderboard: () => void;
  onAssessment: () => void;
  points: ChartPoint[];
  rangeLabel: string;
  goals: readonly WeeklyGoal[] | null;
  goalIcon: (id: WeeklyGoal["id"]) => ReactNode;
  doneIcon: ReactNode;
  weekLabel: string;
  domains: GamiDomainItem[];
  domainRange: string;
  badges: GamiBadgeModel[];
  categories: { id: BadgeCategory; label: string }[];
  onStudy: (key: string) => void;
  onScrollBadges: () => void;
  modalEnv?: GamiModalEnv;
  icons: GamiIcons;
  badgeCount?: number;
}) {
  return (
    <>
      {congrats && (
        <div className="card eg-gami-congrats" role="status">
          <span className="eg-gami-badge-ic" aria-hidden="true">{congratsIcon}</span>
          <div>
            <b>{congrats.monthName} ödülünü kazandın!</b>
            <span>{congrats.title} — {congrats.sponsor} seninle fakülte e-postandan iletişime geçecek.</span>
          </div>
        </div>
      )}
      <div className="results-title-row">
        <div>
          {title}
          <p className="results-sub-v2">{subtitle}</p>
        </div>
        {hasAttempts && period && (
          <select className="eg-gami-select" aria-label="Dönem" value={period} onChange={(e) => onPeriod(e.target.value as AchievementsPeriod)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
      </div>
      {hasAttempts && profile ? (
        <GamiProfileStrip
          profile={profile}
          avatarOf={avatarOf}
          onLeaderboard={onLeaderboard}
          icons={{
            flame: icons.flame({ width: 20, height: 20 }),
            check: icons.checkCircle({ width: 16, height: 16 }),
            chevron: icons.chevronRight({ width: 14, height: 14 }),
          }}
        />
      ) : (
        <GamiEmptyCard onAssessment={onAssessment} icons={icons} badgeCount={badgeCount ?? badges.length} />
      )}
      {hasAttempts && (
        <div className="eg-gami-grid">
          <section className="card eg-gami-span-8" aria-labelledby="gami-progress-t">
            <div className="eg-gami-card-head"><h3 id="gami-progress-t">İlerleme</h3><span className="eg-gami-range">{rangeLabel}</span></div>
            <GamiProgressChart points={points} rangeLabel={rangeLabel} />
          </section>
          <section className="card eg-gami-span-4" aria-labelledby="gami-goals-t">
            <div className="eg-gami-card-head"><h3 id="gami-goals-t">Bu haftanın hedefleri</h3><span className="eg-gami-range">{weekLabel}</span></div>
            {goals && <GamiWeeklyGoals goals={goals} iconFor={goalIcon} doneIcon={doneIcon} />}
          </section>
          <section className="card eg-gami-span-6" aria-labelledby="gami-domains-t">
            <div className="eg-gami-card-head"><h3 id="gami-domains-t">Alan bazlı performans</h3><span className="eg-gami-range">{domainRange}</span></div>
            <GamiDomainPanel items={domains} />
          </section>
          <section className="card eg-gami-span-6" aria-labelledby="gami-recent-t">
            <div className="eg-gami-card-head"><h3 id="gami-recent-t">Son kazanılan rozetler</h3></div>
            <GamiRecentBadges views={badges} onAll={onScrollBadges} onStudy={onStudy} icons={icons} {...(modalEnv ? { env: modalEnv } : {})} />
          </section>
        </div>
      )}
      <GamiBadgeGrid id="gami-badges" views={badges} categories={categories} onStudy={onStudy} icons={icons} {...(modalEnv ? { env: modalEnv } : {})} />
    </>
  );
}

export function GamiLeaderboardView({
  title,
  subtitle,
  reward,
  period,
  periods,
  onPeriod,
  cohort,
  cohorts,
  onCohort,
  periodLabel,
  countdown,
  status,
  onTerms,
  onStatusAction,
  rankedEmpty,
  rows,
  candidates,
  items,
  meDelta,
  qualify,
  onQualify,
  privacy,
  onPrivacy,
  winners,
  terms,
  onCloseTerms,
  modalEnv,
  avatarOf,
  icons,
}: {
  title: ReactNode;
  subtitle: string;
  reward: MonthlyReward | null;
  period: Period;
  periods: { id: Period; label: string }[];
  onPeriod: (id: Period) => void;
  cohort: CohortFilter;
  cohorts: { id: CohortFilter; label: string }[];
  onCohort: (id: CohortFilter) => void;
  periodLabel: string;
  countdown: string;
  status: GamiMeStatus | null;
  onTerms: (el: GamiFocusable) => void;
  onStatusAction: (a: NonNullable<GamiMeStatus["action"]>) => void;
  rankedEmpty: boolean;
  rows: readonly GamiLeaderboardRow[];
  candidates: GamiRewardMarks | null;
  items: GamiTableItem[];
  meDelta: number | null;
  qualify: { left: number } | null;
  onQualify: () => void;
  privacy: { name: string | null; isPublic: boolean; cohort: Cohort | null };
  onPrivacy: (patch: { public?: boolean; cohort?: Cohort | null }) => void;
  winners: RewardWinner[];
  terms: GamiFocusable | null | false;
  onCloseTerms: () => void;
  modalEnv?: GamiModalEnv;
  avatarOf: GamiAvatarOf;
  icons: GamiIcons;
}) {
  const showPodium = rows.filter((r) => r.rank !== null).length >= 3;
  return (
    <>
      <div className="results-title-row">
        <div>
          {title}
          <p className="results-sub-v2">{subtitle}</p>
        </div>
      </div>
      {reward && (
        <GamiRewardBanner
          reward={reward}
          compact={period !== "month"}
          countdown={countdown}
          status={status}
          onTerms={onTerms}
          onMonthly={() => onPeriod("month")}
          onStatusAction={onStatusAction}
          icons={icons}
        />
      )}
      <div className="eg-gami-period-row">
        <GamiSeg options={periods} value={period} onChange={onPeriod} label="Dönem" variant="tabs" purple />
        <select className="eg-gami-select" aria-label="Kohort" value={String(cohort)} onChange={(e) => onCohort(e.target.value === "all" ? "all" : Number(e.target.value) as CohortFilter)}>
          {cohorts.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.label}</option>)}
        </select>
        <span className="eg-gami-range">{periodLabel}</span>
      </div>
      {rankedEmpty && <div className="card"><p className="eg-gami-note" style={{ margin: 0 }}>Bu dönemde henüz sıralamaya giren yok.</p></div>}
      {showPodium && <GamiPodium rows={rows} candidates={candidates} avatarOf={avatarOf} />}
      {items.length > 0 && (
        <div className="card">
          <GamiLeaderboardTable items={items} candidates={candidates} meDelta={meDelta} avatarOf={avatarOf} deltaIcon={icons.arrowUp({ width: 12, height: 12 })} />
          <p className="eg-gami-note">Puan: dönemdeki en iyi 3 değerlendirmenin ortalaması · sıralamaya girmek için en az 2 deneme.</p>
        </div>
      )}
      {qualify && (
        <div className="eg-gami-qualify">
          <span className="badge gray">Sıralamaya girmek için bu dönem {qualify.left} değerlendirme daha tamamla</span>
          <button className="btn purple small" type="button" onClick={onQualify}>Değerlendirmeye gir {icons.arrowRight({ width: 14, height: 14 })}</button>
        </div>
      )}
      <GamiPrivacyCard
        id="gami-privacy"
        name={privacy.name}
        isPublic={privacy.isPublic}
        cohort={privacy.cohort}
        onChange={onPrivacy}
        lockIcon={icons.lock({ width: 22, height: 22 })}
      />
      <GamiRewardHistory winners={winners} chevron={icons.chevronRight({ width: 16, height: 16 })} />
      {terms !== false && reward && (
        <GamiRewardTerms reward={reward} returnTo={terms} onClose={onCloseTerms} closeIcon={icons.close({})} {...(modalEnv ? { env: modalEnv } : {})} />
      )}
    </>
  );
}

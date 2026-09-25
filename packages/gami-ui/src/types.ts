import type { JSX, ReactNode } from "react";
import type { BadgeCategory, ChartPoint, Cohort, GamiLeaderboardRow, MonthlyReward, Period, RewardWinner, WeeklyGoal } from "@egemed/gamification-core";

export interface GamiIconProps {
  width?: number;
  height?: number;
}

export type GamiIcon = (props: GamiIconProps) => JSX.Element;

/** Sim ikonları paket dışında üretilir. */
export interface GamiIcons {
  award: GamiIcon;
  chart: GamiIcon;
  check: GamiIcon;
  checkCircle: GamiIcon;
  chevronRight: GamiIcon;
  flame: GamiIcon;
  arrowRight: GamiIcon;
  star: GamiIcon;
  target: GamiIcon;
  info: GamiIcon;
  close: GamiIcon;
  lock: GamiIcon;
  gift: GamiIcon;
  clock: GamiIcon;
  arrowUp: GamiIcon;
  book: GamiIcon;
  badge: (name: string, size: number) => JSX.Element | null;
}

export type GamiAvatarTone = "t-blue" | "t-purple" | "t-green" | "t-amber" | "t-anon";

export interface GamiAvatarModel {
  tone: GamiAvatarTone;
  text: string;
}

export type GamiAvatarOf = (id: string, name: string | null) => GamiAvatarModel;

export interface GamiBadgeModel {
  id: string;
  name: string;
  tier: "bronze" | "silver" | "gold" | null;
  tierLabel: string | null;
  description: string;
  category: BadgeCategory;
  categoryLabel: string;
  state: "earned" | "progress" | "locked";
  value: number;
  max: number;
  earnedLabel: string | null;
  rule: string;
  studyKey: string | null;
  iconName: string;
  /** Kilitli özel not (ör. podyum). Yoksa ilerleme çubuğu. */
  lockedNote: string | null;
  assessmentOnly: boolean;
}

export interface GamiProfileModel {
  level: number;
  xpInto: number;
  xpSpan: number;
  xpToNext: number;
  avatarId: string;
  avatarName: string | null;
  streakCurrent: number;
  streakLongest: number;
  periodAssessments: number;
  periodPractice: number;
  periodAvg: number | null;
  periodLabel: string;
  weekRank: number | null;
  weekRanked: number;
}

export interface GamiDomainItem {
  key: string;
  label: string;
  icon: ReactNode;
  pct: number;
  weak: boolean;
}

export interface GamiMeStatus {
  tone: "green" | "purple" | "gray";
  text: string;
  action?: "privacy" | "assess";
}

export type GamiTableItem =
  | { kind: "row"; row: GamiLeaderboardRow }
  | { kind: "gap" };

export interface GamiGainsModel {
  badge: GamiBadgeModel | null;
  badgeFresh: boolean;
  xp: number;
  bonus: number;
  level: number;
  xpInto: number;
  xpSpan: number;
  xpToNext: number;
  rank: { period: Period; rank: number | null; delta: number | null; of: number } | null;
  confetti: boolean;
}

export interface GamiCongrats {
  monthName: string;
  title: string;
  sponsor: string;
}

export type { ChartPoint, Cohort, GamiLeaderboardRow, MonthlyReward, Period, RewardWinner, WeeklyGoal };

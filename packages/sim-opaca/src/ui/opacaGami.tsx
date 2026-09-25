import type { ReactElement } from "react";
import { BADGE_CATEGORY_LABEL, BADGE_TIER_LABEL, trDate, type BadgeCategory, type BadgeView } from "@egemed/gamification-core";
import type { GamiAvatarOf, GamiBadgeModel, GamiIcons } from "@egemed/gami-ui";
import { avatarTone } from "../gamification/avatar";
import type { OpacaBadgeContext } from "../gamification/catalog";
import { initials } from "../gamification/repo";
import type { OpacaStats } from "../gamification/stats";
import {
  IconArrowRight,
  IconArrowUp,
  IconAward,
  IconBook,
  IconChart,
  IconCheck,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconClose,
  IconFlame,
  IconGift,
  IconInfo,
  IconLock,
  IconStar,
  IconTarget,
} from "./icons";
import * as Icons from "./icons";

type OpacaBadgeView = BadgeView<OpacaStats, OpacaBadgeContext>;

const icon = (C: (p: { width?: number; height?: number }) => ReactElement) =>
  (p: { width?: number; height?: number }) => <C {...p} />;

function badgeIcon(name: string, size: number) {
  const C = (Icons as Record<string, ((p: { width?: number; height?: number }) => ReactElement) | undefined>)[`Icon${name}`];
  return C ? <C width={size} height={size} /> : null;
}

export const opacaGamiIcons: GamiIcons = {
  award: icon(IconAward),
  chart: () => <IconChart />,
  check: icon(IconCheck),
  checkCircle: icon(IconCheckCircle),
  chevronRight: icon(IconChevronRight),
  flame: icon(IconFlame),
  arrowRight: icon(IconArrowRight),
  star: icon(IconStar),
  target: icon(IconTarget),
  info: icon(IconInfo),
  close: icon(IconClose),
  lock: icon(IconLock),
  gift: icon(IconGift),
  clock: icon(IconClock),
  arrowUp: icon(IconArrowUp),
  book: icon(IconBook),
  badge: badgeIcon,
};

export const opacaAvatarOf: GamiAvatarOf = (id, name) => ({
  tone: avatarTone(id, !name),
  text: name ? initials(name) : "AÖ",
});

export function toGamiBadge(v: OpacaBadgeView): GamiBadgeModel {
  return {
    id: v.def.id,
    name: v.def.name,
    tier: v.def.tier ?? null,
    tierLabel: v.def.tier ? BADGE_TIER_LABEL[v.def.tier] : null,
    description: v.def.description,
    category: v.def.category,
    categoryLabel: BADGE_CATEGORY_LABEL[v.def.category],
    state: v.state,
    value: v.value,
    max: v.max,
    earnedLabel: v.earnedAt ? trDate(v.earnedAt) : null,
    rule: v.rule,
    studyKey: v.studyKey,
    iconName: v.def.icon ?? "Star",
    lockedNote: v.def.id === "podium" ? "Sunucu bağlantısı gelince kazanılabilir (şu an demo sıralama)." : null,
    assessmentOnly: v.def.category === "topic" || v.def.category === "skill",
  };
}

export const OPACA_BADGE_CATEGORIES = (Object.keys(BADGE_CATEGORY_LABEL) as BadgeCategory[]).map((id) => ({
  id,
  label: BADGE_CATEGORY_LABEL[id],
}));

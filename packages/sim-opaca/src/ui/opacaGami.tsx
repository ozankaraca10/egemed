import { BADGE_CATEGORY_LABEL, BADGE_TIER_LABEL, trDate, type BadgeView } from "@egemed/gamification-core";
import { defaultGamiIcons, type GamiAvatarOf, type GamiBadgeModel } from "@egemed/gami-ui";
import { avatarTone } from "../gamification/avatar";
import type { OpacaBadgeContext } from "../gamification/catalog";
import { initials } from "../gamification/repo";
import type { OpacaStats } from "../gamification/stats";

type OpacaBadgeView = BadgeView<OpacaStats, OpacaBadgeContext>;

export const opacaGamiIcons = defaultGamiIcons;

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

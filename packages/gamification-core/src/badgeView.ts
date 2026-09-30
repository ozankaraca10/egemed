/** EGEMED — rozet görünüm modeli: katalog + durum + kazanılmışlar → kart durumu.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/badgeView.ts.
 *  Opaca'ya özgü kısa koşul/çalışma anahtarı eşlemeleri (RULE, STUDY_KEY) çekirdeğe girmez;
 *  kısa koşul ve çalışma anahtarı katalog tanımından (`rule`, `studyKey`) gelir.
 *  Kategori/tier RENKLERİ tasarım sistemi kararıdır (packages/tokens); burada yalnız etiketler var.
 *  Not: kaynaktaki belirli bir kimliğe özel "ilerleme gösterme" kilidi, jenerik karşılığında
 *  asla kazanılamayan tanımın ilerlemesinin 0 dönmesiyle sağlanır (kaynak katalogda da böyledir). */

import { badgeProgress, capstoneRequiredBadges, type BadgeCategory, type BadgeContext, type BadgeDef, type BadgeTier } from "./badges";
import type { EarnedBadge } from "./types";

export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  topic: "Konu",
  skill: "Beceri",
  streak: "Seri",
  learn: "Öğrenme",
  milestone: "Kilometre taşı",
  challenge: "Meydan Okuma",
};

export const BADGE_TIER_LABEL: Record<BadgeTier, string> = {
  bronze: "Bronz",
  silver: "Gümüş",
  gold: "Altın",
};

export type BadgeState = "earned" | "progress" | "locked";

export interface BadgeView<TState, TContext extends BadgeContext = BadgeContext> {
  def: BadgeDef<TState, TContext>;
  state: BadgeState;
  value: number;
  max: number;
  earnedAt: string | null;
  rule: string;
  studyKey: string | null;
}

export function badgeViews<TState, TContext extends BadgeContext>(
  catalog: readonly BadgeDef<TState, TContext>[],
  state: TState,
  earned: readonly EarnedBadge[],
  ctx: TContext,
): BadgeView<TState, TContext>[] {
  const earnedAtById = new Map(earned.map((e) => [e.id, e.at]));
  const requiredIds = capstoneRequiredBadges(catalog).map((def) => def.id);
  const earnedRequiredCount = requiredIds.filter((id) => earnedAtById.has(id)).length;
  return catalog.map((def) => {
    const earnedAt = earnedAtById.get(def.id) ?? null;
    if (def.capstone) {
      const value = Math.min(earnedRequiredCount, requiredIds.length);
      const capstoneState: BadgeState = earnedAt ? "earned" : value > 0 ? "progress" : "locked";
      return { def, state: capstoneState, value, max: requiredIds.length, earnedAt, rule: def.rule ?? "", studyKey: def.studyKey ?? null };
    }
    const { value, max } = badgeProgress(def, state, ctx);
    const badgeState: BadgeState = earnedAt ? "earned" : value > 0 ? "progress" : "locked";
    return {
      def,
      state: badgeState,
      value: Math.min(value, max),
      max,
      earnedAt,
      rule: def.rule ?? "",
      studyKey: def.studyKey ?? null,
    };
  });
}

/** Kazanılanlar en yeni önce, sonra devam edenler (ilerleme oranına göre), sonra kilitliler
 *  (tanım sırası — stabil sıralama). */
export function sortBadgeViews<TState, TContext extends BadgeContext>(
  views: readonly BadgeView<TState, TContext>[],
): BadgeView<TState, TContext>[] {
  const rank: Record<BadgeState, number> = { earned: 0, progress: 1, locked: 2 };
  const ratio = (v: BadgeView<TState, TContext>): number => (v.max > 0 ? Math.min(v.value, v.max) / v.max : 0);
  return [...views].sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.state === "earned" ? (b.earnedAt ?? "").localeCompare(a.earnedAt ?? "") : 0) ||
      (a.state === "progress" ? ratio(b) - ratio(a) : 0),
  );
}

const BADGE_TIER_RANK: Record<BadgeTier, number> = { bronze: 0, silver: 1, gold: 2 };

/** Kolaydan zora: önce kademe (bronz < gümüş < altın; kademesiz rozetler bronz sayılır),
 *  sonra eşik değeri (max) artan; eşitlikte
 *  katalog sırası (stabil sıralama — girdi zaten katalog sırasındadır); capstone her zaman en sonda.
 *  Durumdan (kazanılmış/ilerleyen/kilitli) bağımsızdır; rozet koleksiyonu
 *  ızgarasının sabit sıralaması içindir. */
export function sortBadgesByDifficulty<TState, TContext extends BadgeContext>(
  views: readonly BadgeView<TState, TContext>[],
): BadgeView<TState, TContext>[] {
  const stage = (v: BadgeView<TState, TContext>): number => (v.def.tier ? BADGE_TIER_RANK[v.def.tier] : 0);
  const capstoneRank = (v: BadgeView<TState, TContext>): number => (v.def.capstone ? 1 : 0);
  return [...views].sort((a, b) => capstoneRank(a) - capstoneRank(b) || stage(a) - stage(b) || a.max - b.max);
}

/**
 * Sunucu rozet değerlendirmesi için sim kayıt defteri (ADR-008). Her sim
 * kataloğunu ve kodlu özetten istatistik türetimini tipli bir kapanışta
 * bağlar; API yalnız bu arayüzü kullanır, sim paketlerine bağımlı olmaz.
 */
import { evaluateBadges } from "@egemed/gamification-core";
import type { BadgeDef } from "@egemed/gamification-core";
import { PULSE_BADGES, pulseStatsFromSummaries } from "./pulse";
import { OPACA_BADGES, opacaStatsFromSummaries } from "./opaca";

export type GamiCatalogSimId = "pulse" | "ausculta" | "opaca";

export type CodedSummary = Readonly<Record<string, number>>;

export interface SimBadgeEvaluator {
  /** Katalogdaki tüm rozet anahtarları (okuma/doğrulama için). */
  readonly badgeIds: readonly string[];
  /** Özetlerden istatistik türetir; `earnedIds` dışındaki yeni kazanılanları döner. */
  newlyEarned(summaries: readonly CodedSummary[], earnedIds: readonly string[], now: Date): readonly string[];
}

export function createSimBadgeEvaluator<TStats>(
  catalog: readonly BadgeDef<TStats>[],
  statsFromSummaries: (summaries: readonly CodedSummary[]) => TStats,
): SimBadgeEvaluator {
  return {
    badgeIds: catalog.map((def) => def.id),
    newlyEarned(summaries, earnedIds, now) {
      const previous = earnedIds.map((id) => ({ id, at: now.toISOString() }));
      return evaluateBadges(catalog, statsFromSummaries(summaries), previous, { now }).map((badge) => badge.id);
    },
  };
}

/** Rozet değerlendirmesi yalnız kaydı olan simler için yapılır (S2: Ausculta eklenecek). */
export const SIM_BADGE_EVALUATORS: Partial<Record<GamiCatalogSimId, SimBadgeEvaluator>> = {
  pulse: createSimBadgeEvaluator(PULSE_BADGES, pulseStatsFromSummaries),
  opaca: createSimBadgeEvaluator(OPACA_BADGES, opacaStatsFromSummaries),
};

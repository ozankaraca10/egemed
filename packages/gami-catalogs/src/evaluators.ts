/**
 * Sunucu rozet değerlendirmesi için sim kayıt defteri (ADR-008). Her sim
 * kataloğunu ve kodlu özetten istatistik türetimini tipli bir kapanışta
 * bağlar; API yalnız bu arayüzü kullanır, sim paketlerine bağımlı olmaz.
 */
import { evaluateBadges } from "@egemed/gamification-core";
import type { BadgeDef } from "@egemed/gamification-core";
import { PULSE_BADGES, pulseStatsFromSummaries } from "./pulse";
import { OPACA_BADGES, opacaStatsFromSummaries } from "./opaca";
import { AUSCULTA_BADGES, auscultaStatsFromSummaries } from "./ausculta";

export type GamiCatalogSimId = "pulse" | "ausculta" | "opaca";

export type CodedSummary = Readonly<Record<string, number>>;

/**
 * T235: `gami_learn` kayıtlarından türetilen öğrenme sayaçları. Deneme özetinde
 * kod olarak yoktur; değerlendirmeye canlı durumdan girer (yalnız Opaca okur).
 */
export interface SimLearnCounters {
  /** Farklı `opaca:topic:*` sayısı. */
  readonly topicsCount: number;
  /** Farklı `opaca:stack:*` sayısı. */
  readonly stacksCount: number;
}

export interface SimBadgeEvaluator {
  /** Katalogdaki tüm rozet anahtarları (okuma/doğrulama için). */
  readonly badgeIds: readonly string[];
  /** Özetlerden istatistik türetir; `earnedIds` dışındaki yeni kazanılanları döner. */
  newlyEarned(
    summaries: readonly CodedSummary[],
    earnedIds: readonly string[],
    now: Date,
    learn?: SimLearnCounters,
  ): readonly string[];
}

export function createSimBadgeEvaluator<TStats>(
  catalog: readonly BadgeDef<TStats>[],
  statsFromSummaries: (summaries: readonly CodedSummary[], learn?: SimLearnCounters) => TStats,
): SimBadgeEvaluator {
  return {
    badgeIds: catalog.map((def) => def.id),
    newlyEarned(summaries, earnedIds, now, learn) {
      const previous = earnedIds.map((id) => ({ id, at: now.toISOString() }));
      return evaluateBadges(catalog, statsFromSummaries(summaries, learn), previous, { now }).map((badge) => badge.id);
    },
  };
}

/** Rozet değerlendirmesi yalnız kaydı olan simler için yapılır (ADR-008 S2: üç sim kayıtlı). */
export const SIM_BADGE_EVALUATORS: Partial<Record<GamiCatalogSimId, SimBadgeEvaluator>> = {
  pulse: createSimBadgeEvaluator(PULSE_BADGES, pulseStatsFromSummaries),
  ausculta: createSimBadgeEvaluator(AUSCULTA_BADGES, auscultaStatsFromSummaries),
  opaca: createSimBadgeEvaluator(OPACA_BADGES, opacaStatsFromSummaries),
};

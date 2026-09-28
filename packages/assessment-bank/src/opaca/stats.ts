import type { SimCaseResult } from "@egemed/contracts";
import findingsJson from "../../../sim-opaca/src/data/findings.json" with { type: "json" };
import type { CaseDef, Mode } from "./types";

/**
 * Sunucu tarafı Opaca rozet istatistiği (T235). Kaynak mantık:
 * packages/sim-opaca/src/gamification/stats.ts `computeStats` (istemci; A4'te
 * puanlı deneme yolu kapandı). Çıktı `@egemed/gami-catalogs`
 * `encodeOpacaSummary` girdisiyle yapısal olarak aynıdır (ADR-008).
 */

const FINDINGS = (findingsJson as { readonly findings: Readonly<Record<string, { readonly group: string }>> }).findings;

/** Rozet konu eşlemesi — sim `TOPIC_BADGE_MATCH` ile birebir aynı (test eşitliği doğrular). */
export const OPACA_TOPIC_MATCH: Record<string, (findingId: string) => boolean> = {
  pleura: (id) => FINDINGS[id]?.group === "pleura",
  cardiac: (id) => FINDINGS[id]?.group === "cardiac",
  nodule: (id) => id === "nodule_mass",
  tb: (id) => FINDINGS[id]?.group === "infection",
  pediatric: (id) => FINDINGS[id]?.group === "pediatric",
  diaphragm: (id) => FINDINGS[id]?.group === "diaphragm",
  bone: (id) => FINDINGS[id]?.group === "bone" && id.endsWith("fracture"),
  vascular: (id) => FINDINGS[id]?.group === "vascular",
};

/** Kodlu özete giren oturum istatistiği (serbest metin yok). */
export interface OpacaSessionStats {
  localizationHits: number;
  abcdeComplete: number;
  qualityCorrect: number;
  interpretationCorrect: number;
  fastPerfect: boolean;
  /** Konu başına doğru bulgu sayısı; yalnız değerlendirmede doldurulur. */
  topicCorrect: Record<string, number>;
}

/** Bir oturumun tamamlanan vakalarından istatistik; istemciden hiçbir sayı alınmaz. */
export function opacaSessionStats(
  items: readonly {
    readonly caseDef: CaseDef;
    readonly result: SimCaseResult;
  }[],
  session: { readonly mode: Mode; readonly score: number; readonly durationMs: number },
): OpacaSessionStats {
  let localizationHits = 0;
  let abcdeComplete = 0;
  let qualityCorrect = 0;
  let interpretationCorrect = 0;
  let limitMs = 0;
  const topicCorrect: Record<string, number> = {};
  for (const { caseDef, result } of items) {
    const byQid = new Map(result.questions.map((question) => [question.questionId, question.correct]));
    const systematic = result.domains.systematic;
    if (systematic !== undefined && systematic.max > 0 && systematic.earned >= systematic.max) abcdeComplete += 1;
    limitMs += (caseDef.timeLimitSec ?? 0) * 1000;
    for (const question of caseDef.questions) {
      if (byQid.get(question.id) !== true) continue;
      if (question.type === "localization") localizationHits += 1;
      if (question.type === "film_quality") qualityCorrect += 1;
      if (question.type === "interpretation") interpretationCorrect += 1;
    }
    // Konu doğruluğu yalnız değerlendirmede sayılır (istemci `computeStats` kuralı).
    if (session.mode !== "assessment") continue;
    const identified = caseDef.questions.find((question) => question.type === "finding_identify");
    if (identified === undefined || byQid.get(identified.id) !== true) continue;
    for (const [topicId, match] of Object.entries(OPACA_TOPIC_MATCH)) {
      if (match(caseDef.primaryFinding)) topicCorrect[topicId] = (topicCorrect[topicId] ?? 0) + 1;
    }
  }
  return {
    localizationHits,
    abcdeComplete,
    qualityCorrect,
    interpretationCorrect,
    fastPerfect: session.mode === "assessment" && session.score >= 90 && limitMs > 0 && session.durationMs <= limitMs / 2,
    topicCorrect,
  };
}

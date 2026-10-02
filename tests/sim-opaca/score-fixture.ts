import { scoreCase as bankScoreCase } from "../../packages/assessment-bank/src/opaca/scoring";
import type * as Bank from "../../packages/assessment-bank/src/opaca/types";
import type { AppState, CaseDef, CaseResult, ImageRecord, ReadingZone, Telemetry } from "../../packages/sim-opaca/src/index";
import { reducer } from "../../packages/sim-opaca/src/index";

/**
 * YALNIZ TEST (T316, ADR-009): istemci vaka puanlamaz. Sonuç ekranı, en iyi puan ve askıya alma
 * testleri gerçekçi `CaseResult` için sunucunun (bankanın) puanlamasını kullanır. İstemci ve banka
 * tipleri yapısal olarak aynıdır; dönüşüm yalnız burada yapılır.
 */
export function scoredResult(
  caseDef: CaseDef,
  answers: Record<string, string[]>,
  telemetry: Telemetry,
  hintsUsed: number,
  image: ImageRecord | undefined,
  zones: ReadingZone[],
): CaseResult {
  return bankScoreCase(
    caseDef as unknown as Bank.CaseDef,
    answers,
    telemetry as unknown as Bank.Telemetry,
    hintsUsed,
    image as unknown as Bank.ImageRecord | undefined,
    zones as unknown as Bank.ReadingZone[],
  ) as unknown as CaseResult;
}

/** Sunucu oturumunu bitirir: sonuçlar `serverFinished` ile gelir (eski yerel `setResults` yerine). */
export function finishWithServerResults(state: AppState, mode: "practice" | "assessment", results: CaseResult[]): AppState {
  const seam = { emit: () => undefined };
  const started = reducer({ ...state, mode }, { type: "serverStarted", sessionId: `test-${mode}`, mode, caseCount: results.length, perCaseLimitMs: null }, seam);
  return reducer(started, { type: "serverFinished", results, metas: {} }, seam);
}

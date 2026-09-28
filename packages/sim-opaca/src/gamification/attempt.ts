/** EGEMED Opaca — tamamlanan oturum → AttemptRecord (çekirdek tip + Opaca extra). */

import type { AttemptRecord, GamiMode } from "@egemed/gamification-core";
import type { CaseDef, CaseResult, ScoringWeights } from "../core/types";
import { aggregateResults } from "../core/scoring";

export type DomainKey = keyof ScoringWeights;

export interface OpacaFindingResult {
  finding: string;
  correct: boolean;
}

export interface OpacaExtra {
  findings: OpacaFindingResult[];
  localizationHits: number;
  abcdeComplete: number;
  qualityCorrect: number;
  interpretationCorrect: number;
  fastPerfect: boolean;
}

export type OpacaAttemptRecord = AttemptRecord<DomainKey, OpacaExtra>;

/** Öğrenme modu BT yığınları — LearnActivity.items anahtarı. */
export const CT_STACKS_ITEM_KEY = "ctStacks";

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface AttemptInput {
  mode: GamiMode;
  results: CaseResult[];
  caseById: (id: string) => CaseDef | undefined;
  sessionSeed: number;
  durationMs: number;
  finishedAt: Date;
}

export function attemptId(mode: GamiMode, seed: number, caseIds: string[]): string {
  return `${mode}-${seed}-${hash(caseIds.join("|"))}`;
}

export function buildAttemptRecord(inp: AttemptInput): OpacaAttemptRecord | null {
  if (inp.results.length === 0) return null;
  const agg = aggregateResults(inp.results);
  const domains: Partial<Record<DomainKey, number>> = {};
  for (const k of Object.keys(agg.domains) as DomainKey[]) {
    const d = agg.domains[k];
    if (d && d.max > 0) domains[k] = Math.round((d.earned / d.max) * 100);
  }
  let localizationHits = 0;
  let qualityCorrect = 0;
  let interpretationCorrect = 0;
  let abcdeComplete = 0;
  let limitMs = 0;
  const findings: OpacaFindingResult[] = [];
  for (const r of inp.results) {
    const def = inp.caseById(r.caseId);
    const byQid = new Map(r.answers.map((a) => [a.qid, a.correct]));
    const sys = r.domains.systematic;
    if (sys && sys.max > 0 && sys.earned >= sys.max) abcdeComplete++;
    if (!def) continue;
    limitMs += (def.timeLimitSec ?? 0) * 1000;
    for (const q of def.questions) {
      const ok = byQid.get(q.id) === true;
      if (q.type === "localization" && ok) localizationHits++;
      if (q.type === "film_quality" && ok) qualityCorrect++;
      if (q.type === "interpretation" && ok) interpretationCorrect++;
    }
    const fi = def.questions.find((q) => q.type === "finding_identify");
    if (fi && def.primaryFinding) findings.push({ finding: def.primaryFinding, correct: byQid.get(fi.id) === true });
  }
  return {
    id: attemptId(inp.mode, inp.sessionSeed, inp.results.map((r) => r.caseId)),
    mode: inp.mode,
    finishedAt: inp.finishedAt.toISOString(),
    score: agg.total,
    mastery: agg.mastery,
    caseCount: inp.results.length,
    hintsUsed: inp.results.reduce((n, r) => n + r.hintsUsed, 0),
    durationMs: inp.durationMs,
    domains,
    extra: {
      findings,
      localizationHits,
      abcdeComplete,
      qualityCorrect,
      interpretationCorrect,
      fastPerfect:
        inp.mode === "assessment" && agg.total >= 90 && limitMs > 0 && inp.durationMs <= limitMs / 2,
    },
  };
}

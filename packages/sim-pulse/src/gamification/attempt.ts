/** EGEMED Pulse — tamamlanan EKG oturumu → ortak AttemptRecord sözleşmesi. */

import type { AttemptRecord, GamiMode } from "@egemed/gamification-core";
import { LEADS } from "../engine/shapes";
import type { Lead, Mode } from "../engine/shapes";

export type PulseDomain = "rhythmRecognition" | "leadReading" | "intervalMeasurement";

export interface PulseExtra {
  ecgMode: Mode;
  modeMastered: boolean;
  correctlyReadLeads: number;
  leadCount: number;
  caliperAccurate: boolean | null;
  rhythmRecognitionStreak: number;
}

export type PulseAttemptRecord = AttemptRecord<PulseDomain, PulseExtra>;

export interface PulseAttemptInput {
  sessionId: string;
  mode: GamiMode;
  ecgMode: Mode;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  hintsUsed: number;
  durationMs: number;
  finishedAt: Date;
  correctlyReadLeads?: readonly Lead[];
  caliperErrorMs?: number | null;
  rhythmRecognitionStreak?: number;
}

/** Geçerli, tamamlanmış oturumları dönüştürür; boş/bozuk oturumlar kayda alınmaz. */
export function buildAttemptRecord(input: PulseAttemptInput): PulseAttemptRecord | null {
  const { score, correctAnswers, totalQuestions, hintsUsed, durationMs } = input;
  const rhythmRecognitionStreak = input.rhythmRecognitionStreak ?? 0;
  const caliperErrorMs = input.caliperErrorMs;
  const hasCaliperResult = caliperErrorMs !== undefined && caliperErrorMs !== null;
  if (
    input.sessionId.trim().length === 0 || !Number.isInteger(totalQuestions) || totalQuestions <= 0 ||
    !Number.isFinite(score) || score < 0 || score > 100 ||
    !Number.isInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > totalQuestions ||
    !Number.isInteger(hintsUsed) || hintsUsed < 0 || !Number.isFinite(durationMs) || durationMs < 0 ||
    !Number.isInteger(rhythmRecognitionStreak) || rhythmRecognitionStreak < 0 ||
    (hasCaliperResult && !Number.isFinite(caliperErrorMs)) || !Number.isFinite(input.finishedAt.getTime())
  ) return null;

  const leadSet = new Set(input.correctlyReadLeads ?? []);
  const correctlyReadLeads = LEADS.filter((lead) => leadSet.has(lead)).length;
  const caliperAccurate = hasCaliperResult ? Math.abs(caliperErrorMs) <= 20 : null;
  const modeMastered = score >= 80;
  const domains: Partial<Record<PulseDomain, number>> = {
    rhythmRecognition: Math.round((correctAnswers / totalQuestions) * 100),
  };
  if (input.correctlyReadLeads !== undefined) {
    domains.leadReading = Math.round((correctlyReadLeads / LEADS.length) * 100);
  }
  if (hasCaliperResult) domains.intervalMeasurement = caliperAccurate ? 100 : 0;

  return {
    id: `pulse-${input.mode}-${input.sessionId}`,
    mode: input.mode,
    finishedAt: input.finishedAt.toISOString(),
    score,
    mastery: modeMastered,
    caseCount: totalQuestions,
    hintsUsed,
    durationMs,
    domains,
    extra: {
      ecgMode: input.ecgMode,
      modeMastered,
      correctlyReadLeads,
      leadCount: input.correctlyReadLeads === undefined ? 0 : LEADS.length,
      caliperAccurate,
      rhythmRecognitionStreak,
    },
  };
}

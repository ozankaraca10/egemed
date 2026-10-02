/** EGEMED Ausculta — tamamlanan oturum → AttemptRecord. Saat `finishedAt` olarak gelir. */

import type { AttemptRecord, GamiMode } from "@egemed/gamification-core";
import { aggregateResults } from "../core/scoring";
import type { CaseResult, ScoringWeights, SoundCategory } from "../core/types";
import type { HeartTopic, LungTopic } from "./catalog";

type AuscultaDomain = keyof ScoringWeights;

export const CARDIAC_FOCI = ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"] as const;
export const POSTERIOR_LUNG_POINTS = [
  "lung_right_upper_posterior",
  "lung_left_upper_posterior",
  "lung_right_middle_posterior",
  "lung_left_middle_posterior",
  "lung_right_lower_posterior",
  "lung_left_lower_posterior",
] as const;

const HEART_FINDING: Record<string, HeartTopic> = {
  s3: "extraSounds",
  s4: "extraSounds",
  early_systolic_murmur: "murmurTiming",
  mid_systolic_murmur: "murmurTiming",
  late_systolic_murmur: "murmurTiming",
  late_diastolic_murmur: "murmurTiming",
  atrial_fibrillation: "rhythm",
  tachycardia: "rhythm",
  av_block: "rhythm",
};

const LUNG_FINDING: Record<string, LungTopic> = {
  wheezing: "continuous",
  rhonchi: "continuous",
  fine_crackles: "crackles",
  coarse_crackles: "crackles",
  pleural_rub: "pleuralRub",
};

const DOMAIN_KEYS: readonly AuscultaDomain[] = [
  "technique",
  "localization",
  "recognition",
  "interpretation",
  "diagnosis",
  "systematic",
];

export interface AuscultaSoundAssignment {
  category: SoundCategory;
  acousticFinding: string;
}

export interface AuscultaListen {
  pointId: string;
  listenMs: number;
}

export interface AuscultaCompletedCase {
  id: string;
  result: CaseResult;
  population: string | null;
  assignments: readonly AuscultaSoundAssignment[];
  requiredPoints: readonly string[];
  minListenMsPerPoint: number;
  listens: readonly AuscultaListen[];
  findingRecognized: boolean;
  headChoiceCorrect: number;
}

interface AuscultaExtra {
  listenDisciplineCases: number;
  systematicExams: number;
  cardiacFociExams: number;
  posteriorLungExams: number;
  heartCorrect: Record<HeartTopic, number>;
  lungCorrect: Record<LungTopic, number>;
  pediatricCorrect: number;
  mixedCorrect: number;
  headChoiceCorrect: number;
}

type AuscultaAttemptRecord = AttemptRecord<AuscultaDomain, AuscultaExtra>;

interface AuscultaAttemptInput {
  sessionId: string;
  mode: GamiMode;
  cases: readonly AuscultaCompletedCase[];
  durationMs: number;
  finishedAt: Date;
}

const emptyCounts = (): Pick<AuscultaExtra, "heartCorrect" | "lungCorrect"> => ({
  heartCorrect: { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
  lungCorrect: { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 },
});

function finiteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function listenMap(listens: readonly AuscultaListen[]): Map<string, number> | null {
  const map = new Map<string, number>();
  for (const listen of listens) {
    if (listen.pointId.trim().length === 0 || !finiteNumber(listen.listenMs) || listen.listenMs < 0) return null;
    if (map.has(listen.pointId)) return null;
    map.set(listen.pointId, listen.listenMs);
  }
  return map;
}

function qualifies(map: Map<string, number>, pointId: string, minListenMs: number): boolean {
  const heard = map.get(pointId);
  return minListenMs > 0 && heard !== undefined && heard >= minListenMs;
}

function classesFor(assignment: AuscultaSoundAssignment): { heart: HeartTopic[]; lung: LungTopic[] } | null {
  if (assignment.category !== "heart" && assignment.category !== "lung" && assignment.category !== "mixed") return null;
  const parts = assignment.acousticFinding.split("+").map((part) => part.trim()).filter((part) => part.length > 0);
  const heart: HeartTopic[] = [];
  const lung: LungTopic[] = [];
  let normal = false;
  for (const part of parts) {
    if (part === "normal") {
      normal = true;
      continue;
    }
    const heartTopic = HEART_FINDING[part];
    const lungTopic = LUNG_FINDING[part];
    if (heartTopic) heart.push(heartTopic);
    else if (lungTopic) lung.push(lungTopic);
  }
  if (normal && heart.length === 0 && lung.length === 0) {
    if (assignment.category === "heart") heart.push("normal");
    if (assignment.category === "lung") lung.push("vesicular");
  } else if (normal && heart.length > 0 && lung.length === 0) lung.push("vesicular");
  else if (normal && lung.length > 0 && heart.length === 0) heart.push("normal");
  return { heart, lung };
}

function validResult(item: AuscultaCompletedCase): boolean {
  const { result } = item;
  if (item.id.trim().length === 0 || item.id !== result.caseId || result.max !== 100) return false;
  if (!Number.isInteger(result.total) || result.total < 0 || result.total > 100) return false;
  if (typeof result.mastery !== "boolean" || !Number.isInteger(result.hintsUsed) || result.hintsUsed < 0) return false;
  if (!Number.isInteger(item.headChoiceCorrect) || item.headChoiceCorrect < 0) return false;
  if (!finiteNumber(item.minListenMsPerPoint) || item.minListenMsPerPoint < 0) return false;
  if (new Set(item.requiredPoints).size !== item.requiredPoints.length) return false;
  for (const key of DOMAIN_KEYS) {
    const domain = result.domains[key];
    if (!domain || !finiteNumber(domain.earned) || !finiteNumber(domain.max) || domain.earned < 0 || domain.max < 0 || domain.earned > domain.max) {
      return false;
    }
  }
  return true;
}

function domainPercents(domains: CaseResult["domains"]): Partial<Record<AuscultaDomain, number>> {
  const out: Partial<Record<AuscultaDomain, number>> = {};
  for (const key of DOMAIN_KEYS) {
    const domain = domains[key];
    if (domain.max > 0) out[key] = Math.round((domain.earned / domain.max) * 100);
  }
  return out;
}

/** Geçerli oturumu kayda çevirir. Boş veya bozuk oturum null döner. */
export function buildAttemptRecord(input: AuscultaAttemptInput): AuscultaAttemptRecord | null {
  if (input.mode !== "practice" && input.mode !== "assessment") return null;
  if (input.sessionId.trim().length === 0 || input.cases.length === 0) return null;
  if (!finiteNumber(input.durationMs) || input.durationMs < 0 || !Number.isFinite(input.finishedAt.getTime())) return null;
  if (new Set(input.cases.map((item) => item.id)).size !== input.cases.length) return null;
  if (input.cases.some((item) => !validResult(item))) return null;

  const results = input.cases.map((item) => item.result);
  const aggregated = aggregateResults(results);
  const singlePractice = input.mode === "practice" && results.length === 1;
  const first = results[0];
  if (!first) return null;
  const score = singlePractice ? first.total : aggregated.total;
  const mastery = singlePractice ? first.mastery : aggregated.mastery;
  const domains = domainPercents(singlePractice ? first.domains : aggregated.domains);
  const extra: AuscultaExtra = {
    listenDisciplineCases: 0,
    systematicExams: 0,
    cardiacFociExams: 0,
    posteriorLungExams: 0,
    ...emptyCounts(),
    pediatricCorrect: 0,
    mixedCorrect: 0,
    headChoiceCorrect: 0,
  };

  for (const item of input.cases) {
    const heard = listenMap(item.listens);
    if (!heard) return null;
    const minListen = item.minListenMsPerPoint;
    const systematic = item.result.domains.systematic;
    if (item.requiredPoints.length > 0 && item.requiredPoints.every((pointId) => qualifies(heard, pointId, minListen))) {
      extra.listenDisciplineCases += 1;
    }
    if (systematic.max > 0 && systematic.earned >= systematic.max) extra.systematicExams += 1;
    if (CARDIAC_FOCI.every((pointId) => qualifies(heard, pointId, minListen))) extra.cardiacFociExams += 1;
    if (POSTERIOR_LUNG_POINTS.every((pointId) => qualifies(heard, pointId, minListen))) extra.posteriorLungExams += 1;
    extra.headChoiceCorrect += item.headChoiceCorrect;
    if (!item.findingRecognized) continue;

    const heart = new Set<HeartTopic>();
    const lung = new Set<LungTopic>();
    for (const assignment of item.assignments) {
      const parsed = classesFor(assignment);
      if (!parsed) return null;
      for (const topic of parsed.heart) heart.add(topic);
      for (const topic of parsed.lung) lung.add(topic);
    }
    for (const topic of heart) extra.heartCorrect[topic] += 1;
    for (const topic of lung) extra.lungCorrect[topic] += 1;
    if (heart.size > 0 && lung.size > 0) extra.mixedCorrect += 1;
    if (item.population === "pediatrik") extra.pediatricCorrect += 1;
  }

  return {
    id: `ausculta-${input.mode}-${input.sessionId}`,
    mode: input.mode,
    finishedAt: input.finishedAt.toISOString(),
    score,
    mastery,
    caseCount: input.cases.length,
    hintsUsed: results.reduce((sum, result) => sum + result.hintsUsed, 0),
    durationMs: input.durationMs,
    domains,
    extra,
  };
}

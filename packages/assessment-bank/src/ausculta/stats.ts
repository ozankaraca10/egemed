import type { SimCaseResult, SimTelemetry } from "@egemed/contracts";
import type { CaseDef } from "./types";

/**
 * Sunucu tarafı Ausculta rozet istatistiği (A1.3). Kaynak mantık:
 * packages/sim-ausculta/src/gamification/attempt.ts `buildAttemptRecord` (istemci; A1.4'te kalkar).
 * Çıktı `@egemed/gami-catalogs` `AuscultaStats` ile yapısal olarak aynıdır ve
 * `encodeAuscultaSummary` ile kodlu özete çevrilir (ADR-008).
 */

type HeartTopic = "normal" | "extraSounds" | "murmurTiming" | "rhythm";
type LungTopic = "vesicular" | "continuous" | "crackles" | "pleuralRub";

export interface AuscultaSessionStats {
  listenDisciplineCases: number;
  systematicExams: number;
  cardiacFociExams: number;
  posteriorLungExams: number;
  heartCorrect: Record<HeartTopic, number>;
  lungCorrect: Record<LungTopic, number>;
  pediatricCorrect: number;
  mixedCorrect: number;
  headChoiceCorrect: number;
  correctDiagnosisCount: number;
}

const CARDIAC_FOCI = ["cardiac_aortic", "cardiac_pulmonary", "cardiac_tricuspid", "cardiac_mitral"];
const POSTERIOR_LUNG_POINTS = [
  "lung_right_upper_posterior",
  "lung_left_upper_posterior",
  "lung_right_middle_posterior",
  "lung_left_middle_posterior",
  "lung_right_lower_posterior",
  "lung_left_lower_posterior",
];
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

function topicsOf(caseDef: CaseDef): { heart: Set<HeartTopic>; lung: Set<LungTopic> } {
  const heart = new Set<HeartTopic>();
  const lung = new Set<LungTopic>();
  for (const assignment of caseDef.soundAssignments) {
    const parts = assignment.acousticFinding.split("+").map((part) => part.trim()).filter(Boolean);
    let normal = false;
    const h: HeartTopic[] = [];
    const l: LungTopic[] = [];
    for (const part of parts) {
      if (part === "normal") normal = true;
      else if (HEART_FINDING[part]) h.push(HEART_FINDING[part]);
      else if (LUNG_FINDING[part]) l.push(LUNG_FINDING[part]);
    }
    if (normal && h.length === 0 && l.length === 0) {
      if (assignment.category === "heart") h.push("normal");
      if (assignment.category === "lung") l.push("vesicular");
    } else if (normal && h.length > 0 && l.length === 0) l.push("vesicular");
    else if (normal && l.length > 0 && h.length === 0) h.push("normal");
    for (const topic of h) heart.add(topic);
    for (const topic of l) lung.add(topic);
  }
  return { heart, lung };
}

/**
 * Bir oturumun tamamlanan vakalarından istatistik. Dinleme süresi istemci
 * beyanıdır; `heardPoints` sunucunun ses jetonu kayıtlarından gelir ve hiç ses
 * istenmemiş nokta "dinlenmiş" sayılmaz (A1 §3 çapraz doğrulama).
 */
export function auscultaSessionStats(
  items: readonly {
    readonly caseDef: CaseDef;
    readonly result: SimCaseResult;
    readonly telemetry: SimTelemetry;
    readonly heardPoints: ReadonlySet<string>;
  }[],
): AuscultaSessionStats {
  const stats: AuscultaSessionStats = {
    listenDisciplineCases: 0,
    systematicExams: 0,
    cardiacFociExams: 0,
    posteriorLungExams: 0,
    heartCorrect: { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
    lungCorrect: { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 },
    pediatricCorrect: 0,
    mixedCorrect: 0,
    headChoiceCorrect: 0,
    correctDiagnosisCount: 0,
  };
  for (const { caseDef, result, telemetry, heardPoints } of items) {
    const minListen = caseDef.technique.minListenMsPerPoint;
    const heard = (pointId: string) =>
      heardPoints.has(pointId) && minListen > 0 && (telemetry.visits[pointId]?.listenMs ?? 0) >= minListen;
    const required = caseDef.technique.requiredPoints;
    if (required.length > 0 && required.every(heard)) stats.listenDisciplineCases += 1;
    const systematic = result.domains.systematic;
    if (systematic !== undefined && systematic.max > 0 && systematic.earned >= systematic.max) stats.systematicExams += 1;
    if (CARDIAC_FOCI.every(heard)) stats.cardiacFociExams += 1;
    if (POSTERIOR_LUNG_POINTS.every(heard)) stats.posteriorLungExams += 1;
    const byId = new Map(result.questions.map((q) => [q.questionId, q.correct]));
    for (const question of caseDef.questions) {
      if (question.type === "bell_diaphragm" && byId.get(question.id) === true) stats.headChoiceCorrect += 1;
      if (question.domain === "diagnosis" && byId.get(question.id) === true) stats.correctDiagnosisCount += 1;
    }
    const recognition = caseDef.questions.filter((q) => q.domain === "recognition");
    const recognized = recognition.length > 0 && recognition.every((q) => byId.get(q.id) === true);
    if (!recognized) continue;
    const { heart, lung } = topicsOf(caseDef);
    for (const topic of heart) stats.heartCorrect[topic] += 1;
    for (const topic of lung) stats.lungCorrect[topic] += 1;
    if (heart.size > 0 && lung.size > 0) stats.mixedCorrect += 1;
    if (caseDef.patient.age < 18) stats.pediatricCorrect += 1;
  }
  return stats;
}

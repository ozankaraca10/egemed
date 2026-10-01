import type { SimId, SimIntegrity } from "@egemed/contracts";
import {
  BLUR_MANY_MIN_COUNT,
  CONSISTENCY_LATENCY_MULTIPLIER,
  CONSISTENCY_MIN_CORRECT_RATE,
  CONSISTENCY_SESSION_COUNT,
  INTEGRITY_FLAG_SCORE_THRESHOLD,
  PASTE_MIN_COUNT,
  SIGNAL_WEIGHTS,
  TAB_HIDDEN_MIN_COUNT,
  TAB_HIDDEN_MIN_MS,
  TOO_FAST_THRESHOLD_MS,
  type IntegritySignalName,
} from "./thresholds";

/**
 * T283a — saf sinyal hesapları (DB/istek nesnesine bağımsız): kolayca birim
 * test edilir. Sunucu saatiyle ölçülen `latencyMs` her zaman hesaplanır (eski
 * istemci de dahil); `integrity` alanına bağlı sinyaller yalnız alan
 * gönderildiğinde hesaplanır (plan §1: "alan yoksa sinyal bilinmiyor sayılır").
 */
export interface CaseSignalInput {
  readonly simId: SimId;
  /** Vaka doğru mu (`SimCaseResult.mastery`); yanlışta too_fast/no_interaction_correct hiç hesaplanmaz. */
  readonly mastery: boolean;
  /** Sunucu saatine göre `answeredAt - openedAt`. */
  readonly latencyMs: number;
  /** Yalnız Ausculta'da anlamlı: mevcut dinleme çapraz doğrulaması hiç nokta bulamadı. */
  readonly noListenedPoints: boolean;
  readonly integrity: SimIntegrity | undefined;
}

export function computeCaseSignals(input: CaseSignalInput): IntegritySignalName[] {
  const signals: IntegritySignalName[] = [];
  if (input.mastery && input.latencyMs < TOO_FAST_THRESHOLD_MS[input.simId]) signals.push("too_fast");
  const interactionsZero = input.integrity !== undefined && input.integrity.interactions === 0;
  if (input.mastery && (interactionsZero || input.noListenedPoints)) signals.push("no_interaction_correct");
  if (input.integrity !== undefined) {
    if (input.integrity.hiddenCount >= TAB_HIDDEN_MIN_COUNT && input.integrity.hiddenMs >= TAB_HIDDEN_MIN_MS) signals.push("tab_hidden");
    if (input.integrity.blurCount >= BLUR_MANY_MIN_COUNT) signals.push("blur_many");
    if (input.integrity.pasteCount >= PASTE_MIN_COUNT) signals.push("paste");
  }
  return signals;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

export interface SessionConsistencyInput {
  readonly simId: SimId;
  /** Oturumun 0–100 puanı (plan §3: "%90 doğru" için vekil). */
  readonly correctRate: number;
  readonly medianLatencyMs: number | null;
}

/** plan §3: son N oturumun HEPSİ yüksek doğruluk + düşük medyan gecikme taşıyorsa tutarlılık sinyali. */
export function isConsistentFast(sessions: readonly SessionConsistencyInput[]): boolean {
  if (sessions.length < CONSISTENCY_SESSION_COUNT) return false;
  return sessions.slice(0, CONSISTENCY_SESSION_COUNT).every((session) => {
    if (session.medianLatencyMs === null) return false;
    const bound = TOO_FAST_THRESHOLD_MS[session.simId] * CONSISTENCY_LATENCY_MULTIPLIER;
    return session.correctRate >= CONSISTENCY_MIN_CORRECT_RATE && session.medianLatencyMs < bound;
  });
}

/** Oturum bütünlük skoru: vaka sinyallerinin ağırlıklı toplamı 10 vaka başına oranlanır
 *  (tek tük hızlı yanıt veren dürüst öğrenci işaretlenmesin; T283a incelemesi), üstüne
 *  tutarlılık sinyali eklenir. */
export function integrityScore(caseSignalLists: readonly (readonly IntegritySignalName[])[], consistentFast: boolean): number {
  let raw = 0;
  for (const signals of caseSignalLists) {
    for (const signal of signals) raw += SIGNAL_WEIGHTS[signal];
  }
  const perTen = (raw * 10) / Math.max(1, caseSignalLists.length);
  return Math.round((perTen + (consistentFast ? SIGNAL_WEIGHTS.consistent_fast : 0)) * 10) / 10;
}

export function shouldFlag(score: number): boolean {
  return score >= INTEGRITY_FLAG_SCORE_THRESHOLD;
}

/** KVKK: yalnız sayı ve sinyal adı; serbest metin yok (plan §4). */
export interface IntegrityFlagSignals {
  readonly cases: Readonly<Record<string, readonly IntegritySignalName[]>>;
  readonly counts: Readonly<Record<IntegritySignalName, number>>;
}

export function buildFlagSignals(caseSignalLists: readonly (readonly IntegritySignalName[])[], consistentFast: boolean): IntegrityFlagSignals {
  const cases: Record<string, readonly IntegritySignalName[]> = {};
  caseSignalLists.forEach((signals, position) => {
    if (signals.length > 0) cases[String(position + 1)] = signals;
  });
  const counts: Record<IntegritySignalName, number> = {
    too_fast: 0,
    no_interaction_correct: 0,
    tab_hidden: 0,
    blur_many: 0,
    paste: 0,
    consistent_fast: consistentFast ? 1 : 0,
  };
  for (const signals of caseSignalLists) {
    for (const signal of signals) counts[signal] += 1;
  }
  return { cases, counts };
}

/**
 * T97 — API oturumunda tamamlanan denemeyi sunucuya iletir.
 * Kimlik yerel deneme kimliğinden deterministik UUID'dir; aynı deneme
 * aynı gövdeyle tekrar gönderildiğinde sunucu idempotent 200 döner.
 * `Date.now()` kullanılmaz.
 */

import { createApiClient, createApiGamiRepository, type ApiClient } from "@egemed/api-client";
import {
  AUSCULTA_HEART_TOPICS,
  AUSCULTA_LUNG_TOPICS,
  PULSE_MODES,
  encodeAuscultaSummary,
  encodeOpacaSummary,
  encodePulseSummary,
  type AuscultaStats,
  type OpacaSummaryInput,
  type PulseSummaryInput,
} from "@egemed/gami-catalogs";
import type { SimId } from "@egemed/contracts";
import { browserApiWindow, csrfTokenFromCookie } from "./apiAuth";

export interface ReportedAttempt {
  readonly id: string;
  readonly mode: "practice" | "assessment";
  readonly finishedAt: string;
  readonly score: number;
  readonly mastery: boolean;
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly durationMs: number;
  readonly domains: Partial<Record<string, number>>;
  readonly extra: unknown;
}

const SUMMARY_MAX = 1_000_000;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** `Z` soneki şema ofsetine çevrilir; var olan ofset korunur. */
export function offsetIso(value: string): string {
  if (/[+-]\d{2}:\d{2}$/.test(value)) return value;
  if (value.endsWith("Z")) return `${value.slice(0, -1)}+00:00`;
  return value;
}

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

/** SHA-256'nın ilk 16 baytı, UUIDv5 biçiminde (sürüm 5, RFC 4122 varyantı). */
export async function deterministicAttemptUuid(localId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localId)));
  const raw = digest.slice(0, 16);
  const version = raw[6] ?? 0;
  const variant = raw[8] ?? 0;
  raw[6] = (version & 0x0f) | 0x50;
  raw[8] = (variant & 0x3f) | 0x80;
  const hex = [...raw].map(hexByte).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Kodlu özet: yalnız sınırlı tam sayılar. Serbest metin yok. */
export function codedAttemptSummary(attempt: Pick<ReportedAttempt, "score" | "caseCount">): {
  readonly score: number;
  readonly correct: number;
  readonly total: number;
} {
  const score = clampInt(attempt.score, 0, 100);
  const total = clampInt(attempt.caseCount, 0, SUMMARY_MAX);
  const correct = clampInt(Math.round((score * total) / 100), 0, total);
  return { score, correct, total };
}

function isPulseExtra(extra: unknown): extra is PulseSummaryInput["extra"] {
  if (typeof extra !== "object" || extra === null) return false;
  const value = extra as Record<string, unknown>;
  return (
    typeof value["ecgMode"] === "string" &&
    (PULSE_MODES as readonly string[]).includes(value["ecgMode"]) &&
    typeof value["modeMastered"] === "boolean" &&
    typeof value["correctlyReadLeads"] === "number" &&
    (value["caliperAccurate"] === null || typeof value["caliperAccurate"] === "boolean") &&
    typeof value["rhythmRecognitionStreak"] === "number"
  );
}

function isOpacaExtra(extra: unknown): extra is OpacaSummaryInput["extra"] {
  if (typeof extra !== "object" || extra === null) return false;
  const value = extra as Record<string, unknown>;
  return (
    Array.isArray(value["findings"]) &&
    typeof value["localizationHits"] === "number" &&
    typeof value["abcdeComplete"] === "number" &&
    typeof value["qualityCorrect"] === "number" &&
    typeof value["interpretationCorrect"] === "number" &&
    typeof value["fastPerfect"] === "boolean"
  );
}

const isFiniteCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isAuscultaStats(extra: unknown): extra is AuscultaStats {
  if (typeof extra !== "object" || extra === null) return false;
  const value = extra as Record<string, unknown>;
  const heart = value["heartCorrect"];
  const lung = value["lungCorrect"];
  if (typeof heart !== "object" || heart === null || typeof lung !== "object" || lung === null) return false;
  const heartCounts = heart as Record<string, unknown>;
  const lungCounts = lung as Record<string, unknown>;
  return (
    isFiniteCount(value["listenDisciplineCases"]) &&
    isFiniteCount(value["systematicExams"]) &&
    isFiniteCount(value["cardiacFociExams"]) &&
    isFiniteCount(value["posteriorLungExams"]) &&
    isFiniteCount(value["pediatricCorrect"]) &&
    isFiniteCount(value["mixedCorrect"]) &&
    isFiniteCount(value["headChoiceCorrect"]) &&
    (value["correctDiagnosisCount"] === undefined || isFiniteCount(value["correctDiagnosisCount"])) &&
    AUSCULTA_HEART_TOPICS.every((topic) => isFiniteCount(heartCounts[topic])) &&
    AUSCULTA_LUNG_TOPICS.every((topic) => isFiniteCount(lungCounts[topic]))
  );
}

/**
 * ADR-008: sunucu rozetleri sime özgü kodlu özetten değerlendirir. Kodlayıcısı
 * olmayan sim yalnız genel özeti gönderir. Opaca özetinde öğrenme sayaçları
 * ve konu kodları sim verisi gerektirdiğinden kodlanmaz; rozetlerin bu bölümü
 * yerel değerlendirmede kalır.
 */
export function simSummaryCodes(
  simId: SimId,
  attempt: Pick<ReportedAttempt, "score" | "extra"> &
    Partial<Pick<ReportedAttempt, "mode" | "finishedAt" | "caseCount" | "hintsUsed">>,
): Record<string, number> {
  if (simId === "pulse" && isPulseExtra(attempt.extra)) {
    return encodePulseSummary({ extra: attempt.extra, score: attempt.score });
  }
  if (
    simId === "opaca" &&
    isOpacaExtra(attempt.extra) &&
    attempt.mode !== undefined &&
    attempt.finishedAt !== undefined &&
    attempt.caseCount !== undefined &&
    attempt.hintsUsed !== undefined
  ) {
    return encodeOpacaSummary({
      mode: attempt.mode,
      finishedAt: attempt.finishedAt,
      score: attempt.score,
      caseCount: attempt.caseCount,
      hintsUsed: attempt.hintsUsed,
      extra: attempt.extra,
    });
  }
  if (simId === "ausculta" && isAuscultaStats(attempt.extra)) {
    return encodeAuscultaSummary(attempt.extra);
  }
  return {};
}

export async function reportSimAttempt(client: Pick<ApiClient, "gamification">, simId: SimId, attempt: ReportedAttempt): Promise<void> {
  const id = await deterministicAttemptUuid(`${simId}:${attempt.id}`);
  const generic = codedAttemptSummary(attempt);
  const summary = { ...generic, ...simSummaryCodes(simId, attempt) };
  const repo = createApiGamiRepository({
    client: client.gamification,
    simId,
    encodeAttempt: (input) => ({
      id,
      attemptNo: input.attemptNo,
      startedAt: input.startedAt,
      finishedAt: offsetIso(input.attempt.finishedAt),
      score: generic.score,
      maxScore: 100,
      passed: input.attempt.mastery,
      summary,
    }),
  });
  await repo.recordAttempt(attempt);
}

/** Tarayıcı çerez oturumuyla raporlar; DOM yoksa `null`. */
export function createBrowserAttemptReporter(baseUrl: string): ((simId: SimId, attempt: ReportedAttempt) => Promise<void>) | null {
  const win = browserApiWindow();
  if (win === null) return null;
  const client = createApiClient({
    baseUrl,
    fetch: (input, init) => win.fetch(input, init),
    readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
  });
  return (simId, attempt) => reportSimAttempt(client, simId, attempt);
}

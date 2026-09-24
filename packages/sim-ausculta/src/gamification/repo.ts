import { attemptXp, computeStreak, computeWeeklyGoals, evaluateBadges, levelForXp } from "@egemed/gamification-core";
import type { AttemptRecord, EarnedBadge } from "@egemed/gamification-core";
import { AUSCULTA_BADGES } from "./catalog";
import type { AuscultaStats } from "./catalog";
import { AUSCULTA_RULES } from "./rules";

export interface GamiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface GamiApiRepository {
  record(event: AuscultaGamiEvent): void | Promise<void>;
}
export type AuscultaGamiEvent =
  | { type: "case_completed"; id: string; finishedAt: string; mode: "practice" | "assessment"; score: number; mastery: boolean; hintsUsed: number; domains: Partial<Record<string, number>> }
  | { type: "correct_diagnosis"; id: string; finishedAt: string };
export interface AuscultaGamiState {
  v: 1;
  attempts: AttemptRecord<string, AuscultaStats>[];
  earned: EarnedBadge[];
  stats: AuscultaStats;
  seenEvents: string[];
}
export interface GamiRepository {
  recordEvent(event: AuscultaGamiEvent): void;
  snapshot(): AuscultaGamiState;
  subscribe(listener: () => void): () => void;
}
export const AUSCULTA_GAMI_STORAGE_KEY = "egemed.ausculta.gamification.v1";
const zeroStats = (): AuscultaStats => ({
  listenDisciplineCases: 0, systematicExams: 0, cardiacFociExams: 0, posteriorLungExams: 0,
  heartCorrect: { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 },
  lungCorrect: { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 },
  pediatricCorrect: 0, mixedCorrect: 0, headChoiceCorrect: 0,
});
const emptyState = (): AuscultaGamiState => ({ v: 1, attempts: [], earned: [], stats: { ...zeroStats(), correctDiagnosisCount: 0 }, seenEvents: [] });
function validState(value: unknown): value is AuscultaGamiState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AuscultaGamiState>;
  return state.v === 1 && Array.isArray(state.attempts) && Array.isArray(state.earned) && !!state.stats && typeof state.stats === "object" && Array.isArray(state.seenEvents);
}
function browserStorage(): GamiStorage | null {
  try {
    const candidate = (globalThis as { localStorage?: GamiStorage }).localStorage;
    return candidate ?? null;
  } catch { return null; }
}
export class LocalGamiRepository implements GamiRepository {
  private state: AuscultaGamiState;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly options: { storage?: GamiStorage | null; api?: GamiApiRepository; now: () => Date } ) {
    this.state = this.read();
  }
  private read(): AuscultaGamiState {
    try {
      const raw = (this.options.storage === undefined ? browserStorage() : this.options.storage)?.getItem(AUSCULTA_GAMI_STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed: unknown = JSON.parse(raw);
      return validState(parsed) ? parsed : emptyState();
    } catch { return emptyState(); }
  }
  private persist(): void {
    try { (this.options.storage === undefined ? browserStorage() : this.options.storage)?.setItem(AUSCULTA_GAMI_STORAGE_KEY, JSON.stringify(this.state)); } catch { /* storage is optional */ }
  }
  recordEvent(event: AuscultaGamiEvent): void {
    if (this.state.seenEvents.includes(event.id)) return;
    this.state.seenEvents = [...this.state.seenEvents, event.id].slice(-500);
    if (event.type === "correct_diagnosis") {
      this.state.stats = { ...this.state.stats, correctDiagnosisCount: (this.state.stats.correctDiagnosisCount ?? 0) + 1 };
    } else {
      const at = new Date(event.finishedAt);
      if (!Number.isFinite(at.getTime())) return;
      const extra = this.state.stats;
      const attempt: AttemptRecord<string, AuscultaStats> = {
        id: event.id, mode: event.mode, finishedAt: at.toISOString(), score: event.score, mastery: event.mastery,
        caseCount: 1, hintsUsed: event.hintsUsed, durationMs: 0, domains: event.domains, extra: { ...extra },
      };
      this.state.attempts = [...this.state.attempts, attempt].slice(-500);
    }
    const now = this.options.now();
    this.state.earned = [...this.state.earned, ...evaluateBadges(AUSCULTA_BADGES, this.state.stats, this.state.earned, { now })];
    this.persist();
    try { void Promise.resolve(this.options.api?.record(event)).catch(() => undefined); } catch { /* API persistence is optional */ }
    this.listeners.forEach((listener) => listener());
  }
  snapshot(): AuscultaGamiState { return this.state; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  summary(now: Date) {
    return {
      level: levelForXp(this.state.attempts.reduce((sum, item) => sum + attemptXp(item, AUSCULTA_RULES), 0), AUSCULTA_RULES),
      streak: computeStreak(this.state.attempts, now),
      goals: computeWeeklyGoals(this.state.attempts, this.state.earned, now, AUSCULTA_RULES),
    };
  }
}

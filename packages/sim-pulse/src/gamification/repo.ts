/** EGEMED Pulse — oyunlaştırma deposu portu ile bellek ve localStorage adaptörleri.
 *  API adaptörü ayrı görevdedir; port bu yüzden asenkron uçlar sunar (T56 emsali).
 *  Zaman her zaman `now` parametresidir; bu dosya hiçbir saat kaynağını doğrudan okumaz. */

import type {
  Cohort,
  CohortFilter,
  EarnedBadge,
  GamiProfile,
  GamiStateV1,
  Period,
} from "@egemed/gamification-core";
import {
  dayKeyTr,
  evaluateBadges,
  levelForXp,
  monthKeyTr,
  periodRangeTr,
  periodScore,
  rankRows,
  startOfAcademicYearTr,
  startOfWeekTr,
  totalXpFor,
} from "@egemed/gamification-core";
import { MODES } from "../engine/shapes";
import type { Mode } from "../engine/shapes";
import type { PersistenceStorage } from "../persistence/types";
import { PULSE_BADGES } from "./catalog";
import type { PulseStats } from "./catalog";
import type { PulseAttemptRecord, PulseExtra } from "./attempt";
import { PULSE_RULES } from "./rules";

export type PulseGamiState = GamiStateV1<string, PulseExtra>;

export const PULSE_GAMI_STORAGE_KEY = "egemed-pulse-gami-1.0";
export const PULSE_GAMI_MAX_ATTEMPTS = 500;
export const PULSE_ANONYMOUS_LABEL = "Anonim öğrenci";

export function emptyPulseGamiState(): PulseGamiState {
  return {
    v: 1,
    attempts: [],
    learn: { topics: [], items: {} },
    earned: [],
    profile: { displayName: null, public: true, cohort: null },
  };
}

export function pulseLearnTopic(mode: Mode): string {
  return `pulse:mode:${mode}`;
}

/** Rozet motorunun beklediği Pulse istatistikleri: seri/derivasyonda en iyi oturum,
 *  kaliperde doğru ölçüm toplamı, mod ustalığında başarılı oturumun EC G örüntüsü. */
export function computePulseStats(attempts: readonly PulseAttemptRecord[]): PulseStats {
  let rhythmRecognitionStreak = 0;
  let correctlyReadLeads = 0;
  let accurateCaliperCount = 0;
  const modeMastery: Partial<Record<Mode, number>> = {};
  for (const attempt of attempts) {
    rhythmRecognitionStreak = Math.max(rhythmRecognitionStreak, attempt.extra.rhythmRecognitionStreak);
    correctlyReadLeads = Math.max(correctlyReadLeads, attempt.extra.correctlyReadLeads);
    if (attempt.extra.caliperAccurate === true) accurateCaliperCount += 1;
    if (attempt.extra.modeMastered) modeMastery[attempt.extra.ecgMode] = 1;
  }
  return { rhythmRecognitionStreak, correctlyReadLeads, accurateCaliperCount, modeMastery };
}

export interface PulseLeaderboardRow {
  id: string;
  displayName: string;
  isMe: boolean;
  isPublic: boolean;
  cohort: Cohort | null;
  periodScore: number | null;
  attemptsCount: number;
  reachedAt: string | null;
  totalXp: number;
  level: number;
  rank: number | null;
}

export interface PulseLeaderboardView {
  period: Period;
  cohort: CohortFilter;
  generatedAt: string;
  isDemo: true;
  rows: PulseLeaderboardRow[];
}

export interface PulseGamiWriteResult {
  readonly state: PulseGamiState;
  readonly earnedIds: readonly string[];
}

export interface PulseGamiRepo {
  load(): Promise<PulseGamiState>;
  updateMe(patch: Partial<GamiProfile>): Promise<PulseGamiWriteResult>;
  recordAttempt(attempt: PulseAttemptRecord, now: Date): Promise<PulseGamiWriteResult>;
  recordLearn(topic: string, now: Date): Promise<PulseGamiWriteResult>;
  getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<PulseLeaderboardView>;
}

export interface PulseGamiRepoOptions {
  readonly state?: PulseGamiState;
}

export interface PulseDemoPeer {
  id: string;
  displayName: string | null;
  public: boolean;
  cohort: Cohort;
}

export const PULSE_DEMO_PEERS: readonly PulseDemoPeer[] = [
  { id: "demo-01", displayName: "Deniz Kaya", public: true, cohort: 5 },
  { id: "demo-02", displayName: "Ayşe Yıldız", public: true, cohort: 3 },
  { id: "demo-03", displayName: "Mert Tunç", public: true, cohort: 6 },
  { id: "demo-04", displayName: "Ece Sarı", public: true, cohort: 4 },
  { id: "demo-05", displayName: "Can Öztürk", public: true, cohort: 5 },
  { id: "demo-06", displayName: null, public: false, cohort: 5 },
  { id: "demo-07", displayName: "Zeynep Arslan", public: true, cohort: 4 },
  { id: "demo-08", displayName: "Burak Demir", public: true, cohort: 6 },
  { id: "demo-09", displayName: "Elif Şahin", public: true, cohort: 4 },
  { id: "demo-10", displayName: null, public: false, cohort: 2 },
  { id: "demo-11", displayName: "Kerem Aydın", public: true, cohort: 1 },
  { id: "demo-12", displayName: null, public: false, cohort: 4 },
  { id: "demo-13", displayName: "Ahmet Polat", public: true, cohort: 2 },
  { id: "demo-14", displayName: "İrem Koç", public: true, cohort: 1 },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCohort = (value: unknown): value is Cohort =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function isPulseAttempt(value: unknown): value is PulseAttemptRecord {
  if (!isRecord(value) || !isRecord(value.extra) || !isRecord(value.domains)) return false;
  const extra = value.extra;
  return typeof value.id === "string" && value.id.trim().length > 0 &&
    (value.mode === "practice" || value.mode === "assessment") &&
    isIsoDate(value.finishedAt) &&
    typeof value.score === "number" && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100 &&
    typeof value.mastery === "boolean" &&
    Number.isInteger(value.caseCount) && (value.caseCount as number) >= 0 &&
    Number.isInteger(value.hintsUsed) && (value.hintsUsed as number) >= 0 &&
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs >= 0 &&
    typeof extra.ecgMode === "string" && (MODES as readonly string[]).includes(extra.ecgMode) &&
    typeof extra.modeMastered === "boolean" &&
    Number.isInteger(extra.correctlyReadLeads) && (extra.correctlyReadLeads as number) >= 0 &&
    (extra.caliperAccurate === null || typeof extra.caliperAccurate === "boolean") &&
    Number.isInteger(extra.rhythmRecognitionStreak) && (extra.rhythmRecognitionStreak as number) >= 0;
}

function isEarnedBadge(value: unknown): value is EarnedBadge {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && isIsoDate(value.at);
}

function sanitizeItems(value: Record<string, unknown>): Record<string, string[]> {
  const items: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!Array.isArray(entry)) continue;
    items[key.slice(0, 60)] = entry
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.slice(0, 120));
  }
  return items;
}

function parsePulseGamiState(value: unknown): PulseGamiState | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (!Array.isArray(value.attempts) || !Array.isArray(value.earned)) return null;
  if (!isRecord(value.learn) || !Array.isArray(value.learn.topics) || !isRecord(value.learn.items)) return null;
  if (!isRecord(value.profile)) return null;
  const profile = value.profile;
  return {
    v: 1,
    attempts: value.attempts.filter(isPulseAttempt).slice(-PULSE_GAMI_MAX_ATTEMPTS),
    learn: {
      topics: value.learn.topics
        .filter((topic): topic is string => typeof topic === "string")
        .map((topic) => topic.slice(0, 120)),
      items: sanitizeItems(value.learn.items),
    },
    earned: value.earned.filter(isEarnedBadge),
    profile: {
      displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 80) : null,
      public: profile.public !== false,
      cohort: isCohort(profile.cohort) ? profile.cohort : null,
    },
  };
}

/** Ham metni (bozuk/eksik olsa da) istisna atmadan geçerli duruma çözer. */
export function decodePulseGamiState(raw: string | null | undefined): PulseGamiState {
  if (!raw) return emptyPulseGamiState();
  try {
    return parsePulseGamiState(JSON.parse(raw) as unknown) ?? emptyPulseGamiState();
  } catch {
    return emptyPulseGamiState();
  }
}

const copy = (state: PulseGamiState): PulseGamiState => JSON.parse(JSON.stringify(state)) as PulseGamiState;

function sanitizeProfilePatch(patch: Partial<GamiProfile>): Partial<GamiProfile> {
  const out: Partial<GamiProfile> = {};
  if (patch.displayName === null) out.displayName = null;
  else if (typeof patch.displayName === "string") {
    const trimmed = patch.displayName.trim().slice(0, 80);
    out.displayName = trimmed.length > 0 ? trimmed : null;
  }
  if (typeof patch.public === "boolean") out.public = patch.public;
  if (patch.cohort === null || isCohort(patch.cohort)) out.cohort = patch.cohort;
  return out;
}

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function periodKeyFor(period: Period, now: Date): string {
  switch (period) {
    case "today": return dayKeyTr(now);
    case "week": return dayKeyTr(startOfWeekTr(now));
    case "month": return monthKeyTr(now);
    case "academic_year": return dayKeyTr(startOfAcademicYearTr(now));
  }
}

const MAX_ATTEMPTS_BY_PERIOD: Record<Period, number> = { today: 1, week: 3, month: 8, academic_year: 40 };

function demoPeerRow(peer: PulseDemoPeer, period: Period, now: Date): Omit<PulseLeaderboardRow, "id" | "displayName" | "isMe" | "isPublic" | "cohort"> {
  const periodKey = periodKeyFor(period, now);
  const rng = mulberry32(seedFromString(`${peer.id}|${periodKey}`));
  const attemptsCount = Math.floor(rng() * (MAX_ATTEMPTS_BY_PERIOD[period] + 1));
  const totalXp = Math.round(300 + mulberry32(seedFromString(`${peer.id}|xp|${periodKey}`))() * 4200);
  const level = levelForXp(totalXp, PULSE_RULES).level;
  if (attemptsCount < PULSE_RULES.ranking.minAttempts) {
    return { periodScore: null, attemptsCount, reachedAt: null, totalXp, level, rank: null };
  }
  const factor = 10 ** PULSE_RULES.ranking.roundDecimals;
  const periodScore = Math.round((60 + rng() * 35) * factor) / factor;
  const { start, end } = periodRangeTr(period, now);
  const reachedAt = new Date(start.getTime() + rng() * Math.max(0, end.getTime() - start.getTime())).toISOString();
  return { periodScore, attemptsCount, reachedAt, totalXp, level, rank: null };
}

function normalizeState(state: PulseGamiState): PulseGamiState {
  return {
    ...state,
    attempts: state.attempts.slice(-PULSE_GAMI_MAX_ATTEMPTS),
  };
}

function createGamiRepo(initial: PulseGamiState, persist: (state: PulseGamiState) => void): PulseGamiRepo {
  let state = copy(normalizeState(initial));

  const write = (next: PulseGamiState, earnedIds: readonly string[]): PulseGamiWriteResult => {
    state = next;
    persist(next);
    return { state: copy(next), earnedIds };
  };

  const evaluate = (attempts: readonly PulseAttemptRecord[], now: Date): EarnedBadge[] =>
    evaluateBadges(PULSE_BADGES, computePulseStats(attempts), state.earned, { now });

  return {
    async load(): Promise<PulseGamiState> {
      return copy(state);
    },

    async updateMe(patch: Partial<GamiProfile>): Promise<PulseGamiWriteResult> {
      const next = { ...state, profile: { ...state.profile, ...sanitizeProfilePatch(patch) } };
      return write(next, []);
    },

    async recordAttempt(attempt: PulseAttemptRecord, now: Date): Promise<PulseGamiWriteResult> {
      if (state.attempts.some((record) => record.id === attempt.id)) return { state: copy(state), earnedIds: [] };
      const attempts = [...state.attempts, attempt].slice(-PULSE_GAMI_MAX_ATTEMPTS);
      const earned = evaluate(attempts, now);
      return write({ ...state, attempts, earned: [...state.earned, ...earned] }, earned.map((badge) => badge.id));
    },

    async recordLearn(topic: string, now: Date): Promise<PulseGamiWriteResult> {
      const trimmed = topic.trim().slice(0, 120);
      if (trimmed.length === 0 || state.learn.topics.includes(trimmed)) return { state: copy(state), earnedIds: [] };
      const earned = evaluate(state.attempts, now);
      return write({
        ...state,
        learn: { ...state.learn, topics: [...state.learn.topics, trimmed] },
        earned: [...state.earned, ...earned],
      }, earned.map((badge) => badge.id));
    },

    async getLeaderboard(period: Period, cohort: CohortFilter, now: Date): Promise<PulseLeaderboardView> {
      const { start, end } = periodRangeTr(period, now);
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const mine = periodScore(
        state.attempts.filter((attempt) => attempt.mode === "assessment" && attempt.finishedAt >= startIso && attempt.finishedAt <= endIso),
        PULSE_RULES,
      );
      const totalXp = totalXpFor(state.attempts, state.learn, PULSE_RULES);
      const visibleName = state.profile.public ? state.profile.displayName : null;
      const meRow: PulseLeaderboardRow = {
        id: "me",
        displayName: visibleName ?? PULSE_ANONYMOUS_LABEL,
        isMe: true,
        isPublic: visibleName !== null,
        cohort: state.profile.cohort,
        periodScore: mine.score,
        attemptsCount: mine.attemptsCount,
        reachedAt: mine.reachedAt,
        totalXp,
        level: levelForXp(totalXp, PULSE_RULES).level,
        rank: null,
      };
      const matches = (candidate: Cohort | null): boolean => cohort === "all" || candidate === cohort;
      const peers = PULSE_DEMO_PEERS.filter((peer) => matches(peer.cohort)).map((peer) => ({
        id: peer.id,
        displayName: peer.public && peer.displayName ? peer.displayName : PULSE_ANONYMOUS_LABEL,
        isMe: false,
        isPublic: peer.public && peer.displayName !== null,
        cohort: peer.cohort,
        ...demoPeerRow(peer, period, now),
      }));
      const rows = matches(state.profile.cohort) ? [...peers, meRow] : peers;
      return { period, cohort, generatedAt: now.toISOString(), isDemo: true, rows: rankRows(rows, PULSE_RULES) };
    },
  };
}

export function createMemoryGamiRepo(options: PulseGamiRepoOptions = {}): PulseGamiRepo {
  return createGamiRepo(options.state ?? emptyPulseGamiState(), () => undefined);
}

export function createStorageGamiRepo(
  storage: PersistenceStorage | null | undefined,
  options: PulseGamiRepoOptions = {},
): PulseGamiRepo {
  if (!storage) return createMemoryGamiRepo(options);
  let initial = options.state;
  if (initial === undefined) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(PULSE_GAMI_STORAGE_KEY);
    } catch {
      raw = null;
    }
    initial = decodePulseGamiState(raw);
  }
  return createGamiRepo(initial, (state) => {
    try {
      storage.setItem(PULSE_GAMI_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Kota ya da erişim hatası: kayıt bu oturumda bellekte kalır.
    }
  });
}

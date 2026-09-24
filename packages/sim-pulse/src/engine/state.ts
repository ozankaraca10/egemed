/* Pulse v6 progress state. Curriculum and session creation stay injected so
   this schema has no global, random, clock, DOM, or authored-data dependency. */
import { LEADS, MODES } from "./shapes";
import type { Lead, Mode } from "./shapes";
import { sample, SESSION_COUNT } from "./sample";
import type { RandomInt } from "./rng";

export { SESSION_COUNT } from "./sample";

export const STATE_VERSION = 6;
export const MAX_STATE_BYTES = 4096;
export const ACTIVE_VIEWS = ["sim", "case", "quiz", "modes", "about", "results", "tutorial", "achievements", "leaderboard"] as const;
export type ActiveView = (typeof ACTIVE_VIEWS)[number];
export type Section = "case" | "quiz";
export interface CurriculumItem { correct: number; ecg: { leads: readonly Lead[] } }
export interface PulseCurriculum {
  version: string | number;
  cases: readonly string[];
  questions: readonly string[];
  byId: Readonly<Record<string, CurriculumItem | undefined>>;
}
export interface Session {
  id: string; ids: string[]; answers: Array<number | null>; submitted: boolean[];
  leadSelections: Lead[][]; interactionIndices: Array<number | null>;
}
export interface PulseState {
  version: 6; mode: Mode; time: number; speed: number; uiScale: number;
  viewed: Record<Mode, number>; caseSession: Session; quizSession: Session;
  bestAttempt: Session | null; bestCaseAttempt: Session | null; leads: [Lead, Lead, Lead];
  activeLead: number; lead: Lead; afProfile: "rapid" | "controlled"; compare: boolean;
  caliper: { a: { x: number; y: number }; b: { x: number; y: number } };
  currentCase: number; quizPage: number; challengeCorrect: { rr: boolean; st: boolean };
  features: Record<string, number>; checklist: Record<string, boolean>; activeView: ActiveView;
  tutorialDone: boolean; learningMs: number; returnContext: { sessionId: string; itemId: string; index: number } | null;
  assessed: boolean; score: number | null; attemptScore: number | null; bestScore: number | null; passed: boolean;
  caseAnswers: Array<number | null>; caseSubmitted: boolean[]; caseCorrect: boolean[];
  answers: Array<number | null>; quizSubmitted: boolean[];
}
export interface StateContext {
  curriculum: PulseCurriculum;
  randomInt: RandomInt;
  previousPassed?: boolean;
}

const FEATURE_KEYS = ["fullscreen", "focus", "compare", "caliper", "guide", "systematic", "cases"] as const;
const GROUPS: readonly (readonly Lead[])[] = [["I", "II", "III"], ["aVR", "aVL", "aVF"], ["V1", "V2", "V3", "V4", "V5", "V6"]];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number, fallback = min): number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : fallback;
const finite = (v: unknown, min: number, max: number, fallback = min): number => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const validMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const byteLength = (value: string): number => [...value].reduce((n, ch) => n + (ch.codePointAt(0)! <= 0x7f ? 1 : ch.codePointAt(0)! <= 0x7ff ? 2 : ch.codePointAt(0)! <= 0xffff ? 3 : 4), 0);

function freshSession(section: Section, ctx: StateContext): Session {
  return sample(section, ctx.curriculum, ctx.randomInt);
}

function validateSession(raw: unknown, section: Section, ctx: StateContext): Session {
  const fresh = freshSession(section, ctx), prefix = section === "case" ? "C" : "Q";
  if (!isRecord(raw) || !Array.isArray(raw.n) || raw.n.length !== SESSION_COUNT) return fresh;
  const ids = raw.n.map((n) => `${prefix}${String(int(n, 1, 200, 0)).padStart(3, "0")}`);
  if (new Set(ids).size !== SESSION_COUNT || ids.some((id) => !ctx.curriculum.byId[id])) return fresh;
  const id = typeof raw.i === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(raw.i) ? raw.i : fresh.id;
  const mask = int(raw.s, 0, 1023, 0);
  const answers = ids.map((_, i) => int(Array.isArray(raw.a) ? raw.a[i] : undefined, 0, 4, -1)).map((n) => n < 0 ? null : n);
  const submitted = ids.map((_, i) => !!(mask & (1 << i)) && answers[i] !== null);
  const leadSelections = ids.map((id, i) => GROUPS.map((group, j) => {
    const idx = int(Array.isArray(raw.l) && Array.isArray(raw.l[i]) ? raw.l[i][j] : undefined, 0, LEADS.length - 1, LEADS.indexOf(ctx.curriculum.byId[id]?.ecg.leads[j] ?? "II"));
    const lead = LEADS[idx]; return lead && group.includes(lead) ? lead : (ctx.curriculum.byId[id]?.ecg.leads[j] ?? "II");
  }));
  const interactions = ids.map((_, i) => { const n = int(Array.isArray(raw.x) ? raw.x[i] : undefined, 0, 2147479999, -1); return n < 0 ? null : n; });
  return { id, ids, answers, submitted, leadSelections, interactionIndices: interactions };
}

export function blank(ctx: StateContext): PulseState {
  const viewed = Object.fromEntries(MODES.map((mode) => [mode, 0])) as Record<Mode, number>;
  const s: PulseState = { version: 6, mode: "normal", time: 2, speed: 1, uiScale: 120, viewed,
    caseSession: freshSession("case", ctx), quizSession: freshSession("quiz", ctx), bestAttempt: null, bestCaseAttempt: null,
    leads: ["II", "aVF", "V3"], activeLead: 0, lead: "II", afProfile: "controlled", compare: false,
    caliper: { a: { x: .06, y: .46 }, b: { x: .25, y: .46 } }, currentCase: 0, quizPage: 0,
    challengeCorrect: { rr: false, st: false }, features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])), checklist: {}, activeView: "modes",
    tutorialDone: false, learningMs: 0, returnContext: null, assessed: false, score: null, attemptScore: null, bestScore: null, passed: false,
    caseAnswers: [], caseSubmitted: [], caseCorrect: [], answers: [], quizSubmitted: [] };
  derive(s, ctx); return s;
}

function correctness(session: Session, ctx: StateContext): boolean[] {
  return session.ids.map((id, i) => session.submitted[i] === true && session.answers[i] === ctx.curriculum.byId[id]?.correct);
}
function completeScore(session: Session, ctx: StateContext): number | null {
  return session.submitted.every(Boolean) ? correctness(session, ctx).filter(Boolean).length * 10 : null;
}

export function derive(s: PulseState, ctx: StateContext): { simComplete: boolean; casesComplete: boolean; casesUnlocked: boolean; quizUnlocked: boolean; passed: boolean } {
  s.caseAnswers = s.caseSession.answers; s.caseSubmitted = s.caseSession.submitted; s.caseCorrect = correctness(s.caseSession, ctx);
  s.answers = s.quizSession.answers; s.quizSubmitted = s.quizSession.submitted; s.assessed = s.quizSubmitted.every(Boolean);
  s.attemptScore = completeScore(s.quizSession, ctx);
  const historical = s.bestAttempt ? completeScore(s.bestAttempt, ctx) : null;
  s.bestScore = Math.max(s.attemptScore ?? -1, historical ?? -1); if (s.bestScore < 0) s.bestScore = null;
  s.score = s.bestScore;
  const simComplete = MODES.every((m) => s.viewed[m] >= 16), casesComplete = s.caseSubmitted.every(Boolean);
  s.passed = (simComplete && (casesComplete || s.bestCaseAttempt?.submitted.every(Boolean) === true) && (s.bestScore ?? 0) >= 80) || ctx.previousPassed === true;
  return { simComplete, casesComplete, casesUnlocked: simComplete, quizUnlocked: simComplete && casesComplete, passed: s.passed };
}

function decodeSession(raw: unknown, section: Section, ctx: StateContext): Session { return validateSession(raw, section, ctx); }
export function decode(input: unknown, ctx: StateContext): PulseState {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (byteLength(input) > MAX_STATE_BYTES) return blank(ctx);
    try { raw = JSON.parse(input) as unknown; } catch { return blank(ctx); }
  }
  const s = blank(ctx);
  if (!isRecord(raw) || !Number.isInteger(raw.version) || (raw.version as number) < 1 || (raw.version as number) > 6) return s;
  const version = raw.version as number;
  if (version < 6) {
    s.mode = validMode(raw.mode) ? raw.mode : "normal"; s.time = finite(raw.time, 0, 36000, 2);
    if (isRecord(raw.viewed)) for (const m of MODES) s.viewed[m] = finite(raw.viewed[m], 0, 16);
    s.afProfile = raw.afProfile === "rapid" ? "rapid" : "controlled";
  } else {
    s.mode = MODES[int(raw.m, 0, MODES.length - 1, 0)] ?? "normal"; s.time = finite(raw.t, 0, 36000, 2);
    s.speed = [0.25, 0.5, 1, 2].includes(raw.p as number) ? raw.p as number : 1;
    s.afProfile = raw.f === 1 ? "rapid" : "controlled";
    MODES.forEach((m, i) => { s.viewed[m] = int(Array.isArray(raw.v) ? raw.v[i] : undefined, 0, 16000, 0) / 1000; });
    s.caseSession = decodeSession(raw.c, "case", ctx); s.quizSession = decodeSession(raw.q, "quiz", ctx);
    const best = decodeSession(raw.b, "quiz", ctx); if (isRecord(raw.b) && best.submitted.every(Boolean)) s.bestAttempt = best;
    const bestCase = decodeSession(raw.bc, "case", ctx); if (isRecord(raw.bc) && bestCase.submitted.every(Boolean)) s.bestCaseAttempt = bestCase;
    s.currentCase = int(raw.j, 0, 9); s.quizPage = int(raw.k, 0, 9);
    const storedView = int(raw.u, 0, ACTIVE_VIEWS.length, 0);
    s.activeView = storedView === 3 ? "sim" : ACTIVE_VIEWS[storedView > 3 ? storedView - 1 : storedView] ?? "sim";
    s.tutorialDone = raw.w === 1;
    if (raw.cv !== ctx.curriculum.version) { s.caseSession = freshSession("case", ctx); s.quizSession = freshSession("quiz", ctx); s.bestAttempt = null; s.bestCaseAttempt = null; }
    s.learningMs = int(raw.z, 0, 31536000000); s.leads = GROUPS.map((group, i) => {
      const fallback = s.leads[i] ?? "II", idx = Array.isArray(raw.d) ? raw.d[i] : undefined, selected = LEADS[int(idx, 0, LEADS.length - 1, LEADS.indexOf(fallback))];
      return selected && group.includes(selected) ? selected : fallback;
    }) as [Lead, Lead, Lead];
    s.activeLead = int(raw.h, 0, 2); s.lead = s.leads[s.activeLead] ?? "II"; s.compare = raw.o === 1;
    FEATURE_KEYS.forEach((key, i) => { s.features[key] = int(Array.isArray(raw.e) ? raw.e[i] : undefined, 0, 99); });
    MODES.forEach((mode, i) => { const mask = int(Array.isArray(raw.y) ? raw.y[i] : undefined, 0, 63); for (let j = 0; j < 6; j += 1) if (mask & (1 << j)) s.checklist[`${mode}:${j}`] = true; });
    if (Array.isArray(raw.g) && raw.g.length === 4) s.caliper = { a: { x: finite(raw.g[0], .02, .98, .06), y: finite(raw.g[1], .04, .96, .46) }, b: { x: finite(raw.g[2], .02, .98, .25), y: finite(raw.g[3], .04, .96, .46) } };
    if (Array.isArray(raw.r) && raw.r.length === 2 && typeof raw.r[0] === "string" && typeof raw.r[1] === "string") {
      const index = s.caseSession.ids.indexOf(raw.r[1]); if (raw.r[0] === s.caseSession.id && index >= 0 && s.caseSession.submitted[index] && s.caseSession.answers[index] === ctx.curriculum.byId[raw.r[1]]?.correct) s.returnContext = { sessionId: raw.r[0], itemId: raw.r[1], index };
    }
  }
  const used = new Set<number>();
  for (const session of [s.caseSession, s.quizSession]) session.interactionIndices = session.interactionIndices.map((n) => n === null || used.has(n) ? null : (used.add(n), n));
  derive(s, ctx); return s;
}

function compactSession(s: Session): Record<string, unknown> {
  return { i: s.id, n: s.ids.map((id) => Number(id.slice(1))), a: s.answers.map((a) => a ?? -1),
    s: s.submitted.reduce((mask, on, i) => mask | (on ? 1 << i : 0), 0), l: s.leadSelections.map((row) => row.map((l) => LEADS.indexOf(l))),
    x: s.interactionIndices.map((n) => n ?? -1) };
}
export function encode(s: PulseState, ctx: StateContext): Record<string, unknown> {
  derive(s, ctx);
  const raw = { version: 6, cv: ctx.curriculum.version, m: MODES.indexOf(s.mode), t: Math.round(s.time * 100) / 100, p: s.speed,
    f: s.afProfile === "rapid" ? 1 : 0, v: MODES.map((m) => Math.round(finite(s.viewed[m], 0, 16) * 1000)), c: compactSession(s.caseSession), q: compactSession(s.quizSession),
    b: s.bestAttempt ? compactSession(s.bestAttempt) : null, bc: s.bestCaseAttempt ? compactSession(s.bestCaseAttempt) : null,
    j: s.currentCase, k: s.quizPage, u: ACTIVE_VIEWS.indexOf(s.activeView) + (ACTIVE_VIEWS.indexOf(s.activeView) > 2 ? 1 : 0), w: s.tutorialDone ? 1 : 0,
    d: s.leads.map((l) => LEADS.indexOf(l)), h: s.activeLead, o: s.compare ? 1 : 0, z: s.learningMs,
    e: FEATURE_KEYS.map((key) => s.features[key] ?? 0), y: MODES.map((m) => [0, 1, 2, 3, 4, 5].reduce((mask, j) => mask | (s.checklist[`${m}:${j}`] ? 1 << j : 0), 0)),
    g: [s.caliper.a.x, s.caliper.a.y, s.caliper.b.x, s.caliper.b.y].map((n) => Math.round(n * 1000) / 1000),
    r: s.returnContext ? [s.returnContext.sessionId, s.returnContext.itemId] : null };
  if (byteLength(JSON.stringify(raw)) > MAX_STATE_BYTES) throw new RangeError("Pulse durum kaydı 4096 baytı aşıyor");
  return raw;
}

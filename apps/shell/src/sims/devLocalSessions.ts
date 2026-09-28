import { ausculta, pulse } from "@egemed/assessment-bank";
import type { AuscultaPublicCase, PulsePublicCase, SimCaseResult, SimId, SimSessionMode } from "@egemed/contracts";
import type { SimSessionSource } from "@egemed/sim-host";

/**
 * YALNIZ GELİŞTİRME (DEV, API yok): sunucu vaka oturumunu tarayıcıda taklit eder.
 * Bu dosya `@egemed/assessment-bank`i (anahtarlı vakalar) içe aktarır; bu yüzden
 * yalnız `import.meta.env.DEV` kapısının ardındaki dinamik `import()` ile yüklenir
 * ve üretim paketine girmez (prod paket testi korur). Anlam API ile aynıdır:
 * sıralı açılış, uygulamada kontrol/ipucu, değerlendirmede geri bildirim sonda.
 */

const AUSCULTA_ASSET_BASE = "/sims/ausculta/";

/**
 * Bu dalın tabanındaki `SimSessionSource` yalnız Ausculta gövdesini tanımlar
 * (A2/A3 istemcileriyle birleşim tipine genişletilecek); Pulse gövdesi bu
 * sınırda daraltılır. Sunucu kaynakları (API) da aynı sınırı kullanır.
 */
function asSourceCase(value: unknown): AuscultaPublicCase {
  return value as AuscultaPublicCase;
}

function token(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `dev${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function random(): number {
  return (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
}

interface DevCase {
  readonly caseId: string;
  keys: ausculta.AuscultaCaseKeys | null;
  checked: Record<string, string[]>;
  hinted: Set<string>;
  result: SimCaseResult | null;
}

interface DevSession {
  readonly mode: "practice" | "assessment";
  readonly cases: DevCase[];
  finished: boolean;
}

export function createDevLocalSessionSource(now: () => number, simId: SimId = "ausculta"): SimSessionSource {
  return simId === "pulse" ? createPulseLocalSessionSource(now) : createAuscultaLocalSessionSource(now);
}

function createAuscultaLocalSessionSource(now: () => number): SimSessionSource {
  const sessions = new Map<string, DevSession>();
  const load = (sessionId: string): DevSession => {
    const session = sessions.get(sessionId);
    if (session === undefined || session.finished) throw new Error("conflict session_finished");
    return session;
  };
  const item = (session: DevSession, index: number): DevCase => {
    const entry = session.cases[index - 1];
    if (entry === undefined) throw new Error("not_found");
    return entry;
  };
  const caseDef = (entry: DevCase) => {
    const found = ausculta.caseById(entry.caseId);
    if (found === undefined) throw new Error("not_found");
    return found;
  };
  const iso = () => new Date(now()).toISOString();

  return {
    async start(mode, options) {
      const focus = options?.focusFinding;
      const ids =
        focus === undefined ? ausculta.selectCaseIds(mode, random) : ausculta.selectCaseIds(mode, random, ausculta.FOCUS_CASE_COUNT, focus);
      if (ids.length === 0) throw new Error("not_found");
      const sessionId = globalThis.crypto.randomUUID();
      sessions.set(sessionId, {
        mode,
        finished: false,
        cases: ids.map((caseId) => ({ caseId, keys: null, checked: {}, hinted: new Set(), result: null })),
      });
      return { sessionId, mode, caseCount: ids.length, perCaseLimitMs: null, totalLimitMs: null, startedAt: iso() };
    },
    async getCase(sessionId, index) {
      const session = load(sessionId);
      const entry = item(session, index);
      const previous = index > 1 ? session.cases[index - 2] : undefined;
      if (previous !== undefined && previous.result === null) throw new Error("conflict case_out_of_order");
      const built = ausculta.buildPublicCase(caseDef(entry), { index, mode: session.mode, openedAt: iso(), newToken: token, random });
      entry.keys = built.keys;
      return built.publicCase;
    },
    async hint(sessionId, index, questionId) {
      const session = load(sessionId);
      if (session.mode !== "practice") throw new Error("forbidden");
      const entry = item(session, index);
      const hint = ausculta.hintFor(caseDef(entry), questionId);
      if (hint === null) throw new Error("not_found");
      entry.hinted.add(questionId);
      return { hint, hintsUsed: entry.hinted.size };
    },
    async check(sessionId, index, questionId, answer) {
      const session = load(sessionId);
      if (session.mode !== "practice") throw new Error("forbidden");
      const entry = item(session, index);
      if (entry.keys === null) throw new Error("conflict case_not_open");
      if (entry.checked[questionId] !== undefined) throw new Error("conflict question_already_checked");
      const feedback = ausculta.checkQuestion(caseDef(entry), entry.keys, questionId, answer);
      if (feedback === null) throw new Error("not_found");
      entry.checked[questionId] = [...answer];
      return feedback;
    },
    async answer(sessionId, index, body) {
      const session = load(sessionId);
      const entry = item(session, index);
      if (entry.keys === null) throw new Error("conflict case_not_open");
      if (entry.result !== null) throw new Error("conflict case_already_answered");
      const answers = { ...body.answers, ...entry.checked };
      entry.result = ausculta.gradeCase(caseDef(entry), entry.keys, {
        index,
        mode: session.mode,
        answers,
        telemetry: body.telemetry,
        hintsUsed: entry.hinted.size,
      });
      return session.mode === "practice" ? { mode: "practice", result: entry.result } : { mode: "assessment", accepted: true };
    },
    async finish(sessionId) {
      const session = load(sessionId);
      const results = session.cases.flatMap((entry) => (entry.result === null ? [] : [entry.result]));
      session.finished = true;
      const total = results.length === 0 ? 0 : Math.round(results.reduce((sum, result) => sum + result.total, 0) / results.length);
      return { mode: session.mode, total, max: 100, passed: total >= ausculta.MASTERY_THRESHOLD, cases: results, xpGained: 0 };
    },
    // Meydan Okuma sunucu ister (iki kullanıcı); DEV yerel kaynakta yoktur.
    async startChallenge() {
      throw new Error("not_found");
    },
    audioUrl(sessionId, audioToken) {
      const session = sessions.get(sessionId);
      const audio = session?.cases.flatMap((entry) => (entry.keys?.audio[audioToken] === undefined ? [] : [entry.keys.audio[audioToken]]))[0];
      return audio === undefined ? "" : `${AUSCULTA_ASSET_BASE}${audio.runtimeUrl}`;
    },
  };
}

/**
 * Pulse yerel kaynağı (A3.3): API Pulse oturumuyla aynı anlam — sıralı açılış,
 * uygulamada tek soruluk kontrol, değerlendirmede geri bildirim bitişte,
 * jetonlar oturum belleğinde çözülür. İpucu/ses/görüntü ucu yoktur.
 */
const DEV_PULSE_QUESTION_ID = pulse.QUESTION_ID;

interface DevPulseCase {
  readonly caseId: string;
  keys: pulse.PulseCaseKeys | null;
  publicCase: PulsePublicCase | null;
  openedAt: number | null;
  checked: Record<string, string[]>;
  answeredAt: number | null;
  result: SimCaseResult | null;
}

interface DevPulseSession {
  readonly mode: SimSessionMode;
  readonly cases: DevPulseCase[];
  finished: boolean;
}

function createPulseLocalSessionSource(now: () => number): SimSessionSource {
  const sessions = new Map<string, DevPulseSession>();
  const load = (sessionId: string): DevPulseSession => {
    const session = sessions.get(sessionId);
    if (session === undefined || session.finished) throw new Error("conflict session_finished");
    return session;
  };
  const item = (session: DevPulseSession, index: number): DevPulseCase => {
    const entry = session.cases[index - 1];
    if (entry === undefined) throw new Error("not_found");
    return entry;
  };
  const caseDef = (entry: DevPulseCase): pulse.PulseItem => {
    const found = pulse.caseById(entry.caseId);
    if (found === undefined) throw new Error("not_found");
    return found;
  };
  const iso = () => new Date(now()).toISOString();
  const limits = (mode: SimSessionMode) =>
    mode === "practice" ? { perCaseLimitMs: null, totalLimitMs: null } : { perCaseLimitMs: 10 * 60 * 1000, totalLimitMs: 60 * 60 * 1000 };

  return {
    async start(mode, options) {
      const focus = options?.focusFinding;
      const ids = focus === undefined ? pulse.selectCaseIds(mode, random) : pulse.selectCaseIds(mode, random, pulse.FOCUS_CASE_COUNT, focus);
      if (ids.length === 0) throw new Error("not_found");
      const sessionId = globalThis.crypto.randomUUID();
      sessions.set(sessionId, {
        mode,
        finished: false,
        cases: ids.map((caseId) => ({ caseId, keys: null, publicCase: null, openedAt: null, checked: {}, answeredAt: null, result: null })),
      });
      const limit = limits(mode);
      return { sessionId, mode, caseCount: ids.length, perCaseLimitMs: limit.perCaseLimitMs, totalLimitMs: limit.totalLimitMs, startedAt: iso() };
    },
    async getCase(sessionId, index) {
      const session = load(sessionId);
      const entry = item(session, index);
      const previous = index > 1 ? session.cases[index - 2] : undefined;
      if (previous !== undefined && previous.answeredAt === null) throw new Error("conflict case_out_of_order");
      if (entry.publicCase !== null) return asSourceCase(entry.publicCase);
      const built = pulse.buildPublicCase(caseDef(entry), { index, mode: session.mode, openedAt: iso(), newToken: token, random });
      entry.keys = built.keys;
      entry.publicCase = built.publicCase;
      entry.openedAt = now();
      return asSourceCase(built.publicCase);
    },
    async hint() {
      throw new Error("not_found");
    },
    async check(sessionId, index, questionId, answer) {
      const session = load(sessionId);
      if (session.mode !== "practice") throw new Error("forbidden");
      const entry = item(session, index);
      if (entry.keys === null || entry.openedAt === null) throw new Error("conflict case_not_open");
      if (questionId !== DEV_PULSE_QUESTION_ID) throw new Error("not_found");
      if (entry.checked[questionId] !== undefined) throw new Error("conflict question_already_checked");
      const feedback = pulse.checkQuestion(caseDef(entry), entry.keys, answer);
      entry.checked[questionId] = [...answer];
      return feedback;
    },
    async answer(sessionId, index, body) {
      const session = load(sessionId);
      const entry = item(session, index);
      if (entry.keys === null || entry.openedAt === null) throw new Error("conflict case_not_open");
      if (entry.answeredAt !== null) throw new Error("conflict case_already_answered");
      const answers = { ...body.answers, ...entry.checked };
      entry.result = pulse.gradeCase(caseDef(entry), entry.keys, { index, mode: session.mode, answers, hintsUsed: 0 });
      entry.answeredAt = now();
      return session.mode === "practice" ? { mode: "practice", result: entry.result } : { mode: "assessment", accepted: true };
    },
    async finish(sessionId) {
      const session = load(sessionId);
      // API gibi: değerlendirmede açılmamış/yanıtlanmamış maddeler sıfır sayılır.
      for (const [position, entry] of session.cases.entries()) {
        if (entry.result !== null || session.mode === "practice") continue;
        if (entry.keys === null) entry.keys = pulse.buildPublicCase(caseDef(entry), { index: position + 1, mode: session.mode, openedAt: iso(), newToken: token, random }).keys;
        entry.result = pulse.gradeCase(caseDef(entry), entry.keys, { index: position + 1, mode: session.mode, answers: {}, hintsUsed: 0 });
      }
      const results = session.cases.flatMap((entry) => (entry.result === null ? [] : [entry.result]));
      if (results.length === 0) throw new Error("validation_failed no_answered_cases");
      session.finished = true;
      const total = Math.round(results.reduce((sum, result) => sum + result.total, 0) / results.length);
      return { mode: session.mode, total, max: 100, passed: total >= pulse.MASTERY_THRESHOLD, cases: results, xpGained: 0 };
    },
    async startChallenge() {
      throw new Error("not_found");
    },
    audioUrl() {
      return "";
    },
  };
}

import type { Context, Hono } from "hono";
import {
  gamiSimIdParamSchema,
  simSessionAnswerRequestSchema,
  simSessionCheckRequestSchema,
  simSessionHintRequestSchema,
  simSessionStartRequestSchema,
  isTimedSessionMode,
  uuidSchema,
  type AuscultaPublicCase,
  type OpacaPublicCase,
  type PulsePublicCase,
  type SimCaseResult,
  type SimId,
  type SimSessionMode,
  type SimTelemetry,
} from "@egemed/contracts";
import { ausculta, opaca, pulse } from "@egemed/assessment-bank";
import { encodeAuscultaSummary, encodeOpacaSummary } from "@egemed/gami-catalogs";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { createLoginRateLimiter } from "../auth/rate-limit";
import { toIstanbulIso } from "../admin/users";
import type { AuthDeps } from "../auth/routes";
import { serverAttemptXp, type GamificationRepo } from "./gamification";
import { hasCompletedLearn, learnRequiredError, type LearnRepo } from "./learn";
import { varyWav } from "./wav";
import { CONSISTENCY_SESSION_COUNT, type IntegritySignalName } from "../integrity/thresholds";
import { buildFlagSignals, computeCaseSignals, integrityScore, isConsistentFast, median, shouldFlag } from "../integrity/signals";
import type { IntegrityRepo } from "../integrity/repo";
import type { CompetitionBansRepo } from "../integrity/bans";

/**
 * A1.3 (ADR-009, docs/specs/A1-sunucu-oturumu.md): sunucu vaka oturumu.
 * Uygulama ve değerlendirme vakaları yalnız sunucuda; istemci anahtarsız görünüm
 * alır, yanıtını opak jetonlarla gönderir, puanı sunucu hesaplar ve denemeyi
 * sunucu yazar (XP/rozet/liderlik ADR-008 yolu). `/me/*` ara katmanından
 * (oturum + CSRF, `meActor`) SONRA kaydedilmelidir.
 */

export const SIM_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const ASSESSMENT_PER_CASE_MS = 10 * 60 * 1000;
export const ASSESSMENT_TOTAL_MS = 60 * 60 * 1000;
export const TIME_GRACE_MS = 5_000;
export const SESSION_START_RATE_MAX = 30;
/** ADR-010: düello — vaka başı 2 dk, toplam 8 dk. */
export const CHALLENGE_PER_CASE_MS = 2 * 60 * 1000;
export const CHALLENGE_TOTAL_MS = 8 * 60 * 1000;

export function limitsFor(mode: SimSessionMode): { readonly perCaseMs: number | null; readonly totalMs: number | null } {
  if (mode === "challenge") return { perCaseMs: CHALLENGE_PER_CASE_MS, totalMs: CHALLENGE_TOTAL_MS };
  if (mode === "assessment") return { perCaseMs: ASSESSMENT_PER_CASE_MS, totalMs: ASSESSMENT_TOTAL_MS };
  return { perCaseMs: null, totalMs: null };
}

/** Tohumlu [0,1) (yalnız seçenek SIRASI için; jetonlar kriptografik kalır). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SESSION_START_WINDOW_MS = 60 * 60 * 1000;
/** A2.2: sunucu oturumu destekleyen simler (A3.2 Pulse ile genişledi). */
const SERVER_SESSION_SIMS: readonly SimId[] = ["ausculta", "opaca", "pulse"];

/** Üç bankanın anahtar tiplerinin birleşimi; jsonb biçimi sim başına değişmez (geriye uyumlu). */
type SimCaseKeys = ausculta.AuscultaCaseKeys | opaca.OpacaCaseKeys | pulse.PulseCaseKeys;
/** Üç bankanın anahtarsız vaka tiplerinin birleşimi. */
type SimPublicCase = AuscultaPublicCase | OpacaPublicCase | PulsePublicCase;

function isAuscultaKeys(keys: SimCaseKeys): keys is ausculta.AuscultaCaseKeys {
  return "audio" in keys;
}

function isOpacaKeys(keys: SimCaseKeys): keys is opaca.OpacaCaseKeys {
  return "images" in keys;
}

/** A3.2: Pulse anahtarı ne ses ne görüntü kaydı taşır; kalan tek banka budur. */
function isPulseKeys(keys: SimCaseKeys): keys is pulse.PulseCaseKeys {
  return !isAuscultaKeys(keys) && !isOpacaKeys(keys);
}

interface QuestionFeedback {
  readonly questionId: string;
  readonly correct: boolean;
  readonly correctOptionIds: string[];
  readonly feedback: string;
}

/**
 * A2.2: vaka bankası yüzeyi — rotalar `bankFor(simId)` ile seçer, `CaseDef`
 * rotalara sızmaz. Anahtarlı işlemler anahtar tipi bankanın kendi tipiyle
 * eşleşmiyorsa null döner (bozuk kayıt sessizce 404 olur).
 */
interface SimBank {
  readonly MASTERY_THRESHOLD: number;
  readonly FOCUS_CASE_COUNT: number;
  selectCaseIds(mode: SimSessionMode, random: () => number, count?: number, focusFinding?: string): string[];
  buildPublicCase(caseId: string, input: ausculta.BuildCaseInput): { readonly publicCase: SimPublicCase; readonly keys: SimCaseKeys } | null;
  gradeCase(caseId: string, keys: SimCaseKeys, input: ausculta.GradeInput): SimCaseResult | null;
  checkQuestion(caseId: string, keys: SimCaseKeys, questionId: string, answer: readonly string[]): QuestionFeedback | null;
  hintFor(caseId: string, questionId: string): string | null;
}

const AUSCULTA_BANK: SimBank = {
  MASTERY_THRESHOLD: ausculta.MASTERY_THRESHOLD,
  FOCUS_CASE_COUNT: ausculta.FOCUS_CASE_COUNT,
  selectCaseIds: ausculta.selectCaseIds,
  buildPublicCase(caseId, input) {
    const caseDef = ausculta.caseById(caseId);
    return caseDef === undefined ? null : ausculta.buildPublicCase(caseDef, input);
  },
  gradeCase(caseId, keys, input) {
    const caseDef = ausculta.caseById(caseId);
    return caseDef === undefined || !isAuscultaKeys(keys) ? null : ausculta.gradeCase(caseDef, keys, input);
  },
  checkQuestion(caseId, keys, questionId, answer) {
    const caseDef = ausculta.caseById(caseId);
    return caseDef === undefined || !isAuscultaKeys(keys) ? null : ausculta.checkQuestion(caseDef, keys, questionId, answer);
  },
  hintFor(caseId, questionId) {
    const caseDef = ausculta.caseById(caseId);
    return caseDef === undefined ? null : ausculta.hintFor(caseDef, questionId);
  },
};

const OPACA_BANK: SimBank = {
  MASTERY_THRESHOLD: opaca.MASTERY_THRESHOLD,
  FOCUS_CASE_COUNT: opaca.FOCUS_CASE_COUNT,
  selectCaseIds: opaca.selectCaseIds,
  buildPublicCase(caseId, input) {
    const caseDef = opaca.caseById(caseId);
    return caseDef === undefined ? null : opaca.buildPublicCase(caseDef, input);
  },
  gradeCase(caseId, keys, input) {
    const caseDef = opaca.caseById(caseId);
    return caseDef === undefined || !isOpacaKeys(keys) ? null : opaca.gradeCase(caseDef, keys, input);
  },
  checkQuestion(caseId, keys, questionId, answer) {
    const caseDef = opaca.caseById(caseId);
    return caseDef === undefined || !isOpacaKeys(keys) ? null : opaca.checkQuestion(caseDef, keys, questionId, answer);
  },
  hintFor(caseId, questionId) {
    const caseDef = opaca.caseById(caseId);
    return caseDef === undefined ? null : opaca.hintFor(caseDef, questionId);
  },
};

const PULSE_BANK: SimBank = {
  MASTERY_THRESHOLD: pulse.MASTERY_THRESHOLD,
  FOCUS_CASE_COUNT: pulse.FOCUS_CASE_COUNT,
  selectCaseIds: pulse.selectCaseIds,
  buildPublicCase(caseId, input) {
    const item = pulse.caseById(caseId);
    return item === undefined ? null : pulse.buildPublicCase(item, input);
  },
  gradeCase(caseId, keys, input) {
    const item = pulse.caseById(caseId);
    return item === undefined || !isPulseKeys(keys) ? null : pulse.gradeCase(item, keys, input);
  },
  checkQuestion(caseId, keys, questionId, answer) {
    const item = pulse.caseById(caseId);
    return item === undefined || questionId !== pulse.QUESTION_ID || !isPulseKeys(keys) ? null : pulse.checkQuestion(item, keys, answer);
  },
  /** A3.2: Pulse'ta ipucu yoktur; uç 404 döner. */
  hintFor() {
    return null;
  },
};

/** Sunucu oturumunda desteklenmeyen sim null döner. */
function bankFor(simId: SimId): SimBank | null {
  if (simId === "ausculta") return AUSCULTA_BANK;
  if (simId === "opaca") return OPACA_BANK;
  if (simId === "pulse") return PULSE_BANK;
  return null;
}

export interface SimCaseState {
  readonly caseId: string;
  publicCase: SimPublicCase | null;
  keys: SimCaseKeys | null;
  openedAt: number | null;
  answeredAt: number | null;
  answers: Record<string, string[]> | null;
  telemetry: SimTelemetry | null;
  hintedQuestions: string[];
  /** Uygulamada kontrol edilip kilitlenen yanıtlar (qid → jetonlar). */
  checked?: Record<string, string[]>;
  heardTokens: string[];
  timedOut: boolean;
  result: SimCaseResult | null;
  /** T283a: yanıt anında hesaplanan davranış sinyalleri (ör. `too_fast`); hiç açılmamış/sentetik puanlanan vakada boş kalır. */
  integritySignals: IntegritySignalName[];
}

export interface SimSessionRow {
  readonly id: string;
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly mode: SimSessionMode;
  status: "open" | "finished" | "expired";
  readonly startedAt: number;
  readonly expiresAt: number;
  finishedAt: number | null;
  /** ADR-010: düelloya ait oturum. */
  readonly challengeId: string | null;
  /** Düelloda iki tarafa aynı seçenek sırası için tohum; diğer modlarda null. */
  readonly state: { readonly cases: SimCaseState[]; readonly shuffleSeed?: number | null; total?: number | null };
  /** T283a: oturum bitişinde bütünlük skoru eşiği aşılırsa `unverified`; ceza değildir, yalnız işarettir. */
  integrityStatus: "unverified" | "verified" | null;
}

export interface SimSessionRepo {
  create(row: SimSessionRow): Promise<void>;
  get(id: string): Promise<SimSessionRow | null>;
  save(row: SimSessionRow): Promise<void>;
  /** Aynı kullanıcı×sim×mod için açık oturumları kapatır (değerlendirmede tek açık oturum). */
  expireOpen(userId: string, simId: SimId, mode: SimSessionMode): Promise<void>;
  /** ADR-010: bir düelloya ait oturumlar. */
  listByChallenge(challengeId: string): Promise<readonly SimSessionRow[]>;
  /** T283a: tutarlılık sinyali için kullanıcının son bitmiş oturumları (bitiş anına göre azalan). */
  listRecentFinished(userId: string, modes: readonly SimSessionMode[], limit: number): Promise<readonly SimSessionRow[]>;
}

export interface SimSessionDeps {
  readonly gamification: GamificationRepo;
  /** T290: uygulama/değerlendirme oturumu öğrenme kilidi kontrolü için (roller `getMeContext` ile okunur). */
  readonly auth: AuthDeps;
  /** T290: öğrenme kilidi — ilgili simin tamamlama kaydı (Meydan Okuma ile aynı depo). */
  readonly learn: LearnRepo;
  readonly sessions: SimSessionRepo;
  /** Çalışma zamanı ses yolunu (örn. `assets/audio/runtime/heart/x.wav`) bayt olarak okur; yoksa null. */
  readonly readAudio: (runtimeUrl: string) => Promise<Uint8Array | null>;
  /** A2.2: Opaca çalışma zamanı görüntü yolunu (örn. `assets/xray/runtime/x.webp`) bayt olarak okur; yoksa null. */
  readonly readImage: (runtimeUrl: string) => Promise<Uint8Array | null>;
  /** Kriptografik rastgele opak jeton (base64url). */
  readonly newToken: () => string;
  /** Kriptografik kaynaklı [0,1). */
  readonly random: () => number;
  readonly newId: () => string;
  /** ADR-010: düello oturumu bitince düello kaydı güncellenir (verilmezse yok sayılır). */
  readonly onFinished?: (row: SimSessionRow, total: number) => Promise<void>;
  /** T283a: davranış sinyali eşiği aşılırsa `integrity_flags`'e yazar. */
  readonly integrity: IntegrityRepo;
  /** T283b: yönetici onaylı rekabet engeli — değerlendirme/düello XP'sini sıfırlar (öğrenme/uygulama etkilenmez). */
  readonly bans: Pick<CompetitionBansRepo, "isActive">;
}

const EMPTY_TELEMETRY: SimTelemetry = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function sessionBody(row: SimSessionRow) {
  const limits = limitsFor(row.mode);
  return {
    sessionId: row.id,
    mode: row.mode,
    caseCount: row.state.cases.length,
    perCaseLimitMs: limits.perCaseMs,
    totalLimitMs: limits.totalMs,
    startedAt: toIstanbulIso(row.startedAt),
  };
}

/** Yeni oturum satırı (doğrudan başlatma ve düello ortak yolu). */
export function newSessionRow(input: {
  readonly id: string;
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly mode: SimSessionMode;
  readonly caseIds: readonly string[];
  readonly at: number;
  readonly challengeId?: string | null;
  readonly shuffleSeed?: number | null;
}): SimSessionRow {
  return {
    id: input.id,
    userId: input.userId,
    institutionId: input.institutionId,
    simId: input.simId,
    mode: input.mode,
    status: "open",
    startedAt: input.at,
    expiresAt: input.at + SIM_SESSION_TTL_MS,
    finishedAt: null,
    challengeId: input.challengeId ?? null,
    integrityStatus: null,
    state: {
      shuffleSeed: input.shuffleSeed ?? null,
      cases: input.caseIds.map((caseId) => ({
        caseId,
        publicCase: null,
        keys: null,
        openedAt: null,
        answeredAt: null,
        answers: null,
        telemetry: null,
        hintedQuestions: [],
        heardTokens: [],
        timedOut: false,
        result: null,
        integritySignals: [],
      })),
    },
  };
}

/** Sunucu saatiyle gerçekten açılıp yanıtlanmış vakaların gecikmeleri (ms); sentetik puanlanan vakalar `openedAt === null` kaldığı için hariç kalır. */
function realCaseLatencies(row: SimSessionRow): number[] {
  return row.state.cases
    .filter((item) => item.openedAt !== null && item.answeredAt !== null)
    .map((item) => (item.answeredAt as number) - (item.openedAt as number));
}

/** Hiç ses jetonu istenmemiş noktanın dinleme beyanı sıfırlanır (çapraz doğrulama). */
function crossCheckTelemetry(telemetry: SimTelemetry, heardPoints: ReadonlySet<string>): SimTelemetry {
  const visits = Object.fromEntries(
    Object.entries(telemetry.visits).map(([pointId, visit]) => [pointId, heardPoints.has(pointId) ? visit : { ...visit, listenMs: 0 }]),
  );
  return { ...telemetry, visits };
}

function heardPointsOf(item: SimCaseState): Set<string> {
  if (item.keys === null || !isAuscultaKeys(item.keys)) return new Set();
  const audio = item.keys.audio;
  return new Set(item.heardTokens.flatMap((token) => (audio[token] === undefined ? [] : [audio[token].pointId])));
}

/** Dinleme telemetrisi çapraz denetimi YALNIZ Ausculta'da (ses jetonu kayıtları) uygulanır. */
function telemetryForGrade(row: SimSessionRow, item: SimCaseState, telemetry: SimTelemetry): SimTelemetry {
  return row.simId === "ausculta" ? crossCheckTelemetry(telemetry, heardPointsOf(item)) : telemetry;
}

function gradeItem(row: SimSessionRow, index: number, item: SimCaseState, answers: Record<string, string[]>, telemetry: SimTelemetry): SimCaseResult | null {
  const bank = bankFor(row.simId);
  if (bank === null || item.keys === null) return null;
  return bank.gradeCase(item.caseId, item.keys, {
    index,
    mode: row.mode,
    answers,
    telemetry: telemetryForGrade(row, item, telemetry),
    hintsUsed: item.hintedQuestions.length,
  });
}

/** Ausculta rozet istatistiği (ADR-008); yalnız Ausculta denemelerinin özetine kodlanır. */
function auscultaSummaryOf(counted: readonly { readonly item: SimCaseState; readonly result: SimCaseResult }[]): Record<string, number> {
  return encodeAuscultaSummary(
    ausculta.auscultaSessionStats(
      counted.flatMap(({ item, result }) => {
        const caseDef = ausculta.caseById(item.caseId);
        return caseDef === undefined ? [] : [{ caseDef, result, telemetry: item.telemetry ?? EMPTY_TELEMETRY, heardPoints: heardPointsOf(item) }];
      }),
    ),
  );
}

/**
 * T235: Opaca rozet özeti — vaka sonuçlarından sunucu kodlar (ADR-008); istemciden
 * hiçbir sayı alınmaz. Yalnız uygulama/değerlendirme yazılır: düello oturumu
 * istemci davranışıyla aynı şekilde istatistiğe girmez.
 */
function opacaSummaryOf(
  counted: readonly { readonly item: SimCaseState; readonly result: SimCaseResult }[],
  session: { readonly mode: "practice" | "assessment"; readonly total: number; readonly startedAt: number; readonly at: number },
): Record<string, number> {
  const stats = opaca.opacaSessionStats(
    counted.flatMap(({ item, result }) => {
      const caseDef = opaca.caseById(item.caseId);
      return caseDef === undefined ? [] : [{ caseDef, result }];
    }),
    { mode: session.mode, score: session.total, durationMs: session.at - session.startedAt },
  );
  return encodeOpacaSummary({
    mode: session.mode,
    finishedAt: toIstanbulIso(session.at),
    score: session.total,
    caseCount: counted.length,
    hintsUsed: counted.reduce((sum, entry) => sum + entry.result.hintsUsed, 0),
    extra: stats,
  });
}

/** A2.2: görüntü vekilinin içerik türü çalışma zamanı yolunun uzantısından belirlenir. */
function imageContentType(runtimeUrl: string): string {
  const lower = runtimeUrl.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/** Açılmış bir vakanın görüntü jetonu → çalışma zamanı yolu; jeton yoksa null. */
function imageRuntimeUrl(row: SimSessionRow, token: string): string | null {
  for (const item of row.state.cases) {
    if (item.openedAt === null || item.keys === null || !isOpacaKeys(item.keys)) continue;
    const runtimeUrl = item.keys.images[token];
    if (runtimeUrl !== undefined) return runtimeUrl;
  }
  return null;
}

export function registerSimSessionRoutes(app: Hono<AppEnv>, deps: SimSessionDeps, now: () => number): void {
  const startRate = createLoginRateLimiter(SESSION_START_RATE_MAX, SESSION_START_WINDOW_MS);

  /** Yol parametrelerini doğrular, oturumu sahibine göre yükler; süresi geçtiyse kapatır. */
  type Loaded = { readonly row: SimSessionRow } | { readonly error: ReturnType<typeof jsonError> };
  async function loadSession(c: Context<AppEnv>): Promise<Loaded> {
    const sim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    const id = uuidSchema.safeParse(c.req.param("sessionId"));
    if (!sim.success || !id.success) return { error: jsonError(c, "not_found") };
    const row = await deps.sessions.get(id.data);
    // Başkasının oturumu varlığını da sızdırmaz: 404.
    if (row === null || row.userId !== c.get("meActor").userId || row.simId !== sim.data) return { error: jsonError(c, "not_found") };
    if (row.status === "open" && now() > row.expiresAt) {
      row.status = "expired";
      await deps.sessions.save(row);
    }
    if (row.status !== "open") return { error: jsonError(c, "conflict", { issues: [{ code: `session_${row.status}` }] }) };
    return { row };
  }

  function parseIndex(c: Context<AppEnv>, row: SimSessionRow): number | null {
    const index = Number(c.req.param("index"));
    return Number.isInteger(index) && index >= 1 && index <= row.state.cases.length ? index : null;
  }

  app.post("/me/sims/:simId/sessions", async (c) => {
    const sim = gamiSimIdParamSchema.safeParse(c.req.param("simId"));
    if (!sim.success || !SERVER_SESSION_SIMS.includes(sim.data)) return jsonError(c, "not_found");
    const bank = bankFor(sim.data);
    if (bank === null) return jsonError(c, "not_found");
    const actor = c.get("meActor");
    if (!actor.simAccess.includes(sim.data)) return jsonError(c, "forbidden");
    const parsed = simSessionStartRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    // T290 — öğrenme kilidi (yalnız uygulama/değerlendirme; bu uç `challenge` modunu kabul etmez).
    // Admin/öğretim üyesi/uzmanlık öğrencisi muaf (istemci `isLearnUnlocked` ile aynı anlam);
    // öğretim üyesi/uzmanlık öğrencisi zaten `gamified=false` ile muaf, admin ayrıca kontrol edilir.
    if (actor.gamified) {
      const context = await deps.auth.users.getMeContext(actor.userId);
      const isAdmin = context?.roles.includes("admin") ?? false;
      if (!isAdmin && !(await hasCompletedLearn(deps.learn, actor.userId, sim.data))) return learnRequiredError(c);
    }
    const at = now();
    if (!startRate.consume(`sim-session:${actor.userId}`, at)) return jsonError(c, "rate_limited");
    if (parsed.data.mode === "assessment") await deps.sessions.expireOpen(actor.userId, sim.data, "assessment");
    const focus = parsed.data.focusFinding;
    const caseIds =
      focus === undefined
        ? bank.selectCaseIds(parsed.data.mode, deps.random)
        : bank.selectCaseIds(parsed.data.mode, deps.random, bank.FOCUS_CASE_COUNT, focus);
    if (caseIds.length === 0) return jsonError(c, "not_found");
    const row = newSessionRow({
      id: deps.newId(),
      userId: actor.userId,
      institutionId: actor.institutionId,
      simId: sim.data,
      mode: parsed.data.mode,
      caseIds,
      at,
    });
    await deps.sessions.create(row);
    return c.json({ data: sessionBody(row) }, 201);
  });

  app.get("/me/sims/:simId/sessions/:sessionId/cases/:index", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    const bank = bankFor(row.simId);
    if (bank === null) return jsonError(c, "not_found");
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.publicCase !== null) return c.json({ data: item.publicCase });
    // Vakalar sırayla açılır: önceki vaka yanıtlanmadan ileri atlanamaz.
    const previous = index > 1 ? row.state.cases[index - 2] : undefined;
    if (previous !== undefined && previous.answeredAt === null) return jsonError(c, "conflict", { issues: [{ code: "case_out_of_order" }] });
    const at = now();
    const limits = limitsFor(row.mode);
    if (limits.totalMs !== null && at - row.startedAt > limits.totalMs + TIME_GRACE_MS) {
      return jsonError(c, "validation_failed", { issues: [{ code: "session_time_exceeded" }] });
    }
    const built = bank.buildPublicCase(item.caseId, {
      index,
      mode: row.mode,
      openedAt: toIstanbulIso(at),
      newToken: deps.newToken,
      // Düelloda iki taraf aynı seçenek sırasını görür (tohum + vaka sırası).
      random: typeof row.state.shuffleSeed === "number" ? seededRandom(row.state.shuffleSeed + index) : deps.random,
    });
    if (built === null) return jsonError(c, "not_found");
    item.publicCase = built.publicCase;
    item.keys = built.keys;
    item.openedAt = at;
    await deps.sessions.save(row);
    return c.json({ data: built.publicCase });
  });

  app.post("/me/sims/:simId/sessions/:sessionId/cases/:index/hint", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    const bank = bankFor(row.simId);
    if (bank === null) return jsonError(c, "not_found");
    if (row.mode !== "practice") return jsonError(c, "forbidden");
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const parsed = simSessionHintRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.openedAt === null || item.answeredAt !== null) return jsonError(c, "conflict", { issues: [{ code: "case_not_open" }] });
    const hint = bank.hintFor(item.caseId, parsed.data.questionId);
    if (hint === null || hint.length === 0) return jsonError(c, "not_found");
    if (!item.hintedQuestions.includes(parsed.data.questionId)) item.hintedQuestions.push(parsed.data.questionId);
    await deps.sessions.save(row);
    return c.json({ data: { hint, hintsUsed: item.hintedQuestions.length } });
  });

  /** Uygulama: tek soru kontrolü — anında geri bildirim; kontrol edilen yanıt kilitlenir. */
  app.post("/me/sims/:simId/sessions/:sessionId/cases/:index/check", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    const bank = bankFor(row.simId);
    if (bank === null) return jsonError(c, "not_found");
    if (row.mode !== "practice") return jsonError(c, "forbidden");
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const parsed = simSessionCheckRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.openedAt === null || item.answeredAt !== null || item.keys === null) return jsonError(c, "conflict", { issues: [{ code: "case_not_open" }] });
    const checked = item.checked ?? {};
    if (checked[parsed.data.questionId] !== undefined) return jsonError(c, "conflict", { issues: [{ code: "question_already_checked" }] });
    const feedback = bank.checkQuestion(item.caseId, item.keys, parsed.data.questionId, parsed.data.answer);
    if (feedback === null) return jsonError(c, "not_found");
    item.checked = { ...checked, [parsed.data.questionId]: [...parsed.data.answer] };
    await deps.sessions.save(row);
    return c.json({ data: feedback });
  });

  app.post("/me/sims/:simId/sessions/:sessionId/cases/:index/answer", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const parsed = simSessionAnswerRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.openedAt === null) return jsonError(c, "conflict", { issues: [{ code: "case_not_open" }] });
    if (item.answeredAt !== null) return jsonError(c, "conflict", { issues: [{ code: "case_already_answered" }] });
    const at = now();
    const perCase = limitsFor(row.mode).perCaseMs;
    const late = perCase !== null && at - item.openedAt > perCase + TIME_GRACE_MS;
    // Süre aşımında yanıt yok sayılır (boş yanıtla puanlanır); oturum sonraki vakayla sürer.
    // Kontrol edilmiş sorularda kilitli yanıt geçerlidir (kontrolden sonra değiştirilemez).
    const answers = late ? {} : { ...parsed.data.answers, ...(item.checked ?? {}) };
    const telemetry = late ? EMPTY_TELEMETRY : parsed.data.telemetry;
    const result = gradeItem(row, index, item, answers, telemetry);
    if (result === null) return jsonError(c, "not_found");
    item.answers = answers;
    item.telemetry = telemetry;
    item.answeredAt = at;
    item.timedOut = late;
    item.result = result;
    // T283a: sunucu saatiyle ölçülen sinyaller — yalnız tespit/işaretleme, bu istekte ceza yok.
    item.integritySignals = computeCaseSignals({
      simId: row.simId,
      mastery: result.mastery,
      latencyMs: at - item.openedAt,
      noListenedPoints: row.simId === "ausculta" && heardPointsOf(item).size === 0,
      integrity: parsed.data.integrity,
    });
    await deps.sessions.save(row);
    if (late) return jsonError(c, "validation_failed", { issues: [{ code: "case_time_exceeded" }] });
    if (row.mode === "practice") return c.json({ data: { mode: "practice" as const, result } });
    return c.json({ data: { mode: row.mode, accepted: true as const } });
  });

  app.post("/me/sims/:simId/sessions/:sessionId/finish", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    const bank = bankFor(row.simId);
    if (bank === null) return jsonError(c, "not_found");
    const at = now();
    const actor = c.get("meActor");
    // Değerlendirmede açılmamış/yanıtlanmamış vakalar sıfır sayılır; uygulamada yalnız yanıtlananlar.
    const counted: { readonly item: SimCaseState; readonly result: SimCaseResult }[] = [];
    row.state.cases.forEach((item, position) => {
      const index = position + 1;
      if (item.result !== null) {
        counted.push({ item, result: item.result });
        return;
      }
      if (!isTimedSessionMode(row.mode)) return;
      if (item.keys === null) {
        const built = bank.buildPublicCase(item.caseId, { index, mode: row.mode, openedAt: toIstanbulIso(at), newToken: deps.newToken, random: deps.random });
        if (built === null) return;
        item.keys = built.keys;
      }
      const result = gradeItem(row, index, item, {}, EMPTY_TELEMETRY);
      if (result !== null) {
        item.result = result;
        counted.push({ item, result });
      }
    });
    if (counted.length === 0) return jsonError(c, "validation_failed", { issues: [{ code: "no_answered_cases" }] });
    const total = Math.round(counted.reduce((sum, entry) => sum + entry.result.total, 0) / counted.length);
    const passed = total >= bank.MASTERY_THRESHOLD;
    const hintsUsed = counted.reduce((sum, entry) => sum + entry.result.hintsUsed, 0);
    let attemptId: string | null = null;
    let xpGained = 0;
    // Öğretim üyesi (T171) ve uzmanlık öğrencisi (T219) oyunlaştırmaya katılmaz: deneme yazılmaz.
    if (actor.gamified) {
      // Rozet özeti sime özgüdür: Ausculta ve Opaca kodlu, Pulse yalnız genel alanlarla yazılır.
      // (Pulse rozet özeti istemci sayaçlarına dayanır — sunucu oturumunda üretilemez, T202 Opaca kararı.)
      const summaryExtra =
        row.simId === "ausculta"
          ? auscultaSummaryOf(counted)
          : row.simId === "opaca" && row.mode !== "challenge"
            ? opacaSummaryOf(counted, { mode: row.mode, total, startedAt: row.startedAt, at })
            : {};
      // T283b: yönetici onaylı rekabet engeli — deneme normal yazılır (öğrenme verisi korunur),
      // yalnız değerlendirme/düello XP'si sıfırlanır (`serverAttemptXp` mode=practice'i muaf tutar).
      const competitionBanned = await deps.bans.isActive(actor.userId);
      const written = await deps.gamification.writeAttempt({
        id: deps.newId(),
        userId: actor.userId,
        simId: row.simId,
        attemptNo: await deps.gamification.nextAttemptNo(actor.userId, row.simId),
        startedAt: row.startedAt,
        finishedAt: at,
        score: total,
        maxScore: 100,
        passed,
        summary: {
          score: total,
          correct: counted.filter((entry) => entry.result.mastery).length,
          total: counted.length,
          ...summaryExtra,
        },
        createdAt: at,
        institutionId: actor.institutionId,
        mode: row.mode,
        caseCount: counted.length,
        hintsUsed,
        competitionBanned,
      });
      if (written.kind === "created" || written.kind === "existing") {
        attemptId = written.attempt.id;
        xpGained = serverAttemptXp({ mode: row.mode, caseCount: counted.length, hintsUsed, score: total, maxScore: 100, passed, competitionBanned });
      }
    }
    // T283a (ADR-009 §6): davranış sinyalleri yalnız burada toplanır ve işaretlenir;
    // puan/XP/rozet/liderlik yukarıdaki bloktan etkilenmez (yalnız tespit).
    const caseSignalLists = row.state.cases.map((item) => item.integritySignals);
    let consistentFast = false;
    if (isTimedSessionMode(row.mode)) {
      const priorRecent = await deps.sessions.listRecentFinished(actor.userId, ["assessment", "challenge"], CONSISTENCY_SESSION_COUNT - 1);
      consistentFast = isConsistentFast([
        { simId: row.simId, correctRate: total, medianLatencyMs: median(realCaseLatencies(row)) },
        ...priorRecent.map((session) => ({
          simId: session.simId,
          correctRate: session.state.total ?? 0,
          medianLatencyMs: median(realCaseLatencies(session)),
        })),
      ]);
    }
    const integrityScoreValue = integrityScore(caseSignalLists, consistentFast);
    const flagged = shouldFlag(integrityScoreValue);
    if (flagged) row.integrityStatus = "unverified";
    row.status = "finished";
    row.finishedAt = at;
    row.state.total = total;
    await deps.sessions.save(row);
    if (flagged) {
      await deps.integrity.write({
        id: deps.newId(),
        sessionId: row.id,
        userId: actor.userId,
        simId: row.simId,
        mode: row.mode,
        score: integrityScoreValue,
        signals: buildFlagSignals(caseSignalLists, consistentFast),
        createdAt: at,
      });
    }
    if (row.challengeId !== null && deps.onFinished !== undefined) await deps.onFinished(row, total);
    return c.json({
      data: {
        mode: row.mode,
        total,
        max: 100,
        passed,
        cases: row.state.cases.flatMap((item) => (item.result === null ? [] : [item.result])),
        attemptId,
        xpGained,
      },
    });
  });

  app.get("/me/sims/:simId/sessions/:sessionId/audio/:token", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    // A3.2: ses vekili yalnız Ausculta'da; Pulse/Opaca oturumunda uç yoktur.
    if (row.simId !== "ausculta") return jsonError(c, "not_found");
    const token = c.req.param("token");
    const item = row.state.cases.find((entry) => entry.openedAt !== null && entry.keys !== null && isAuscultaKeys(entry.keys) && entry.keys.audio[token] !== undefined);
    if (item === undefined || item.keys === null || !isAuscultaKeys(item.keys)) return jsonError(c, "not_found");
    const audio = item.keys.audio[token];
    if (audio === undefined) return jsonError(c, "not_found");
    if (!item.heardTokens.includes(token)) {
      item.heardTokens.push(token);
      await deps.sessions.save(row);
    }
    const bytes = await deps.readAudio(audio.runtimeUrl);
    if (bytes === null) return jsonError(c, "not_found");
    const varied = varyWav(bytes, { offset: deps.random(), gain: 0.92 + deps.random() * 0.16, random: deps.random });
    return c.body(varied as unknown as ArrayBuffer, 200, {
      "content-type": "audio/wav",
      "cache-control": "private, no-store",
    });
  });

  /** A2.2: Opaca görüntü vekili — jeton yalnız AÇILMIŞ bir vakanın `keys.images` kaydında geçerlidir. */
  app.get("/me/sims/:simId/sessions/:sessionId/image/:token", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
    if (row.simId !== "opaca") return jsonError(c, "not_found");
    const runtimeUrl = imageRuntimeUrl(row, c.req.param("token"));
    if (runtimeUrl === null) return jsonError(c, "not_found");
    const bytes = await deps.readImage(runtimeUrl);
    if (bytes === null) return jsonError(c, "not_found");
    // Piksel değişikliği yok: banka görüntüsü bayt olarak aynen döner.
    return c.body(bytes as unknown as ArrayBuffer, 200, {
      "content-type": imageContentType(runtimeUrl),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  });
}

// --- Depolar -------------------------------------------------------------------

export interface SimSessionDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface PgSimSessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly institution_id: string;
  readonly sim_id: SimId;
  readonly mode: SimSessionMode;
  readonly status: SimSessionRow["status"];
  readonly state: SimSessionRow["state"];
  readonly started_at: Date;
  readonly expires_at: Date;
  readonly finished_at: Date | null;
  readonly challenge_id: string | null;
  readonly integrity_status: SimSessionRow["integrityStatus"];
}

export function createPgSimSessionRepo(db: SimSessionDb): SimSessionRepo {
  return {
    async create(row) {
      await db.query(
        `insert into sim_sessions (id, user_id, institution_id, sim_id, mode, status, state, started_at, expires_at, challenge_id)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
        [
          row.id,
          row.userId,
          row.institutionId,
          row.simId,
          row.mode,
          row.status,
          JSON.stringify(row.state),
          new Date(row.startedAt),
          new Date(row.expiresAt),
          row.challengeId,
        ],
      );
    },
    async get(id) {
      const result = await db.query(
        "select id, user_id, institution_id, sim_id, mode, status, state, started_at, expires_at, finished_at, challenge_id, integrity_status from sim_sessions where id = $1",
        [id],
      );
      const row = result.rows[0] as PgSimSessionRow | undefined;
      if (row === undefined) return null;
      return {
        id: row.id,
        userId: row.user_id,
        institutionId: row.institution_id,
        simId: row.sim_id,
        mode: row.mode,
        status: row.status,
        state: row.state,
        startedAt: row.started_at.getTime(),
        expiresAt: row.expires_at.getTime(),
        finishedAt: row.finished_at === null ? null : row.finished_at.getTime(),
        challengeId: row.challenge_id,
        integrityStatus: row.integrity_status,
      };
    },
    async save(row) {
      await db.query("update sim_sessions set status = $2, state = $3::jsonb, finished_at = $4, integrity_status = $5 where id = $1", [
        row.id,
        row.status,
        JSON.stringify(row.state),
        row.finishedAt === null ? null : new Date(row.finishedAt),
        row.integrityStatus,
      ]);
    },
    async listByChallenge(challengeId) {
      const result = await db.query("select id from sim_sessions where challenge_id = $1", [challengeId]);
      const rows = await Promise.all((result.rows as readonly { readonly id: string }[]).map((row) => this.get(row.id)));
      return rows.filter((row): row is SimSessionRow => row !== null);
    },
    async listRecentFinished(userId, modes, limit) {
      const result = await db.query(
        "select id from sim_sessions where user_id = $1 and status = 'finished' and mode = any($2) order by finished_at desc limit $3",
        [userId, modes, limit],
      );
      const rows = await Promise.all((result.rows as readonly { readonly id: string }[]).map((row) => this.get(row.id)));
      return rows.filter((row): row is SimSessionRow => row !== null);
    },
    async expireOpen(userId, simId, mode) {
      await db.query("update sim_sessions set status = 'expired' where user_id = $1 and sim_id = $2 and mode = $3 and status = 'open'", [
        userId,
        simId,
        mode,
      ]);
    },
  };
}

/** Testler ve DB'siz geliştirme için bellek deposu (derin kopya ile). */
export function createMemorySimSessionRepo(): SimSessionRepo & { readonly rows: Map<string, SimSessionRow> } {
  const rows = new Map<string, SimSessionRow>();
  const clone = (row: SimSessionRow): SimSessionRow => JSON.parse(JSON.stringify(row)) as SimSessionRow;
  return {
    rows,
    async create(row) {
      rows.set(row.id, clone(row));
    },
    async get(id) {
      const row = rows.get(id);
      return row === undefined ? null : clone(row);
    },
    async save(row) {
      rows.set(row.id, clone(row));
    },
    async listByChallenge(challengeId) {
      return [...rows.values()].filter((row) => row.challengeId === challengeId).map(clone);
    },
    async listRecentFinished(userId, modes, limit) {
      return [...rows.values()]
        .filter((row) => row.userId === userId && row.status === "finished" && modes.includes(row.mode))
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
        .slice(0, limit)
        .map(clone);
    },
    async expireOpen(userId, simId, mode) {
      for (const row of rows.values()) {
        if (row.userId === userId && row.simId === simId && row.mode === mode && row.status === "open") row.status = "expired";
      }
    },
  };
}

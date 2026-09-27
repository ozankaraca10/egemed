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
  type SimCaseResult,
  type SimId,
  type SimSessionMode,
  type SimTelemetry,
} from "@egemed/contracts";
import { ausculta } from "@egemed/assessment-bank";
import { encodeAuscultaSummary } from "@egemed/gami-catalogs";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { createLoginRateLimiter } from "../auth/rate-limit";
import { toIstanbulIso } from "../admin/users";
import { serverAttemptXp, type GamificationRepo } from "./gamification";
import { varyWav } from "./wav";

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
/** Şimdilik yalnız Ausculta sunucu oturumunda (A2 Opaca, A3 Pulse). */
const SERVER_SESSION_SIMS: readonly SimId[] = ["ausculta"];

export interface SimCaseState {
  readonly caseId: string;
  publicCase: AuscultaPublicCase | null;
  keys: ausculta.AuscultaCaseKeys | null;
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
}

export interface SimSessionRepo {
  create(row: SimSessionRow): Promise<void>;
  get(id: string): Promise<SimSessionRow | null>;
  save(row: SimSessionRow): Promise<void>;
  /** Aynı kullanıcı×sim×mod için açık oturumları kapatır (değerlendirmede tek açık oturum). */
  expireOpen(userId: string, simId: SimId, mode: SimSessionMode): Promise<void>;
  /** ADR-010: bir düelloya ait oturumlar. */
  listByChallenge(challengeId: string): Promise<readonly SimSessionRow[]>;
}

export interface SimSessionDeps {
  readonly gamification: GamificationRepo;
  readonly sessions: SimSessionRepo;
  /** Çalışma zamanı ses yolunu (örn. `assets/audio/runtime/heart/x.wav`) bayt olarak okur; yoksa null. */
  readonly readAudio: (runtimeUrl: string) => Promise<Uint8Array | null>;
  /** Kriptografik rastgele opak jeton (base64url). */
  readonly newToken: () => string;
  /** Kriptografik kaynaklı [0,1). */
  readonly random: () => number;
  readonly newId: () => string;
  /** ADR-010: düello oturumu bitince düello kaydı güncellenir (verilmezse yok sayılır). */
  readonly onFinished?: (row: SimSessionRow, total: number) => Promise<void>;
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
      })),
    },
  };
}

/** Hiç ses jetonu istenmemiş noktanın dinleme beyanı sıfırlanır (çapraz doğrulama). */
function crossCheckTelemetry(telemetry: SimTelemetry, heardPoints: ReadonlySet<string>): SimTelemetry {
  const visits = Object.fromEntries(
    Object.entries(telemetry.visits).map(([pointId, visit]) => [pointId, heardPoints.has(pointId) ? visit : { ...visit, listenMs: 0 }]),
  );
  return { ...telemetry, visits };
}

function heardPointsOf(item: SimCaseState): Set<string> {
  const audio = item.keys?.audio ?? {};
  return new Set(item.heardTokens.flatMap((token) => (audio[token] === undefined ? [] : [audio[token].pointId])));
}

function gradeItem(row: SimSessionRow, index: number, item: SimCaseState, answers: Record<string, string[]>, telemetry: SimTelemetry): SimCaseResult | null {
  const caseDef = ausculta.caseById(item.caseId);
  if (caseDef === undefined || item.keys === null) return null;
  return ausculta.gradeCase(caseDef, item.keys, {
    index,
    mode: row.mode,
    answers,
    telemetry: crossCheckTelemetry(telemetry, heardPointsOf(item)),
    hintsUsed: item.hintedQuestions.length,
  });
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
    const actor = c.get("meActor");
    if (!actor.simAccess.includes(sim.data)) return jsonError(c, "forbidden");
    const parsed = simSessionStartRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const at = now();
    if (!startRate.consume(`sim-session:${actor.userId}`, at)) return jsonError(c, "rate_limited");
    if (parsed.data.mode === "assessment") await deps.sessions.expireOpen(actor.userId, sim.data, "assessment");
    const caseIds = ausculta.selectCaseIds(parsed.data.mode, deps.random);
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
    const caseDef = ausculta.caseById(item.caseId);
    if (caseDef === undefined) return jsonError(c, "not_found");
    const built = ausculta.buildPublicCase(caseDef, {
      index,
      mode: row.mode,
      openedAt: toIstanbulIso(at),
      newToken: deps.newToken,
      // Düelloda iki taraf aynı seçenek sırasını görür (tohum + vaka sırası).
      random: typeof row.state.shuffleSeed === "number" ? seededRandom(row.state.shuffleSeed + index) : deps.random,
    });
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
    if (row.mode !== "practice") return jsonError(c, "forbidden");
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const parsed = simSessionHintRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.openedAt === null || item.answeredAt !== null) return jsonError(c, "conflict", { issues: [{ code: "case_not_open" }] });
    const caseDef = ausculta.caseById(item.caseId);
    const hint = caseDef === undefined ? null : ausculta.hintFor(caseDef, parsed.data.questionId);
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
    if (row.mode !== "practice") return jsonError(c, "forbidden");
    const index = parseIndex(c, row);
    if (index === null) return jsonError(c, "not_found");
    const parsed = simSessionCheckRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const item = row.state.cases[index - 1] as SimCaseState;
    if (item.openedAt === null || item.answeredAt !== null || item.keys === null) return jsonError(c, "conflict", { issues: [{ code: "case_not_open" }] });
    const checked = item.checked ?? {};
    if (checked[parsed.data.questionId] !== undefined) return jsonError(c, "conflict", { issues: [{ code: "question_already_checked" }] });
    const caseDef = ausculta.caseById(item.caseId);
    const feedback = caseDef === undefined ? null : ausculta.checkQuestion(caseDef, item.keys, parsed.data.questionId, parsed.data.answer);
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
    await deps.sessions.save(row);
    if (late) return jsonError(c, "validation_failed", { issues: [{ code: "case_time_exceeded" }] });
    if (row.mode === "practice") return c.json({ data: { mode: "practice" as const, result } });
    return c.json({ data: { mode: row.mode, accepted: true as const } });
  });

  app.post("/me/sims/:simId/sessions/:sessionId/finish", async (c) => {
    const loaded = await loadSession(c);
    if ("error" in loaded) return loaded.error;
    const row = loaded.row;
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
        const caseDef = ausculta.caseById(item.caseId);
        if (caseDef === undefined) return;
        const built = ausculta.buildPublicCase(caseDef, { index, mode: row.mode, openedAt: toIstanbulIso(at), newToken: deps.newToken, random: deps.random });
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
    const passed = total >= ausculta.MASTERY_THRESHOLD;
    const hintsUsed = counted.reduce((sum, entry) => sum + entry.result.hintsUsed, 0);
    let attemptId: string | null = null;
    let xpGained = 0;
    // Öğretim üyesi (T171) oyunlaştırmaya katılmaz: deneme yazılmaz.
    if (actor.gamified) {
      const stats = ausculta.auscultaSessionStats(
        counted.flatMap(({ item, result }) => {
          const caseDef = ausculta.caseById(item.caseId);
          return caseDef === undefined ? [] : [{ caseDef, result, telemetry: item.telemetry ?? EMPTY_TELEMETRY, heardPoints: heardPointsOf(item) }];
        }),
      );
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
          ...encodeAuscultaSummary(stats),
        },
        createdAt: at,
        institutionId: actor.institutionId,
        mode: row.mode,
        caseCount: counted.length,
        hintsUsed,
      });
      if (written.kind === "created" || written.kind === "existing") {
        attemptId = written.attempt.id;
        xpGained = serverAttemptXp({ mode: row.mode, caseCount: counted.length, hintsUsed, score: total, maxScore: 100, passed });
      }
    }
    row.status = "finished";
    row.finishedAt = at;
    row.state.total = total;
    await deps.sessions.save(row);
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
    const token = c.req.param("token");
    const item = row.state.cases.find((entry) => entry.openedAt !== null && entry.keys?.audio[token] !== undefined);
    const audio = item?.keys?.audio[token];
    if (item === undefined || audio === undefined) return jsonError(c, "not_found");
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
        "select id, user_id, institution_id, sim_id, mode, status, state, started_at, expires_at, finished_at, challenge_id from sim_sessions where id = $1",
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
      };
    },
    async save(row) {
      await db.query("update sim_sessions set status = $2, state = $3::jsonb, finished_at = $4 where id = $1", [
        row.id,
        row.status,
        JSON.stringify(row.state),
        row.finishedAt === null ? null : new Date(row.finishedAt),
      ]);
    },
    async listByChallenge(challengeId) {
      const result = await db.query("select id from sim_sessions where challenge_id = $1", [challengeId]);
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
    async expireOpen(userId, simId, mode) {
      for (const row of rows.values()) {
        if (row.userId === userId && row.simId === simId && row.mode === mode && row.status === "open") row.status = "expired";
      }
    },
  };
}

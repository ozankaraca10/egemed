import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";

/**
 * A1 — sunucu oturumu ile vaka çalışması (ADR-009, docs/specs/A1-sunucu-oturumu.md).
 * Uygulama ve değerlendirme vakaları yalnız sunucuda durur; istemciye ANAHTARSIZ
 * görünüm (`PublicCase`) gider. Bu dosyadaki hiçbir istemci yanıt şeması doğru
 * seçeneği, tanıyı, bulgu adını ya da ses dosyası adını taşıyamaz (katı şemalar).
 */

export const SIM_SESSION_MODES = ["practice", "assessment"] as const;
export const simSessionModeSchema = z.enum(SIM_SESSION_MODES);
export type SimSessionMode = z.infer<typeof simSessionModeSchema>;

/** Oturuma bağlı opak jeton (ses, seçenek kimliği): tahmin edilemez, anlam taşımaz. */
export const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const opaqueTokenSchema = z.string().regex(OPAQUE_TOKEN_PATTERN);

export const simSessionStartRequestSchema = z.strictObject({ mode: simSessionModeSchema });

export const simSessionSchema = z.strictObject({
  sessionId: uuidSchema,
  mode: simSessionModeSchema,
  caseCount: z.number().int().min(1).max(20),
  /** Vaka başı süre (ms); uygulamada null. */
  perCaseLimitMs: z.number().int().positive().nullable(),
  /** Toplam süre (ms); uygulamada null. */
  totalLimitMs: z.number().int().positive().nullable(),
  startedAt: isoDateTimeSchema,
});
export const simSessionStartResponseSchema = z.strictObject({ data: simSessionSchema });

// --- Ausculta anahtarsız vaka --------------------------------------------------

export const publicOptionSchema = z.strictObject({ id: opaqueTokenSchema, label: z.string().min(1).max(300) });

export const publicQuestionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  type: z.enum(["single_choice", "multi_choice", "sound_identify", "localization", "bell_diaphragm", "interpretation", "diagnosis", "sequence"]),
  domain: z.enum(["recognition", "localization", "interpretation", "diagnosis", "quality"]),
  prompt: z.string().min(1).max(600),
  help: z.string().max(600).optional(),
  /** Çoklu seçim mi (doğru sayısı açıklanmaz; yalnız tekil/çoğul bilgisi). */
  multiple: z.boolean(),
  /** Uygulamada ipucu istenebilir mi (içerik ayrı uçtan gelir). */
  hintAvailable: z.boolean(),
  options: z.array(publicOptionSchema).min(2).max(12),
});

export const auscultaPublicPointSchema = z.strictObject({
  pointId: z.string().regex(/^[a-z0-9_]{2,40}$/),
  audio: z.strictObject({ bell: opaqueTokenSchema.optional(), diaphragm: opaqueTokenSchema.optional() }),
});

export const auscultaPublicCaseSchema = z.strictObject({
  simId: z.literal("ausculta"),
  index: z.number().int().min(1).max(20),
  /** Genel etiket ("Vaka 3"); gerçek başlık tanıyı ele verebildiği için gitmez. */
  label: z.string().min(1).max(40),
  patient: z.strictObject({ age: z.number().int().min(0).max(120), sex: z.enum(["kadın", "erkek"]) }),
  chiefComplaint: z.string().max(400),
  history: z.string().max(2000),
  vitalSigns: z.strictObject({
    hr: z.number().optional(),
    rr: z.number().optional(),
    bp: z.string().max(20).optional(),
    spo2: z.number().optional(),
    temp: z.string().max(20).optional(),
  }),
  tasks: z.array(z.string().max(300)).max(10),
  views: z.array(z.enum(["front", "back"])).min(1).max(2),
  allowedHeads: z.array(z.enum(["bell", "diaphragm"])).min(1).max(2),
  points: z.array(auscultaPublicPointSchema).max(30),
  questions: z.array(publicQuestionSchema).min(1).max(12),
  technique: z.strictObject({ minPointsVisited: z.number().int().min(0).max(30) }),
  /** Vaka süresi başladığında (ilk okuma). */
  openedAt: isoDateTimeSchema,
});
export const simSessionCaseResponseSchema = z.strictObject({ data: auscultaPublicCaseSchema });
export type AuscultaPublicCase = z.infer<typeof auscultaPublicCaseSchema>;

// --- İpucu, yanıt, bitiş --------------------------------------------------------

export const simSessionHintRequestSchema = z.strictObject({ questionId: publicQuestionSchema.shape.id });
export const simSessionHintResponseSchema = z.strictObject({ data: z.strictObject({ hint: z.string().max(600), hintsUsed: z.number().int().min(0) }) });

/** İstemci telemetrisi (beyan); dinleme, ses jetonu istek kayıtlarıyla çapraz doğrulanır. */
export const simTelemetrySchema = z.strictObject({
  visits: z.record(
    z.string().regex(/^[a-z0-9_]{2,40}$/),
    z.strictObject({
      dwellMs: z.number().int().min(0).max(3_600_000),
      listenMs: z.number().int().min(0).max(3_600_000),
      visits: z.number().int().min(0).max(1000),
      firstOrder: z.number().int().min(0).max(1000),
    }),
  ),
  order: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(200),
  headChanges: z.number().int().min(0).max(1000),
  headUse: z.strictObject({ bell: z.number().int().min(0), diaphragm: z.number().int().min(0) }),
  replayCount: z.number().int().min(0).max(1000),
});

export const simSessionAnswerRequestSchema = z.strictObject({
  answers: z.record(publicQuestionSchema.shape.id, z.array(opaqueTokenSchema).max(12)),
  telemetry: simTelemetrySchema,
});

export const questionFeedbackSchema = z.strictObject({
  questionId: publicQuestionSchema.shape.id,
  correct: z.boolean(),
  /** Doğru seçenekler — YALNIZ yanıttan sonra (uygulama) ya da bitişte (değerlendirme). */
  correctOptionIds: z.array(opaqueTokenSchema),
  feedback: z.string().max(1200),
});

export const caseResultSchema = z.strictObject({
  index: z.number().int().min(1).max(20),
  /** Yanıttan sonra açılan gerçek başlık ve tanı. */
  title: z.string().max(200),
  diagnosis: z.string().max(300).nullable(),
  summary: z.string().max(2000),
  total: z.number().min(0),
  max: z.number().min(0),
  mastery: z.boolean(),
  domains: z.record(z.string(), z.strictObject({ earned: z.number().min(0), max: z.number().min(0) })),
  hintsUsed: z.number().int().min(0),
  questions: z.array(questionFeedbackSchema),
});

export const simSessionAnswerResponseSchema = z.strictObject({
  data: z.union([
    z.strictObject({ mode: z.literal("practice"), result: caseResultSchema }),
    z.strictObject({ mode: z.literal("assessment"), accepted: z.literal(true) }),
  ]),
});

export const simSessionFinishResponseSchema = z.strictObject({
  data: z.strictObject({
    mode: simSessionModeSchema,
    total: z.number().min(0),
    max: z.number().min(0),
    passed: z.boolean(),
    cases: z.array(caseResultSchema),
    /** Sunucunun yazdığı deneme (XP/rozet/liderlik ADR-008 yolu). */
    attemptId: uuidSchema,
    xpGained: z.number().int().min(0),
  }),
});

export type SimSession = z.infer<typeof simSessionSchema>;
export type SimSessionAnswerRequest = z.infer<typeof simSessionAnswerRequestSchema>;
export type SimCaseResult = z.infer<typeof caseResultSchema>;
export type SimTelemetry = z.infer<typeof simTelemetrySchema>;

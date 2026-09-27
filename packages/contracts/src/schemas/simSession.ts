import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";

/**
 * A1 — sunucu oturumu ile vaka çalışması (ADR-009, docs/specs/A1-sunucu-oturumu.md).
 * Uygulama ve değerlendirme vakaları yalnız sunucuda durur; istemciye ANAHTARSIZ
 * görünüm (`PublicCase`) gider. Bu dosyadaki hiçbir istemci yanıt şeması doğru
 * seçeneği, tanıyı, bulgu adını ya da ses dosyası adını taşıyamaz (katı şemalar).
 */

/** `challenge` (ADR-010): Meydan Okuma oturumu — değerlendirme gibi davranır (ipucu yok, geri bildirim sonda). */
export const SIM_SESSION_MODES = ["practice", "assessment", "challenge"] as const;
export const simSessionModeSchema = z.enum(SIM_SESSION_MODES);
export type SimSessionMode = z.infer<typeof simSessionModeSchema>;
/** Değerlendirme benzeri (süreli, ipucusuz, geri bildirim sonda) modlar. */
export function isTimedSessionMode(mode: SimSessionMode): boolean {
  return mode !== "practice";
}

/** Oturuma bağlı opak jeton (ses, seçenek kimliği): tahmin edilemez, anlam taşımaz. */
export const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const opaqueTokenSchema = z.string().regex(OPAQUE_TOKEN_PATTERN);

/** Doğrudan başlatma yalnız uygulama/değerlendirme; düello oturumu `/me/challenges/:id/session` ile açılır. */
export const simSessionStartRequestSchema = z
  .strictObject({
    mode: z.enum(["practice", "assessment"]),
    /** Yalnız uygulama: öğrenme kütüphanesindeki bir bulguya odaklı kısa oturum (ör. "s3"). */
    focusFinding: z.string().regex(/^[a-z0-9_+]{1,60}$/).optional(),
  })
  .refine((value) => value.focusFinding === undefined || value.mode === "practice", { message: "focus_practice_only" });

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
  /** Pediatrik gövde görünümü ve referans kartı için; tanı bilgisi taşımaz. */
  population: z.enum(["pediatrik"]).nullable(),
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
export type AuscultaPublicCase = z.infer<typeof auscultaPublicCaseSchema>;

// --- Opaca anahtarsız vaka (A2.1, ADR-009) -------------------------------------

/** Opaca soru tipleri (sim `QuestionType` ile birebir; film_quality yalnız projeksiyonu sorar). */
export const opacaPublicQuestionSchema = z.strictObject({
  id: publicQuestionSchema.shape.id,
  type: z.enum(["single_choice", "multi_choice", "finding_identify", "localization", "film_quality", "interpretation", "diagnosis", "sequence"]),
  domain: publicQuestionSchema.shape.domain,
  prompt: publicQuestionSchema.shape.prompt,
  help: publicQuestionSchema.shape.help,
  multiple: z.boolean(),
  hintAvailable: z.boolean(),
  /** Lokalizasyon sorusunda seçenek YOK; işaret görüntü üzerine konur. */
  options: z.array(publicOptionSchema).min(0).max(12),
});

/** Stack karesi: pencere ön ayarı + çalışma zamanı jetonları (kare yolu gitmez). */
export const opacaPublicStackSchema = z.strictObject({
  window: z.enum(["lung", "mediastinum"]),
  label: z.string().max(40).optional(),
  frames: z.array(opaqueTokenSchema).min(1).max(400),
});

/** Opaca görüntüsü: kaynak dosya, bulgu, kalite, çözümleme metni ve adres GİTMEZ. */
export const opacaPublicImageSchema = z.strictObject({
  token: opaqueTokenSchema,
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  modality: z.enum(["XR", "CT"]),
  bodyPart: z.enum(["toraks", "boyun"]),
  stack: z.array(opacaPublicStackSchema).max(2).optional(),
});

export const opacaPublicCaseSchema = z.strictObject({
  simId: z.literal("opaca"),
  index: z.number().int().min(1).max(20),
  /** Genel etiket ("Vaka 3"); gerçek başlık tanıyı ele verebildiği için gitmez. */
  label: z.string().min(1).max(40),
  patient: z.strictObject({ age: z.number().int().min(0).max(120).nullable(), sex: z.enum(["kadın", "erkek"]).nullable() }),
  population: z.enum(["pediatrik"]).nullable(),
  chiefComplaint: z.string().max(400),
  history: z.string().max(2000),
  vitalSigns: z.strictObject({
    hr: z.number().optional(),
    rr: z.number().optional(),
    bp: z.string().max(20).optional(),
    spo2: z.number().optional(),
    temp: z.string().max(20).optional(),
  }),
  /** Vaka `objectives` metinleri tanı içerdiğinden gitmez; yalnız genel yönergeler. */
  tasks: z.array(z.string().max(300)).max(10),
  image: opacaPublicImageSchema,
  questions: z.array(opacaPublicQuestionSchema).min(1).max(12),
  technique: z.strictObject({ requiredZoneCount: z.number().int().min(0).max(20), systematicOrder: z.boolean() }),
  /** Vaka süresi başladığında (ilk okuma). */
  openedAt: isoDateTimeSchema,
});
export type OpacaPublicCase = z.infer<typeof opacaPublicCaseSchema>;

const simSessionAnyCaseResponseSchema = z.strictObject({
  data: z.discriminatedUnion("simId", [auscultaPublicCaseSchema, opacaPublicCaseSchema]),
});

/**
 * Sunucunun vaka yanıtı: iki simin de anahtarsız gövdesini doğrular. İstemci
 * tipleri A2.2'ye dek yalnız Ausculta gövdesiyle çalışır (API opaca sunucu
 * oturumu açmaz); bu yüzden dışa vuran tip AuscultaPublicCase olarak kalır ve
 * opaca istemcisiyle birlikte birleşime genişletilir.
 */
export const simSessionCaseResponseSchema = simSessionAnyCaseResponseSchema as unknown as z.ZodType<{
  readonly data: AuscultaPublicCase;
}>;

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

/** Opaca lokalizasyon işareti (`pt:x,y`, normalize 0–1; sim `encodeMark` biçimi). */
export const MARK_ANSWER_PATTERN = /^pt:(0(\.\d{1,4})?|1(\.0{1,4})?),(0(\.\d{1,4})?|1(\.0{1,4})?)$/;
/** Yanıt öğesi: opak seçenek/ses jetonu YA DA lokalizasyon işareti. */
export const simAnswerEntrySchema = z.union([opaqueTokenSchema, z.string().regex(MARK_ANSWER_PATTERN)]);

/** Uygulamada tek soru kontrolü (A1.4): soru kilitlenir, doğru seçenekler açılır. */
export const simSessionCheckRequestSchema = z.strictObject({
  questionId: publicQuestionSchema.shape.id,
  answer: z.array(simAnswerEntrySchema).min(1).max(12),
});

export const simSessionAnswerRequestSchema = z.strictObject({
  answers: z.record(publicQuestionSchema.shape.id, z.array(simAnswerEntrySchema).max(12)),
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
  /** T214: vaka BİTTİKTEN sonra öğrenme kütüphanesi odak anahtarı (ör. "heart.normal").
   *  Yalnız sonuç yanıtında (answer/finish) döner; vaka açılışında (PublicCase) ASLA yoktur.
   *  Opaca sonucu bu alanı taşımayabilir (geriye uyumlu: isteğe bağlı, null olabilir). */
  libraryKey: z.string().regex(/^[a-z0-9_.-]{1,40}$/).nullable().optional(),
});

export const simSessionCheckResponseSchema = z.strictObject({ data: questionFeedbackSchema });

export const simSessionAnswerResponseSchema = z.strictObject({
  data: z.union([
    z.strictObject({ mode: z.literal("practice"), result: caseResultSchema }),
    z.strictObject({ mode: z.enum(["assessment", "challenge"]), accepted: z.literal(true) }),
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
    /** Öğretim üyesinde (oyunlaştırma yok) null. */
    attemptId: uuidSchema.nullable(),
    xpGained: z.number().int().min(0),
  }),
});

export type SimSession = z.infer<typeof simSessionSchema>;
export type SimSessionAnswerRequest = z.infer<typeof simSessionAnswerRequestSchema>;
export type SimCaseResult = z.infer<typeof caseResultSchema>;
export type SimTelemetry = z.infer<typeof simTelemetrySchema>;

// --- Meydan Okuma (ADR-010) ------------------------------------------------------

export const CHALLENGE_CODE_PATTERN = /^[0-9]{6}$/;
export const challengeCreateRequestSchema = z.strictObject({ simId: z.enum(["pulse", "ausculta", "opaca"]) });
export const challengeJoinRequestSchema = z.strictObject({ code: z.string().regex(CHALLENGE_CODE_PATTERN) });
export const CHALLENGE_STATUSES = ["open", "accepted", "finished", "expired"] as const;

export const challengeParticipantSchema = z.strictObject({
  role: z.enum(["inviter", "opponent"]),
  /** Görünen ad yalnız düellonun iki tarafına döner (arama/liste yok, KVKK). */
  displayName: z.string().max(120),
  isMe: z.boolean(),
  finished: z.boolean(),
  /** İki taraf da bitirene dek null (sonuç erken sızmaz). */
  score: z.number().min(0).max(100).nullable(),
  durationMs: z.number().int().min(0).nullable(),
});

export const challengeSchema = z.strictObject({
  challengeId: uuidSchema,
  simId: z.enum(["pulse", "ausculta", "opaca"]),
  status: z.enum(CHALLENGE_STATUSES),
  /** Yalnız davet edene ve yalnız açıkken döner. */
  code: z.string().regex(CHALLENGE_CODE_PATTERN).nullable(),
  caseCount: z.number().int().min(1).max(20),
  perCaseLimitMs: z.number().int().positive(),
  totalLimitMs: z.number().int().positive(),
  expiresAt: isoDateTimeSchema,
  participants: z.array(challengeParticipantSchema).max(2),
  /** İki taraf bitirince: önce doğru (puan), eşitlikte kısa süre; berabere null. */
  winner: z.enum(["inviter", "opponent", "draw"]).nullable(),
  /** Bu kullanıcının bu düellodaki oturumu (varsa). */
  mySessionId: uuidSchema.nullable(),
});
export const challengeResponseSchema = z.strictObject({ data: challengeSchema });
export const challengeListResponseSchema = z.strictObject({ data: z.array(challengeSchema) });
export type ChallengeBody = z.infer<typeof challengeSchema>;

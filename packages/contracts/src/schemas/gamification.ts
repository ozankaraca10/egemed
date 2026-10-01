import { z } from "zod";
import { SIM_IDS } from "../ids";
import {
  BADGE_KEY_PATTERN,
  CODE_PATTERN,
  isoDateSchema,
  isoDateTimeSchema,
  pageMetaSchema,
  pageSizeSchema,
  simIdSchema,
} from "./common";

export const GAMI_PERIODS = ["today", "week", "month", "academic_year"] as const;
export const GAMI_COHORTS = [1, 2, 3, 4, 5, 6] as const;

/** GET /me/gamification/:simId — sim başına ayrı özet; ham yanıt alanı yoktur. */
export const gamiStreakSchema = z.strictObject({
  current: z.number().int().min(0),
  best: z.number().int().min(0),
  lastDate: isoDateSchema.nullable(),
});

export const gamiWeeklyGoalSchema = z.strictObject({
  targetXp: z.number().int().min(0),
  currentXp: z.number().int().min(0),
});

export const gamiBadgeSchema = z.strictObject({
  key: z.string().regex(BADGE_KEY_PATTERN),
  awardedAt: isoDateTimeSchema,
});

export const gamiBadgeProgressSchema = z.strictObject({
  value: z.number().int().min(0),
  max: z.number().int().min(0),
});

export const gamiLeaderboardSchema = z.strictObject({
  rank: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const gamiAttemptSummarySchema = z.strictObject({
  attemptNo: z.number().int().min(1),
  finishedAt: isoDateTimeSchema,
  score: z.number().int().min(0).nullable(),
  maxScore: z.number().int().min(0).nullable(),
  passed: z.boolean().nullable(),
});

export const gamiSimSummarySchema = z.strictObject({
  simId: simIdSchema,
  xp: z.number().int().min(0),
  level: z.number().int().min(1),
  streak: gamiStreakSchema,
  weeklyGoal: gamiWeeklyGoalSchema,
  badges: z.array(gamiBadgeSchema),
  badgeProgress: z.record(z.string().regex(BADGE_KEY_PATTERN), gamiBadgeProgressSchema).optional(),
  leaderboard: gamiLeaderboardSchema,
  attempts: z.array(gamiAttemptSummarySchema),
});

export type GamiSimSummary = z.infer<typeof gamiSimSummarySchema>;

export const gamiSummaryResponseSchema = z.strictObject({ data: gamiSimSummarySchema });

export type GamiSummaryResponse = z.infer<typeof gamiSummaryResponseSchema>;

/** GET /me/gamification: üç simin ayrı özeti; birleşik/türetilmiş puan yok
 *  (ADR-006/007 izolasyonu). Aynı sim iki kez dönemez. `competitionBanned`
 *  T283b (ADR-009 §6): yönetici onaylı rekabet engeli, yalnız bilgi amaçlı
 *  (istemci arayüzü T283d'de). */
export const gamiAllResponseSchema = z.strictObject({
  data: z.strictObject({
    // Sunucu her zaman yazar; eski sabit (fixture) veri kırılmasın diye şemada opsiyonel.
    competitionBanned: z.boolean().optional(),
    sims: z
      .array(gamiSimSummarySchema)
      .max(SIM_IDS.length)
      .refine((sims) => new Set(sims.map((sim) => sim.simId)).size === sims.length, {
        message: "duplicate_sim_id",
      }),
  }),
});

export type GamiAllResponse = z.infer<typeof gamiAllResponseSchema>;

/** Tek denemenin kodlu özet sayısı: negatif XP yok; tavan tek oturum için makul. */
export const ATTEMPT_SUMMARY_MAX = 1_000_000;

/** Kodlu özet: anahtar kod, değer sınırlı tam sayı; serbest metin ve ham yanıt yasak. */
/** T149: özet en fazla bu kadar kod taşır (sim kodları ~25; depolama şişirmesine karşı). */
export const ATTEMPT_SUMMARY_MAX_KEYS = 64;

export const attemptSummarySchema = z
  .record(z.string().regex(CODE_PATTERN), z.number().int().min(0).max(ATTEMPT_SUMMARY_MAX))
  .refine((summary) => Object.keys(summary).length <= ATTEMPT_SUMMARY_MAX_KEYS, {
    message: "summary_too_many_keys",
  });

/**
 * A4 (ADR-009) — `POST /me/gamification/:simId/attempts` artık PUANLI deneme kabul
 * etmez: uygulama/değerlendirme/düello denemesini sunucu oturumu yazar. Gövde yalnız
 * puansız öğrenme kaydıdır (hangi içerik incelendi); skor, doğru sayısı, mod veya özet
 * alanı yoktur ve XP sunucu kuralıyla sabit verilir (istemci beyanı hiç okunmaz).
 */
export const LEARN_TOPIC_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,119}$/;

export const learnTopicSchema = z.string().regex(LEARN_TOPIC_PATTERN);

/** Sim ad alanlı öğrenme anahtarı (ör. `pulse:mode:af`, `opaca:topic:finding.pleura`). */
export const learnWriteRequestSchema = z.strictObject({
  topic: learnTopicSchema,
});

export type LearnWriteRequest = z.infer<typeof learnWriteRequestSchema>;

/** Öğrenme kaydı yanıtı: XP yalnız sunucu kuralından; ilk kayıtta > 0, idempotent tekrarda 0. */
export const learnRecordResponseSchema = z.strictObject({
  data: z.strictObject({
    simId: simIdSchema,
    topic: learnTopicSchema,
    recordedAt: isoDateTimeSchema,
    xpGained: z.number().int().min(0),
  }),
});

export type LearnRecordResponse = z.infer<typeof learnRecordResponseSchema>;

/** Yol parametresi: bilinmeyen sim 404 (E3 §d). */
export const gamiSimIdParamSchema = simIdSchema;

export const gamiPeriodSchema = z.enum(GAMI_PERIODS);
export type GamiPeriod = z.infer<typeof gamiPeriodSchema>;

export const gamiCohortSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type GamiCohort = z.infer<typeof gamiCohortSchema>;

export const gamiCohortFilterSchema = z.union([z.literal("all"), gamiCohortSchema]);
export type GamiCohortFilter = z.infer<typeof gamiCohortFilterSchema>;

/** GET /me/gamification/:simId/leaderboard sorgusu. */
export const gamiLeaderboardQuerySchema = z.strictObject({
  period: gamiPeriodSchema.default("month"),
  cohort: z
    .union([z.literal("all"), z.coerce.number().pipe(gamiCohortSchema)])
    .default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: pageSizeSchema.default(50),
});
export type GamiLeaderboardQuery = z.infer<typeof gamiLeaderboardQuerySchema>;

/** Liderlik satırı kimliği opaktır; başka kullanıcının UUID'si dönmez. */
export const gamiLeaderboardRowIdSchema = z.string().min(1).max(64);

/** Görünen ad yalnız baş harf veya anonim etiket olabilir. */
export const gamiLeaderboardDisplayNameSchema = z.string().min(1).max(32);

export const gamiLeaderboardRowSchema = z.strictObject({
  id: gamiLeaderboardRowIdSchema,
  displayName: gamiLeaderboardDisplayNameSchema,
  isMe: z.boolean(),
  isPublic: z.boolean(),
  cohort: gamiCohortSchema.nullable(),
  periodScore: z.number().nullable(),
  attemptsCount: z.number().int().min(0),
  reachedAt: isoDateTimeSchema.nullable(),
  totalXp: z.number().int().min(0),
  level: z.number().int().min(1),
  rank: z.number().int().min(1).nullable(),
});

export type GamiLeaderboardRow = z.infer<typeof gamiLeaderboardRowSchema>;

export const gamiLeaderboardDataSchema = z.strictObject({
  period: gamiPeriodSchema,
  cohort: gamiCohortFilterSchema,
  generatedAt: isoDateTimeSchema,
  isDemo: z.literal(false),
  rows: z.array(gamiLeaderboardRowSchema),
});

export const gamiLeaderboardResponseSchema = z.strictObject({
  data: gamiLeaderboardDataSchema,
  meta: pageMetaSchema,
});

export type GamiLeaderboardResponse = z.infer<typeof gamiLeaderboardResponseSchema>;

/** GET/PATCH /me/preferences: liderlik tablosuna katılım (kullanıcı kararı, üç simde ortak). */
export const mePreferencesSchema = z.strictObject({
  leaderboardVisible: z.boolean(),
});

export type MePreferences = z.infer<typeof mePreferencesSchema>;

export const mePreferencesResponseSchema = z.strictObject({
  data: mePreferencesSchema,
});

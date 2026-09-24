import { z } from "zod";
import { SIM_IDS } from "../ids";
import {
  BADGE_KEY_PATTERN,
  CODE_PATTERN,
  isoDateSchema,
  isoDateTimeSchema,
  simIdSchema,
  uuidSchema,
} from "./common";

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
  leaderboard: gamiLeaderboardSchema,
  attempts: z.array(gamiAttemptSummarySchema),
});

export type GamiSimSummary = z.infer<typeof gamiSimSummarySchema>;

export const gamiSummaryResponseSchema = z.strictObject({ data: gamiSimSummarySchema });

export type GamiSummaryResponse = z.infer<typeof gamiSummaryResponseSchema>;

/** GET /me/gamification: üç simin ayrı özeti; birleşik/türetilmiş puan yok
 *  (ADR-006/007 izolasyonu). Aynı sim iki kez dönemez. */
export const gamiAllResponseSchema = z.strictObject({
  data: z.strictObject({
    sims: z
      .array(gamiSimSummarySchema)
      .max(SIM_IDS.length)
      .refine((sims) => new Set(sims.map((sim) => sim.simId)).size === sims.length, {
        message: "duplicate_sim_id",
      }),
  }),
});

export type GamiAllResponse = z.infer<typeof gamiAllResponseSchema>;

/** Kodlu özet: anahtar kod, değer sayı; serbest metin ve ham yanıt yasak. */
export const attemptSummarySchema = z.record(
  z.string().regex(CODE_PATTERN),
  z.number().int(),
);

/** POST /me/gamification/:simId/attempts gövdesi (E3 §d): `id` istemci üretir,
 *  yazma idempotenttir; bilinmeyen alanlar (serbest metin/ham yanıt) reddedilir. */
export const attemptWriteRequestSchema = z
  .strictObject({
    id: uuidSchema,
    attemptNo: z.number().int().min(1),
    startedAt: isoDateTimeSchema,
    finishedAt: isoDateTimeSchema,
    score: z.number().int().min(0).nullable().optional(),
    maxScore: z.number().int().min(0).nullable().optional(),
    passed: z.boolean().optional(),
    summary: attemptSummarySchema,
  })
  .refine((value) => value.score == null || value.maxScore == null || value.score <= value.maxScore, {
    message: "score_exceeds_max",
    path: ["score"],
  });

export type AttemptWriteRequest = z.infer<typeof attemptWriteRequestSchema>;

/** Yol parametresi: bilinmeyen sim 404 (E3 §d). */
export const gamiSimIdParamSchema = simIdSchema;

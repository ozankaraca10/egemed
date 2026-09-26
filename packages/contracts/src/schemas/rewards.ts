import { z } from "zod";
import { isoDateTimeSchema, simIdSchema } from "./common";

/**
 * Aylık ödüller (26 Eylül 2026): admin panelinden sim × ay başına yönetilir.
 * Ödül sim kapsamlıdır; simler arası ödül veya birleşik sıralama yoktur (ADR-006).
 */
export const REWARD_MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
export const rewardMonthSchema = z.string().regex(REWARD_MONTH_PATTERN);
export const REWARD_COHORTS = [1, 2, 3, 4, 5, 6] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const rewardEligibilitySchema = z.strictObject({
  cohorts: z
    .array(z.number().int().min(1).max(6))
    .min(1)
    .max(6)
    .refine((value) => new Set(value).size === value.length, { message: "duplicate_cohort" }),
  minAssessments: z.number().int().min(0).max(100),
  requirePublicName: z.boolean(),
});

/** PUT /admin/rewards/:simId/:month gövdesi. */
export const rewardUpsertRequestSchema = z.strictObject({
  title: text(160),
  description: text(800),
  sponsor: text(160),
  winnersCount: z.number().int().min(1).max(10),
  eligibility: rewardEligibilitySchema,
  terms: z.array(text(300)).max(20),
});

export const rewardWinnerSchema = z.strictObject({
  month: rewardMonthSchema,
  rank: z.number().int().min(1).max(10),
  displayName: z.string().min(1).max(120),
  score: z.number().min(0).max(100),
  isMe: z.boolean(),
});

export const rewardSchema = z.strictObject({
  simId: simIdSchema,
  month: rewardMonthSchema,
  title: z.string(),
  description: z.string(),
  sponsor: z.string(),
  winnersCount: z.number().int(),
  eligibility: rewardEligibilitySchema,
  terms: z.array(z.string()),
  finalizedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

/** GET /admin/rewards — kurumun ödülleri, en yeni ay önce. */
export const adminRewardListResponseSchema = z.strictObject({
  data: z.array(rewardSchema.extend({ winners: z.array(rewardWinnerSchema) })),
});

/**
 * GET /me/rewards/:simId — içinde bulunulan ayın ödülü (yoksa önceki ayın
 * yapılandırması aynı koşullarla geçerlidir) ve son ayların kazananları.
 */
export const meRewardResponseSchema = z.strictObject({
  data: z.strictObject({
    current: rewardSchema.nullable(),
    winners: z.array(rewardWinnerSchema),
  }),
});

export type RewardUpsertRequest = z.infer<typeof rewardUpsertRequestSchema>;
export type RewardBody = z.infer<typeof rewardSchema>;
export type RewardWinnerBody = z.infer<typeof rewardWinnerSchema>;

/** GET /me/rewards — ana sayfa vitrini: erişilen her sim için ayrı blok (birleştirme yok). */
export const meRewardsOverviewResponseSchema = z.strictObject({
  data: z.strictObject({
    sims: z.array(
      z.strictObject({
        simId: simIdSchema,
        current: rewardSchema.nullable(),
        lastMonthWinners: z.array(rewardWinnerSchema),
      }),
    ),
  }),
});

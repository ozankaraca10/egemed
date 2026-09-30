import { z } from "zod";
import { gamiStreakSchema } from "./gamification";
import { simIdSchema, uuidSchema } from "./common";

const count = z.number().int().min(0);
const simOverviewSchema = z.strictObject({
  accessUsers: count,
  activeUsers30d: count,
  attemptsThisMonth: z.strictObject({ practice: count, assessment: count }),
  learnCompleted: count,
  openChallenges: count,
  currentReward: z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), title: z.string() }).nullable(),
});

export const adminOverviewResponseSchema = z.strictObject({
  data: z.strictObject({
    users: z.strictObject({
      total: count,
      byStatus: z.strictObject({ invited: count, active: count, suspended: count }),
      byRole: z.strictObject({ admin: count, kullanici: count, ogretim_uyesi: count, uzmanlik_ogrencisi: count }),
    }),
    loginsLast7Days: count,
    pendingImports: count,
    sims: z.strictObject({ pulse: simOverviewSchema, ausculta: simOverviewSchema, opaca: simOverviewSchema }),
  }),
});

export const adminHealthResponseSchema = z.strictObject({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "down"]),
  lrs: z.enum(["ok", "down", "not_configured"]),
  version: z.string().min(1),
});

export const adminGamiSummaryResponseSchema = z.strictObject({
  data: z.strictObject({
    sims: z.array(z.strictObject({
      simId: simIdSchema,
      xp: count,
      level: z.number().int().min(1),
      streak: gamiStreakSchema,
    })).max(3).refine((sims) => new Set(sims.map((sim) => sim.simId)).size === sims.length, { message: "duplicate_sim_id" }),
  }),
});

export const adminAuditRowSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  actorUserId: uuidSchema.nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  summaryBefore: z.record(z.string(), z.string()).nullable(),
  summaryAfter: z.record(z.string(), z.string()).nullable(),
  requestId: z.string().nullable(),
  actorName: z.string().nullable().optional(),
  targetName: z.string().nullable().optional(),
});

export const adminAuditListResponseSchema = z.strictObject({
  data: z.array(adminAuditRowSchema),
  meta: z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() }).nullable(),
});

export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;
export type AdminHealthResponse = z.infer<typeof adminHealthResponseSchema>;
export type AdminGamiSummaryResponse = z.infer<typeof adminGamiSummaryResponseSchema>;
export type AdminAuditListResponse = z.infer<typeof adminAuditListResponseSchema>;

import { z } from "zod";

/**
 * T283b — yönetici karar ucu (`POST /admin/integrity/:flagId/decision`,
 * ADR-009 §6): `pending` bir işareti temizler ya da onaylar. Onay yönetici
 * kararıyla rekabet engeli açar (otomatik ceza yok). `note` yalnız yöneticinin
 * kendi notudur; kişisel veri taşımaz (KVKK, operasyonel kural).
 */
export const integrityDecisionSchema = z.enum(["cleared", "confirmed"]);

export const integrityDecisionRequestSchema = z.strictObject({
  decision: integrityDecisionSchema,
  note: z.string().trim().min(1).max(500).optional(),
});

export type IntegrityDecision = z.infer<typeof integrityDecisionSchema>;
export type IntegrityDecisionRequest = z.infer<typeof integrityDecisionRequestSchema>;

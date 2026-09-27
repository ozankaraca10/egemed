import { z } from "zod";
import { isoDateTimeSchema } from "./common";

/**
 * Öğrenme tamamlama kaydı (depo sahibi kararı, 27 Eylül 2026). Üç simde de
 * öğrenme modu bitmeden uygulama/değerlendirme ve meydan okuma kilitlidir;
 * "öğrenme bitti" tespitini sim paketleri yapar, sunucu yalnız kaydı tutar.
 * `completedAt` ilk tamamlanma anıdır (Europe/Istanbul ofsetli ISO); yeniden
 * tamamlamada korunur, yalnız içerik sürümü güncellenir.
 */

export const learnSimStatusSchema = z.strictObject({
  complete: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
});

export type LearnSimStatus = z.infer<typeof learnSimStatusSchema>;

/** GET /me/learn yanıtı: üç simin AYRI durumu (birleşik gösterge yok). */
export const learnStatusSchema = z.strictObject({
  data: z.strictObject({
    sims: z.strictObject({
      pulse: learnSimStatusSchema,
      ausculta: learnSimStatusSchema,
      opaca: learnSimStatusSchema,
    }),
  }),
});

export type LearnStatusResponse = z.infer<typeof learnStatusSchema>;
export type LearnStatus = LearnStatusResponse["data"]["sims"];

/** İçerik sürümü biçimi (011 `sim_learn_completions.content_version` CHECK'i ile aynı). */
export const LEARN_CONTENT_VERSION_PATTERN = /^[a-z0-9._-]{1,40}$/;

export const learnCompleteRequestSchema = z.strictObject({
  contentVersion: z.string().regex(LEARN_CONTENT_VERSION_PATTERN),
});

export type LearnCompleteRequest = z.infer<typeof learnCompleteRequestSchema>;

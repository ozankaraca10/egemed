import type { SimId } from "@egemed/contracts";

/**
 * T283a (ADR-009 §6 ek sertleştirme, depo sahibi kararı 30 Eyl 2026): sunucu
 * davranış sinyali eşikleri ve ağırlıkları TEK burada toplanır. Değerler ilk
 * kalibrasyondur (kullanım verisiyle T283b'de ayarlanacak); adlandırılmış
 * sabitler olarak tutulur ki tek yerden değişsin.
 */

/** Vaka türüne göre "insan altı" yanıt süresi alt sınırı (ms). Altında + doğru yanıt → too_fast. */
export const TOO_FAST_THRESHOLD_MS: Readonly<Record<SimId, number>> = {
  pulse: 4_000,
  opaca: 5_000,
  ausculta: 6_000,
};

/** tab_hidden: sekme/uygulama değişimi sayısı VE toplam gizli süre (ms) birlikte eşiği aşmalı. */
export const TAB_HIDDEN_MIN_COUNT = 1;
export const TAB_HIDDEN_MIN_MS = 3_000;

/** blur_many: pencere odak kaybı sayısı eşiği. */
export const BLUR_MANY_MIN_COUNT = 3;

/** paste: yapıştırma olayı eşiği (tek olay yeterli). */
export const PASTE_MIN_COUNT = 1;

/** Tutarlılık sinyali: kaç ardışık oturum, hangi doğruluk yüzdesi ve gecikme çarpanı. */
export const CONSISTENCY_SESSION_COUNT = 3;
export const CONSISTENCY_MIN_CORRECT_RATE = 90;
export const CONSISTENCY_LATENCY_MULTIPLIER = 1.5;

/** Sinyal adları: `too_fast` ve `no_interaction_correct` ağır; diğerleri hafif (plan §3). */
export const SIGNAL_WEIGHTS = {
  too_fast: 3,
  no_interaction_correct: 3,
  tab_hidden: 1,
  blur_many: 1,
  paste: 1,
  consistent_fast: 8,
} as const;

export type IntegritySignalName = keyof typeof SIGNAL_WEIGHTS;

/** Bu skoru eşitleyen/aşan oturum `unverified` işaretlenir ve `integrity_flags`'e yazılır. */
/** Skor 10 vaka başınadır: ör. 10 vakanın 3'ünde too_fast (9) ya da tutarlılık sinyali (8) işaretler;
 *  2 vakada too_fast (6) işaretlemez. */
export const INTEGRITY_FLAG_SCORE_THRESHOLD = 8;

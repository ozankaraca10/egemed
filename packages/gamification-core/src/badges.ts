/** EGEMED — jenerik rozet motoru: katalog + durum → yeni kazanılan rozetler.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/badges.ts.
 *  Opaca'ya özgü rozet tanımları (bulgu, lokalizasyon, ABCDE vb.) ve eşikleri çekirdeğe GİRMEZ;
 *  her sim kendi `BadgeDef[]` kataloğunu ve eşiklerini taşır. `state`/`ctx` sim'e göre
 *  tip parametresidir; `ctx.now` zorunludur (Date.now() çağrılmaz). */

import type { EarnedBadge } from "./types";

export type BadgeCategory = "topic" | "skill" | "streak" | "learn" | "milestone" | "challenge";
export type BadgeTier = "bronze" | "silver" | "gold";

export interface BadgeProgress {
  value: number;
  max: number;
}

/** Değerlendirme bağlamı; sim'ler ek alanlarla genişletir (`TContext extends BadgeContext`). */
export interface BadgeContext {
  now: Date;
}

export type BadgePredicate<TState, TContext extends BadgeContext> = (state: TState, ctx: TContext) => boolean;
export type BadgeProgressFn<TState, TContext extends BadgeContext> = (state: TState, ctx: TContext) => BadgeProgress;

/** Tek rozet tanımı. Kazanım kuralı: `predicate` varsa yalnız o belirler; yoksa `progress`
 *  tamamlandığında (max > 0 ve value ≥ max) kazanılır — kaynak davranışı. İkisi de yoksa
 *  rozet asla kazanılmaz ve görünümde 0/1 kilitli kalır (ör. yalnız demo akranlarla gösterilen rozet). */
export interface BadgeDef<TState, TContext extends BadgeContext = BadgeContext> {
  id: string;
  category: BadgeCategory;
  tier?: BadgeTier;
  icon?: string;
  name: string;
  description: string;
  /** Kilitli kartın alt satırı: kısa koşul (ör. "10 isabet"). */
  rule?: string;
  /** Sim'in kendi anahtar uzayında "bu rozeti çalış" hedefi (ör. kütüphane maddesi anahtarı). */
  studyKey?: string | null;
  predicate?: BadgePredicate<TState, TContext>;
  progress?: BadgeProgressFn<TState, TContext>;
}

/** Rozet kazanılmış mı — `predicate` önceliklidir, yoksa `progress` tamamlanması sayılır. */
export function isBadgeEarned<TState, TContext extends BadgeContext>(
  def: BadgeDef<TState, TContext>,
  state: TState,
  ctx: TContext,
): boolean {
  if (def.predicate) return def.predicate(state, ctx);
  if (def.progress) {
    const { value, max } = def.progress(state, ctx);
    return max > 0 && value >= max;
  }
  return false;
}

/** Görünüm için ilerleme; `progress` yoksa kazanımdan 0/1 türetilir. */
export function badgeProgress<TState, TContext extends BadgeContext>(
  def: BadgeDef<TState, TContext>,
  state: TState,
  ctx: TContext,
): BadgeProgress {
  if (def.progress) return def.progress(state, ctx);
  return { value: isBadgeEarned(def, state, ctx) ? 1 : 0, max: 1 };
}

/** Yalnız YENİ kazanılan rozetleri döner; `prevEarned` içindekiler yeniden değerlendirilmez
 *  (rozet geri alınmaz ve yeniden verilmez). `at` damgası `ctx.now`'dur. Çağıran taraf
 *  `[...prevEarned, ...yeniler]` birleştirerek kalıcı hâle getirir. */
export function evaluateBadges<TState, TContext extends BadgeContext>(
  catalog: readonly BadgeDef<TState, TContext>[],
  state: TState,
  prevEarned: readonly EarnedBadge[],
  ctx: TContext,
): EarnedBadge[] {
  const prevIds = new Set(prevEarned.map((e) => e.id));
  const at = ctx.now.toISOString();
  const newlyEarned: EarnedBadge[] = [];
  for (const def of catalog) {
    if (prevIds.has(def.id)) continue;
    if (isBadgeEarned(def, state, ctx)) newlyEarned.push({ id: def.id, at });
  }
  return newlyEarned;
}

/**
 * Ziyaretçi (hesapsız) kitle için içerik kilidi — saf modül (T173).
 *
 * Depo sahibi kararı (26 Eylül 2026): İnceleme modunda yalnız Normal sinüs
 * ritmi + Atriyal fibrilasyon + ST elevasyonlu MI açıktır; `../engine/shapes`
 * içindeki diğer tüm EKG sonuçları (`MODES`) kilitlidir. Kimlik listesi
 * sabit ve açıktır (id ile); UI bu modülü sorgular, kilit mantığını kendi
 * içinde tutmaz.
 */
import type { Mode } from "../engine/shapes";

/** Ziyaretçiye açık İnceleme modu EKG sonuçları (sabit, id ile). */
export const VISITOR_UNLOCKED_LEARN_ITEMS: readonly Mode[] = ["normal", "af", "stemi"];

/** `itemId` bir İnceleme modu EKG sonucu kimliğidir; ziyaretçiye açıksa `true`. */
export function isVisitorUnlockedItem(itemId: string): boolean {
  return (VISITOR_UNLOCKED_LEARN_ITEMS as readonly string[]).includes(itemId);
}

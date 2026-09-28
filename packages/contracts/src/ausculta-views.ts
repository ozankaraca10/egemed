/**
 * T233 — Ausculta gövde görünümü (ön/arka) izin kuralı. Depo sahibi kararı
 * (28 Eyl 2026): yalnız kalp sesi olan vaka/öğe ÖN görünümde, yalnız akciğer
 * sesi olan ARKA görünümde açılır; karma içerikte iki görünüm de açıktır.
 * Hiçbir durumda dinlenecek noktası olmayan görünüm sunulmaz.
 *
 * Kural TEK saf fonksiyon olarak burada yaşar; hem sunucu bankası
 * (`@egemed/assessment-bank`) hem istemci (`@egemed/sim-ausculta`) aynı
 * uygulamayı kullanır. Sıra her zaman kanoniktir: ön → arka.
 */

export type AuscultaView = "front" | "back";

export type AuscultaViewCategory = "heart" | "lung" | "mixed";

/** Kural tercih sırası: heart → {front}, lung → {back}, mixed → {front, back}.
 *  `category` serbest metin kabul eder (kütüphane kategori alanı); heart/lung
 *  dışındaki her değer karma sayılır. */
export function preferredAuscultaViews(category: string): readonly AuscultaView[] {
  if (category === "heart") return ["front"];
  if (category === "lung") return ["back"];
  return ["front", "back"];
}

/** Vaka kategorisi atamalarından türetilir: tüm atamalar aynı kategoriyse o
 *  kategori, değilse `mixed`. Boş liste `mixed` sayılır. */
export function auscultaViewCategory(categories: readonly string[]): AuscultaViewCategory {
  const unique = [...new Set(categories)];
  const only = unique[0];
  if (unique.length === 1 && (only === "heart" || only === "lung")) return only;
  return "mixed";
}

/** İzinli görünümler: `preferred ∩ presentable`; boşsa `presentable`; o da
 *  boşsa vakanın bildirdiği görünümler. Örnek: değerlendirmede posterior
 *  plevral sürtünme vakası O7 süzgeciyle arka boşalırsa ön açılır. */
export function allowedAuscultaViews(
  category: string,
  presentableViews: readonly AuscultaView[],
  declaredViews: readonly AuscultaView[],
): AuscultaView[] {
  const present = new Set(presentableViews);
  const preferred = preferredAuscultaViews(category).filter((view) => present.has(view));
  if (preferred.length > 0) return preferred;
  const fallback = (["front", "back"] as const).filter((view) => present.has(view));
  if (fallback.length > 0) return [...fallback];
  return [...new Set(declaredViews)];
}

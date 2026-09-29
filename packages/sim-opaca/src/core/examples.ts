import type { LibraryItem } from "../data/terminology";
import { examplesFor } from "./images";
import type { ImageRecord } from "./types";
import { zoneSetForImage } from "../data/zones";

/** Öğrenme kütüphanesi örnek film seçimi (T218: LearnScreen'den taşındı) — saf hesap:
 *  DOM/React yok. Kilit açılabilirliği bu fonksiyonun her öğe için en az bir örnek
 *  döndürmesine bağlıdır (`learn-lock` testi bunu doğrular). */

/** BT yığını: kutulu kareler önce, sonra kutusuzlar, en son yığın olmayanlar. */
const ctRank = (r: ImageRecord): number => (r.stack?.length ? (r.annotations.length ? 0 : 1) : 2);

const byCtRank = (list: ImageRecord[]): ImageRecord[] => [...list].sort((a, b) => ctRank(a) - ctRank(b));

function topicExamples(it: LibraryItem): ImageRecord[] {
  if (it.group === "ct") {
    const ct = examplesFor(null, undefined, { modality: "CT" });
    const stacks = byCtRank(ct.filter((r) => r.stack?.length));
    const pair = ["commons_ct_axial_lung_window", "commons_ct_axial_mediastinal_window"]
      .map((id) => ct.find((r) => r.id === id))
      .filter((r): r is ImageRecord => !!r);
    return it.key === "ct.windows" ? [...stacks, ...pair] : [...stacks, ...pair.slice(0, 1)];
  }
  const all = examplesFor(it.finding, undefined, { includePediatric: it.group === "pediatric" });
  if (it.finding === null) return all.filter((r) => r.sourceDataset !== "wikimedia-commons");
  const ct = byCtRank(examplesFor(it.finding, undefined, { modality: "CT" }));
  if (!ct.length) return all;
  const ctShown = all.length ? ct.slice(0, 2) : ct;
  return [...all.slice(0, 24 - ctShown.length), ...ctShown, ...all.slice(24 - ctShown.length)];
}

/** Öğrenme ekranının örnek film listesi (en fazla 24); boşsa konu için görüntü yoktur. */
export function libraryExamples(item: LibraryItem): ImageRecord[] {
  if (item.key === "technique.projection") {
    const pa = examplesFor(null, "PA");
    const ap = examplesFor(null, "AP");
    const out: ImageRecord[] = [];
    for (let i = 0; i < Math.max(pa.length, ap.length) && out.length < 12; i++) {
      const p = pa[i];
      const a = ap[i];
      if (p) out.push(p);
      if (a) out.push(a);
    }
    return out;
  }
  if (item.key === "technique.lateral") {
    return examplesFor(null, undefined, { includePediatric: true }).filter((image) => zoneSetForImage(image.id) === "lateral").slice(0, 24);
  }
  return topicExamples(item).slice(0, 24);
}

/** Kütüphane listesindeki "Örnek film sayısı" rozeti (tam sayım, 24 ile sınırlanmaz). */
export function libraryExampleCount(item: LibraryItem): number {
  if (item.key === "technique.projection") return examplesFor(null, "PA").length + examplesFor(null, "AP").length;
  if (item.key === "technique.lateral") {
    return examplesFor(null, undefined, { includePediatric: true }).filter((image) => zoneSetForImage(image.id) === "lateral").length;
  }
  return topicExamples(item).length;
}

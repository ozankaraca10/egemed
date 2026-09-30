/**
 * EGEMED Ausculta — rozet kataloğu, istatistik ve kodlu deneme özeti (ADR-008).
 *
 * Saf modül: sim (yerel ekranlar) ve API (sunucu rozet değerlendirmesi) aynı
 * kaynağı kullanır. Kodlu özet, rozet istatistiğinin tek kaynağıdır; ham
 * öğrenci yanıtını içermez (KVKK). Ausculta istatistiği yerel depoda
 * birikimlidir; deneme özeti kayıt anındaki birikimli anlık görüntüyü taşır,
 * bu yüzden özet kodları toplam yerine en büyük değerle birleşir.
 */
import type { BadgeDef, BadgeProgress, BadgeTier } from "@egemed/gamification-core";
import { EMPTY_DUEL_STATS, duelBadges } from "./duel";

/** Kalp konuları — sim `AuscultaStats.heartCorrect` anahtarlarıyla aynı sıra (test eşitliği doğrular). */
export const AUSCULTA_HEART_TOPICS = ["normal", "extraSounds", "murmurTiming", "rhythm"] as const;
export type HeartTopic = (typeof AUSCULTA_HEART_TOPICS)[number];

/** Akciğer konuları — sim `AuscultaStats.lungCorrect` anahtarlarıyla aynı sıra (test eşitliği doğrular). */
export const AUSCULTA_LUNG_TOPICS = ["vesicular", "continuous", "crackles", "pleuralRub"] as const;
export type LungTopic = (typeof AUSCULTA_LUNG_TOPICS)[number];

/** Rozet eşikleri — sim `AUSCULTA_RULES.badges` ile aynı (test eşitliği doğrular). */
export const AUSCULTA_BADGE_RULES = {
  listenDiscipline: [3, 8, 20],
  systematic: [1, 5, 15],
  cardiacFoci: 5,
  posteriorLung: 5,
  heartNormal: 3,
  extraHeartSounds: 3,
  murmurTiming: 5,
  rhythmFindings: 3,
  vesicular: 3,
  continuousAdventitious: 5,
  crackles: 5,
  pleuralRub: 3,
  pediatric: 5,
  mixed: 3,
  headChoice: 5,
} as const;

export interface AuscultaStats {
  listenDisciplineCases: number;
  systematicExams: number;
  cardiacFociExams: number;
  posteriorLungExams: number;
  heartCorrect: Record<HeartTopic, number>;
  lungCorrect: Record<LungTopic, number>;
  pediatricCorrect: number;
  mixedCorrect: number;
  headChoiceCorrect: number;
  correctDiagnosisCount?: number;
}

const progress = (value: number, max: number): BadgeProgress => ({ value, max });
const b = AUSCULTA_BADGE_RULES;

const countBadge = (
  id: string,
  name: string,
  description: string,
  rule: string,
  category: "skill" | "topic",
  icon: string,
  read: (s: AuscultaStats) => number,
  max: number,
  tier?: BadgeTier,
): BadgeDef<AuscultaStats> => ({
  id,
  category,
  ...(tier ? { tier } : {}),
  icon,
  name,
  description,
  rule,
  progress: (s) => progress(read(s), max),
});

const tiered = (
  id: string,
  name: string,
  tier: BadgeTier,
  description: string,
  max: number,
  read: (s: AuscultaStats) => number,
): BadgeDef<AuscultaStats> =>
  countBadge(id, name, description, `${max} vaka`, "skill", tier === "gold" ? "Clock" : "Stethoscope", read, max, tier);

/** En az bir doğru ayırt edilmiş konu sayısı ("tüm konular" rozetleri için). */
const coveredTopics = (record: Record<string, number>): number =>
  Object.values(record).filter((hits) => (hits ?? 0) > 0).length;

const duel = duelBadges<AuscultaStats>(() => EMPTY_DUEL_STATS);
const duelBronze = duel.filter((badge) => badge.tier === "bronze");
const duelSilver = duel.filter((badge) => badge.tier === "silver");
const duelGold = duel.filter((badge) => badge.tier === "gold");

/**
 * T277 — katalog 40'a tamamlandı, eski kimlikler korundu. Şu rozetler GEÇİCİdir
 * (mevcut eşik zincirlerinin uzantısı; rozet seti simülatörler bitince baştan tasarlanacak):
 * listen-30, systematic-25, diagnosis-5/10, murmur-timing-10, lung-crackles-10,
 * posterior-lung-10, head-choice-10, heart-topics, lung-topics.
 * "gercek-rozet" 40. rozettir (capstone) ve kalıcıdır. Sıra kolaydan zora: kademe bandı içinde
 * eşik artan; düello rozetleri kendi kademelerine karışır.
 */
export const AUSCULTA_BADGES: BadgeDef<AuscultaStats>[] = [
  // Bronz: tek adım / en düşük eşikler.
  tiered("systematic-1", "Sıralı muayene", "bronze", "Bir vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[0], (s) => s.systematicExams),
  countBadge("heart-normal", "S1 ve S2", "Normal kalp seslerini (S1–S2) doğru ayırt et. Kapak tanısı sayılmaz.", "3 vaka", "topic", "Heart", (s) => s.heartCorrect.normal, b.heartNormal),
  countBadge("heart-extra", "Ek kalp sesleri", "S3 veya S4 sesini doğru ayırt et. Kalp yetersizliği tanısı sayılmaz.", "3 vaka", "topic", "Heart", (s) => s.heartCorrect.extraSounds, b.extraHeartSounds),
  countBadge("rhythm-findings", "Ritim ile uyumlu sesler", "Atriyal fibrilasyon, taşikardi veya AV blok ile uyumlu sesi doğru ayırt et.", "3 vaka", "topic", "Activity", (s) => s.heartCorrect.rhythm, b.rhythmFindings),
  countBadge("lung-vesicular", "Veziküler solunum", "Normal veziküler solunum sesini doğru ayırt et.", "3 vaka", "topic", "Lungs", (s) => s.lungCorrect.vesicular, b.vesicular),
  countBadge("pleural-rub", "Plevral frotman", "Plevral frotmanı diğer akciğer seslerinden ayırt et.", "3 vaka", "topic", "Lungs", (s) => s.lungCorrect.pleuralRub, b.pleuralRub),
  countBadge("mixed-sounds", "Kalp ve akciğer birlikte", "Aynı vakada hem kalp hem akciğer ses sınıfını doğru ayırt et.", "3 vaka", "topic", "Stethoscope", (s) => s.mixedCorrect, b.mixed),
  tiered("listen-3", "Kısa dinleme", "bronze", "Üç vakada zorunlu noktaların her birini vakanın asgari dinleme süresi kadar dinle.", b.listenDiscipline[0], (s) => s.listenDisciplineCases),
  countBadge("diagnosis-3", "Tanı eşleştirmesi", "Tanı sorularında üç doğru yanıt ver.", "3 doğru tanı", "skill", "Check", (s) => s.correctDiagnosisCount ?? 0, 3),
  countBadge(
    "cardiac-foci",
    "Dört kapak odağı",
    "Aort, pulmoner, triküspit ve mitral odaklarının her birinde asgari süre dinlenen beş muayene. Erb noktası bu koşula girmez.",
    "5 muayene",
    "skill",
    "Heart",
    (s) => s.cardiacFociExams,
    b.cardiacFoci,
  ),
  countBadge(
    "posterior-lung",
    "Arka akciğer alanları",
    "Arka yüzdeki sağ ve sol üst, orta ve alt noktaların altısını da asgari süre dinlenen beş muayene.",
    "5 muayene",
    "skill",
    "Lungs",
    (s) => s.posteriorLungExams,
    b.posteriorLung,
  ),
  countBadge("murmur-timing", "Üfürüm zamanı", "Sistolik veya diyastolik üfürümün zamanlamasını doğru ayırt et. Kapak lezyonu tanısı sayılmaz.", "5 vaka", "topic", "Heart", (s) => s.heartCorrect.murmurTiming, b.murmurTiming),
  countBadge("lung-continuous", "Sürekli ek sesler", "Wheezing (hışıltı) veya ronküsü doğru ayırt et. Hava yolu tanısı sayılmaz.", "5 vaka", "topic", "Lungs", (s) => s.lungCorrect.continuous, b.continuousAdventitious),
  countBadge("lung-crackles", "Kesintili raller", "İnce veya kaba rali doğru ayırt et. Pnömoni tanısı sayılmaz.", "5 vaka", "topic", "Lungs", (s) => s.lungCorrect.crackles, b.crackles),
  countBadge("pediatric", "Pediatrik vakalar", "Pediatrik işaretli beş vakada akustik bulguyu doğru tanı.", "5 vaka", "topic", "User", (s) => s.pediatricCorrect, b.pediatric),
  countBadge("head-choice", "Bell ve diyafram", "Düşük ve yüksek frekans için bell veya diyafram seçimini doğru yap.", "5 doğru", "skill", "Stethoscope", (s) => s.headChoiceCorrect, b.headChoice),
  ...duelBronze,
  // Gümüş: orta eşikler.
  tiered("systematic-5", "Sistematik oskültasyon", "silver", "Beş vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[1], (s) => s.systematicExams),
  tiered("listen-8", "Süreli dinleme", "silver", "Sekiz vakada zorunlu noktaların her birini vakanın asgari dinleme süresi kadar dinle.", b.listenDiscipline[1], (s) => s.listenDisciplineCases),
  countBadge("diagnosis-5", "Tanı deneyimi", "Tanı sorularında beş doğru yanıt ver.", "5 doğru tanı", "skill", "Check", (s) => s.correctDiagnosisCount ?? 0, 5, "silver"),
  ...duelSilver,
  // Altın: yüksek eşikler.
  tiered("systematic-15", "Düzenli odak sırası", "gold", "On beş vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[2], (s) => s.systematicExams),
  tiered("listen-20", "Dinleme disiplini", "gold", "Yirmi vakada zorunlu noktaların her birini vakanın asgari dinleme süresi kadar dinle.", b.listenDiscipline[2], (s) => s.listenDisciplineCases),
  tiered("listen-30", "Dinleme ustası", "gold", "Otuz vakada zorunlu noktaların her birini vakanın asgari dinleme süresi kadar dinle.", 30, (s) => s.listenDisciplineCases),
  tiered("systematic-25", "Sistematik ustalık", "gold", "Yirmi beş vakada tanımlı odak sırasını eksiksiz tamamla.", 25, (s) => s.systematicExams),
  countBadge("murmur-timing-10", "Üfürüm ustalığı", "Sistolik veya diyastolik üfürümün zamanlamasını on vakada doğru ayırt et. Kapak lezyonu tanısı sayılmaz.", "10 vaka", "topic", "Heart", (s) => s.heartCorrect.murmurTiming, 10, "gold"),
  countBadge("lung-crackles-10", "Rali ustalığı", "İnce veya kaba raliyi on vakada doğru ayırt et. Pnömoni tanısı sayılmaz.", "10 vaka", "topic", "Lungs", (s) => s.lungCorrect.crackles, 10, "gold"),
  countBadge("posterior-lung-10", "Arka alan ustalığı", "Arka yüzdeki altı noktayı da asgari süre dinlenen on muayene.", "10 muayene", "skill", "Lungs", (s) => s.posteriorLungExams, 10, "gold"),
  countBadge("head-choice-10", "Bell ve diyafram ustalığı", "Düşük ve yüksek frekans için bell veya diyafram seçimini on kez doğru yap.", "10 doğru", "skill", "Stethoscope", (s) => s.headChoiceCorrect, 10, "gold"),
  countBadge("diagnosis-10", "Tanı uzmanı", "Tanı sorularında on doğru yanıt ver.", "10 doğru tanı", "skill", "Check", (s) => s.correctDiagnosisCount ?? 0, 10, "gold"),
  ...duelGold,
  // "Tümü" türü: her konuda en az bir doğru.
  countBadge("heart-topics", "Tüm kalp konuları", "Dört kalp sesi konusunun her birinde en az bir doğru ayırt et.", "4 konu", "topic", "Heart", (s) => coveredTopics(s.heartCorrect), AUSCULTA_HEART_TOPICS.length, "gold"),
  countBadge("lung-topics", "Tüm akciğer konuları", "Dört akciğer sesi konusunun her birinde en az bir doğru ayırt et.", "4 konu", "topic", "Lungs", (s) => coveredTopics(s.lungCorrect), AUSCULTA_LUNG_TOPICS.length, "gold"),
  {
    id: "gercek-rozet",
    category: "milestone",
    tier: "gold",
    icon: "Medal",
    name: "Gerçek Rozet",
    description: "Bu simülatördeki 39 rozetin tamamını topla.",
    rule: "39 rozetin tümü",
    capstone: true,
  },
];

/** Kod sözlüğü v1. Kod ekle/çıkar = sürüm değişikliği (`ausculta.v`). */
export const AUSCULTA_SUMMARY_VERSION = 1;

/** Kod anahtarları ASCII küçük harftir (CODE_PATTERN); sim konu kimlikleri kökte kalır. */
const topicCode = (topic: string): string => topic.toLowerCase();

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : 0)));

/** Birikimli istatistik kodlarının üst sınırı; kodlar sınırlı tam sayıdır. */
const COUNT_MAX = 100_000;

/** Birikimli istatistiği sözleşmedeki kodlu özete çevirir (kod → sınırlı tam sayı; serbest metin yok). */
export function encodeAuscultaSummary(stats: AuscultaStats): Record<string, number> {
  const summary: Record<string, number> = {
    "ausculta.v": AUSCULTA_SUMMARY_VERSION,
    "ausculta.listen": clampInt(stats.listenDisciplineCases, 0, COUNT_MAX),
    "ausculta.sys": clampInt(stats.systematicExams, 0, COUNT_MAX),
    "ausculta.foci": clampInt(stats.cardiacFociExams, 0, COUNT_MAX),
    "ausculta.post": clampInt(stats.posteriorLungExams, 0, COUNT_MAX),
    "ausculta.ped": clampInt(stats.pediatricCorrect, 0, COUNT_MAX),
    "ausculta.mixed": clampInt(stats.mixedCorrect, 0, COUNT_MAX),
    "ausculta.head": clampInt(stats.headChoiceCorrect, 0, COUNT_MAX),
    "ausculta.diag": clampInt(stats.correctDiagnosisCount ?? 0, 0, COUNT_MAX),
  };
  for (const topic of AUSCULTA_HEART_TOPICS) {
    const hits = clampInt(stats.heartCorrect[topic] ?? 0, 0, COUNT_MAX);
    if (hits > 0) summary[`ausculta.h.${topicCode(topic)}`] = hits;
  }
  for (const topic of AUSCULTA_LUNG_TOPICS) {
    const hits = clampInt(stats.lungCorrect[topic] ?? 0, 0, COUNT_MAX);
    if (hits > 0) summary[`ausculta.l.${topicCode(topic)}`] = hits;
  }
  return summary;
}

/** Kodlu özetlerden rozet istatistiği; bilinmeyen/bozuk kodlar yok sayılır. */
export function auscultaStatsFromSummaries(
  summaries: readonly Readonly<Record<string, number>>[],
): AuscultaStats {
  let listenDisciplineCases = 0;
  let systematicExams = 0;
  let cardiacFociExams = 0;
  let posteriorLungExams = 0;
  let pediatricCorrect = 0;
  let mixedCorrect = 0;
  let headChoiceCorrect = 0;
  let correctDiagnosisCount = 0;
  const heartCorrect: Record<HeartTopic, number> = { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 };
  const lungCorrect: Record<LungTopic, number> = { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 };
  for (const summary of summaries) {
    if (summary["ausculta.v"] !== AUSCULTA_SUMMARY_VERSION) continue;
    listenDisciplineCases = Math.max(listenDisciplineCases, clampInt(summary["ausculta.listen"] ?? 0, 0, COUNT_MAX));
    systematicExams = Math.max(systematicExams, clampInt(summary["ausculta.sys"] ?? 0, 0, COUNT_MAX));
    cardiacFociExams = Math.max(cardiacFociExams, clampInt(summary["ausculta.foci"] ?? 0, 0, COUNT_MAX));
    posteriorLungExams = Math.max(posteriorLungExams, clampInt(summary["ausculta.post"] ?? 0, 0, COUNT_MAX));
    pediatricCorrect = Math.max(pediatricCorrect, clampInt(summary["ausculta.ped"] ?? 0, 0, COUNT_MAX));
    mixedCorrect = Math.max(mixedCorrect, clampInt(summary["ausculta.mixed"] ?? 0, 0, COUNT_MAX));
    headChoiceCorrect = Math.max(headChoiceCorrect, clampInt(summary["ausculta.head"] ?? 0, 0, COUNT_MAX));
    correctDiagnosisCount = Math.max(correctDiagnosisCount, clampInt(summary["ausculta.diag"] ?? 0, 0, COUNT_MAX));
    for (const topic of AUSCULTA_HEART_TOPICS) {
      heartCorrect[topic] = Math.max(heartCorrect[topic]!, clampInt(summary[`ausculta.h.${topicCode(topic)}`] ?? 0, 0, COUNT_MAX));
    }
    for (const topic of AUSCULTA_LUNG_TOPICS) {
      lungCorrect[topic] = Math.max(lungCorrect[topic]!, clampInt(summary[`ausculta.l.${topicCode(topic)}`] ?? 0, 0, COUNT_MAX));
    }
  }
  return {
    listenDisciplineCases,
    systematicExams,
    cardiacFociExams,
    posteriorLungExams,
    heartCorrect,
    lungCorrect,
    pediatricCorrect,
    mixedCorrect,
    headChoiceCorrect,
    correctDiagnosisCount,
  };
}

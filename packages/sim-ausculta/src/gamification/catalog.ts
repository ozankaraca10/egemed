/** EGEMED Ausculta — oskültasyona özgü rozet kataloğu. Tanı ustalığı iddia etmez. */

import type { BadgeDef, BadgeProgress, BadgeTier } from "@egemed/gamification-core";
import { AUSCULTA_RULES } from "./rules";

export type HeartTopic = "normal" | "extraSounds" | "murmurTiming" | "rhythm";
export type LungTopic = "vesicular" | "continuous" | "crackles" | "pleuralRub";

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
const b = AUSCULTA_RULES.badges;

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

export const AUSCULTA_BADGES: BadgeDef<AuscultaStats>[] = [
  tiered("listen-3", "Kısa dinleme", "bronze", "Üç vakada zorunlu noktaların her birini vakanın asgari dinleme süresi kadar dinle.", b.listenDiscipline[0], (s) => s.listenDisciplineCases),
  tiered("listen-8", "Süreli dinleme", "silver", "Sekiz vakada zorunlu noktaların her birini asgari dinleme süresi kadar dinle.", b.listenDiscipline[1], (s) => s.listenDisciplineCases),
  tiered("listen-20", "Dinleme disiplini", "gold", "Yirmi vakada zorunlu noktaların her birini asgari dinleme süresi kadar dinle.", b.listenDiscipline[2], (s) => s.listenDisciplineCases),
  tiered("systematic-1", "Sıralı muayene", "bronze", "Bir vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[0], (s) => s.systematicExams),
  tiered("systematic-5", "Sistematik oskültasyon", "silver", "Beş vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[1], (s) => s.systematicExams),
  tiered("systematic-15", "Düzenli odak sırası", "gold", "On beş vakada tanımlı odak sırasını eksiksiz tamamla.", b.systematic[2], (s) => s.systematicExams),
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
  countBadge("heart-normal", "S1 ve S2", "Normal kalp seslerini (S1–S2) doğru ayırt et. Kapak tanısı sayılmaz.", "3 vaka", "topic", "Heart", (s) => s.heartCorrect.normal, b.heartNormal),
  countBadge("heart-extra", "Ek kalp sesleri", "S3 veya S4 sesini doğru ayırt et. Kalp yetersizliği tanısı sayılmaz.", "3 vaka", "topic", "Heart", (s) => s.heartCorrect.extraSounds, b.extraHeartSounds),
  countBadge("murmur-timing", "Üfürüm zamanı", "Sistolik veya diyastolik üfürümün zamanlamasını doğru ayırt et. Kapak lezyonu tanısı sayılmaz.", "5 vaka", "topic", "Heart", (s) => s.heartCorrect.murmurTiming, b.murmurTiming),
  countBadge("rhythm-findings", "Ritim ile uyumlu sesler", "Atriyal fibrilasyon, taşikardi veya AV blok ile uyumlu sesi doğru ayırt et.", "3 vaka", "topic", "Activity", (s) => s.heartCorrect.rhythm, b.rhythmFindings),
  countBadge("lung-vesicular", "Veziküler solunum", "Normal veziküler solunum sesini doğru ayırt et.", "3 vaka", "topic", "Lungs", (s) => s.lungCorrect.vesicular, b.vesicular),
  countBadge("lung-continuous", "Sürekli ek sesler", "Wheezing (hışıltı) veya ronküsü doğru ayırt et. Hava yolu tanısı sayılmaz.", "5 vaka", "topic", "Lungs", (s) => s.lungCorrect.continuous, b.continuousAdventitious),
  countBadge("lung-crackles", "Kesintili raller", "İnce veya kaba rali doğru ayırt et. Pnömoni tanısı sayılmaz.", "5 vaka", "topic", "Lungs", (s) => s.lungCorrect.crackles, b.crackles),
  countBadge("pleural-rub", "Plevral frotman", "Plevral frotmanı diğer akciğer seslerinden ayırt et.", "3 vaka", "topic", "Lungs", (s) => s.lungCorrect.pleuralRub, b.pleuralRub),
  countBadge("pediatric", "Pediatrik vakalar", "Pediatrik işaretli beş vakada akustik bulguyu doğru tanı.", "5 vaka", "topic", "User", (s) => s.pediatricCorrect, b.pediatric),
  countBadge("mixed-sounds", "Kalp ve akciğer birlikte", "Aynı vakada hem kalp hem akciğer ses sınıfını doğru ayırt et.", "3 vaka", "topic", "Stethoscope", (s) => s.mixedCorrect, b.mixed),
  countBadge("head-choice", "Bell ve diyafram", "Düşük ve yüksek frekans için bell veya diyafram seçimini doğru yap.", "5 doğru", "skill", "Stethoscope", (s) => s.headChoiceCorrect, b.headChoice),
  countBadge("diagnosis-3", "Tanı eşleştirmesi", "Tanı sorularında üç doğru yanıt ver.", "3 doğru tanı", "skill", "Check", (s) => s.correctDiagnosisCount ?? 0, 3),
];

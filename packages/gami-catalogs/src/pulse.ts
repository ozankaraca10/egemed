/**
 * EGEMED Pulse — rozet kataloğu, istatistik ve kodlu deneme özeti (ADR-008).
 *
 * Saf modül: sim (yerel ekranlar) ve API (sunucu rozet değerlendirmesi) aynı
 * kaynağı kullanır. Kodlu özet, rozet istatistiğinin tek kaynağıdır; ham
 * öğrenci yanıtı içermez (KVKK).
 */
import type { BadgeDef, BadgeProgress } from "@egemed/gamification-core";
import { EMPTY_DUEL_STATS, duelBadges } from "./duel";

/** `packages/sim-pulse/src/engine/shapes.ts` MODES ile aynı sıra (test eşitliği doğrular). */
export const PULSE_MODES = [
  "normal", "af", "stemi", "pvc", "svt", "inferior", "vt", "vf", "pat", "flutter", "sintach", "lbbb", "rbbb",
] as const;
export type PulseMode = (typeof PULSE_MODES)[number];

export interface PulseStats {
  rhythmRecognitionStreak: number;
  correctlyReadLeads: number;
  accurateCaliperCount: number;
  modeMastery: Partial<Record<PulseMode, number>>;
}

const modeLabels: Record<PulseMode, string> = {
  normal: "Normal sinüs ritmi",
  af: "Atriyal fibrilasyon",
  stemi: "Anterior ST yükselmesi örneği",
  pvc: "Ventriküler erken atım",
  svt: "Düzenli dar kompleks taşikardi",
  inferior: "İnferior ST yükselmesi örneği",
  vt: "Monomorfik ventriküler taşikardi örneği",
  vf: "Ventriküler fibrilasyon örüntüsü",
  pat: "Fokal atriyal taşikardi",
  flutter: "Atriyal flutter",
  sintach: "Sinüs taşikardisi",
  lbbb: "Sol dal bloğu örneği",
  rbbb: "Sağ dal bloğu örneği",
};

const progress = (value: number, max: number): BadgeProgress => ({ value, max });
const streakBadge = (id: string, name: string, tier: "bronze" | "silver" | "gold", max: number): BadgeDef<PulseStats> => ({
  id,
  category: "streak",
  tier,
  icon: "Heart",
  name,
  description: `${max} EKG örüntüsünü art arda doğru tanı.`,
  rule: `${max} doğru yanıt`,
  progress: (s) => progress(s.rhythmRecognitionStreak, max),
});

const modeBadges: BadgeDef<PulseStats>[] = (Object.keys(modeLabels) as PulseMode[]).map((mode) => ({
  id: `mode-${mode}`,
  category: "topic",
  icon: "Activity",
  name: `${modeLabels[mode]} ustalığı`,
  description: `${modeLabels[mode]} örüntüsünde en az %80 başarıya ulaş.`,
  rule: "1 başarılı oturum",
  progress: (s) => progress(s.modeMastery[mode] ?? 0, 1),
}));

export const PULSE_BADGES: BadgeDef<PulseStats>[] = [
  streakBadge("rhythm-streak-3", "Ritim izleyicisi", "bronze", 3),
  streakBadge("rhythm-streak-10", "Ritim yorumcusu", "silver", 10),
  streakBadge("rhythm-streak-25", "Ritim ustası", "gold", 25),
  {
    id: "twelve-leads",
    category: "skill",
    icon: "Activity",
    name: "12 derivasyon okuru",
    description: "Standart 12 derivasyonun tamamında doğru değerlendirme yap.",
    rule: "12 doğru derivasyon",
    progress: (s) => progress(s.correctlyReadLeads, 12),
  },
  {
    id: "caliper-1",
    category: "skill",
    tier: "bronze",
    icon: "Ruler",
    name: "Kaliper başlangıcı",
    description: "Kaliperle üç ölçümü 20 ms içinde doğru yap.",
    rule: "3 doğru ölçüm",
    progress: (s) => progress(s.accurateCaliperCount, 3),
  },
  {
    id: "caliper-2",
    category: "skill",
    tier: "silver",
    icon: "Ruler",
    name: "Kaliper ustalığı",
    description: "Kaliperle on ölçümü 20 ms içinde doğru yap.",
    rule: "10 doğru ölçüm",
    progress: (s) => progress(s.accurateCaliperCount, 10),
  },
  {
    id: "caliper-3",
    category: "skill",
    tier: "gold",
    icon: "Ruler",
    name: "Hassas ölçüm",
    description: "Kaliperle 25 ölçümü 20 ms içinde doğru yap.",
    rule: "25 doğru ölçüm",
    progress: (s) => progress(s.accurateCaliperCount, 25),
  },
  ...modeBadges,
  // Düello rozetleri (ADR-010): kazanım sunucuda `challenges` sonuçlarından
  // değerlendirilir; sim görünümünde erişim boştur, kazanılan `earnedFromServer` ile işaretlenir.
  ...duelBadges<PulseStats>(() => EMPTY_DUEL_STATS),
];

export { modeLabels as PULSE_MODE_LABELS };

/** Rozet istatistiğine giren deneme alanları (sim `PulseAttemptRecord.extra` ile yapısal uyumlu). */
export interface PulseSummaryInput {
  readonly score: number;
  readonly extra: {
    readonly ecgMode: PulseMode;
    readonly modeMastered: boolean;
    readonly correctlyReadLeads: number;
    readonly caliperAccurate: boolean | null;
    readonly rhythmRecognitionStreak: number;
  };
}

/** Kod sözlüğü v1. Kod ekle/çıkar = sürüm değişikliği (`pulse.v`). */
export const PULSE_SUMMARY_VERSION = 1;

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : 0)));

/** Denemeyi sözleşmedeki kodlu özete çevirir (kod → sınırlı tam sayı). */
export function encodePulseSummary(input: PulseSummaryInput): Record<string, number> {
  const summary: Record<string, number> = {
    "pulse.v": PULSE_SUMMARY_VERSION,
    "pulse.score": clampInt(input.score, 0, 100),
    "pulse.mode": Math.max(0, PULSE_MODES.indexOf(input.extra.ecgMode)),
    "pulse.mastered": input.extra.modeMastered ? 1 : 0,
    "pulse.leads": clampInt(input.extra.correctlyReadLeads, 0, 12),
    "pulse.streak": clampInt(input.extra.rhythmRecognitionStreak, 0, 100_000),
  };
  if (input.extra.caliperAccurate !== null) summary["pulse.caliper"] = input.extra.caliperAccurate ? 1 : 0;
  return summary;
}

/** Kodlu özetlerden rozet istatistiği; bilinmeyen/bozuk kodlar yok sayılır. */
export function pulseStatsFromSummaries(summaries: readonly Readonly<Record<string, number>>[]): PulseStats {
  let rhythmRecognitionStreak = 0;
  let correctlyReadLeads = 0;
  let accurateCaliperCount = 0;
  const modeMastery: Partial<Record<PulseMode, number>> = {};
  for (const summary of summaries) {
    if (summary["pulse.v"] !== PULSE_SUMMARY_VERSION) continue;
    rhythmRecognitionStreak = Math.max(rhythmRecognitionStreak, clampInt(summary["pulse.streak"] ?? 0, 0, 100_000));
    correctlyReadLeads = Math.max(correctlyReadLeads, clampInt(summary["pulse.leads"] ?? 0, 0, 12));
    if (summary["pulse.caliper"] === 1) accurateCaliperCount += 1;
    const mode = PULSE_MODES[summary["pulse.mode"] ?? -1];
    if (summary["pulse.mastered"] === 1 && mode !== undefined) modeMastery[mode] = 1;
  }
  return { rhythmRecognitionStreak, correctlyReadLeads, accurateCaliperCount, modeMastery };
}

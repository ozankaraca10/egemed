/** EGEMED Pulse — EKG okuma ve ritim öğrenimine özgü rozet kataloğu. */

import type { BadgeDef, BadgeProgress } from "@egemed/gamification-core";
import type { Mode } from "../engine/shapes";

export interface PulseStats {
  rhythmRecognitionStreak: number;
  correctlyReadLeads: number;
  accurateCaliperCount: number;
  modeMastery: Partial<Record<Mode, number>>;
}

const modeLabels: Record<Mode, string> = {
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

const modeBadges: BadgeDef<PulseStats>[] = (Object.keys(modeLabels) as Mode[]).map((mode) => ({
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
];

export { modeLabels as PULSE_MODE_LABELS };

/** Opaca aylık ödül yapılandırması (demo) ve geçmiş kazananlar. */

import { monthKeyTr, type MonthlyReward, type RewardWinner } from "@egemed/gamification-core";
import { monthlyRewardFor as coreMonthlyRewardFor, rewardWinnersHistory as coreRewardWinnersHistory } from "@egemed/gamification-core";

const SEPTEMBER_2026: MonthlyReward = {
  month: "2026-09",
  title: "Girişimsel Radyolojide bir girişime gözlemci olarak katılım",
  description:
    "Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir girişimsel işlemi gözlemleme fırsatı kazanır.",
  sponsor: "Radyoloji Anabilim Dalı",
  winnersCount: 3,
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true },
  terms: [
    "Uygun kohortlar: Dönem 1–6 öğrencileri.",
    "Ay içinde en az 4 değerlendirme oturumu tamamlanmalıdır.",
    "Puan: ay içindeki en iyi 3 değerlendirmenin ortalaması.",
    "Eşitlikte bu puana önce ulaşan öne geçer.",
    "Sıralamada adla görünmek (anonim olmamak) zorunludur.",
    "Kazananlarla fakülte e-postası üzerinden iletişim kurulur.",
    "Ödül devredilemez; hasta onamı ve klinik uygunluğa bağlıdır, tarih Radyoloji AD ile planlanır.",
    "Kopya veya kural ihlalinde hak kaybedilir.",
  ],
};

export const MONTHLY_REWARDS: Record<string, MonthlyReward> = {
  "2026-09": SEPTEMBER_2026,
};

export const REWARD_WINNERS_HISTORY: RewardWinner[] = [
  { month: "2026-08", rank: 1, displayName: "Mert Tunç", score: 92.7, isMe: false },
  { month: "2026-08", rank: 2, displayName: "Deniz Kaya", score: 90.1, isMe: false },
  { month: "2026-08", rank: 3, displayName: "Burak Demir", score: 88.4, isMe: false },
  { month: "2026-07", rank: 1, displayName: "Ece Sarı", score: 91.5, isMe: false },
  { month: "2026-07", rank: 2, displayName: "Can Öztürk", score: 89.9, isMe: false },
  { month: "2026-07", rank: 3, displayName: "Elif Şahin", score: 87.2, isMe: false },
  { month: "2026-06", rank: 1, displayName: "Deniz Kaya", score: 93.0, isMe: false },
  { month: "2026-06", rank: 2, displayName: "Zeynep Arslan", score: 90.6, isMe: false },
  { month: "2026-06", rank: 3, displayName: "Kerem Aydın", score: 88.8, isMe: false },
];

export function monthlyRewardFor(month: string): MonthlyReward | null {
  return coreMonthlyRewardFor(MONTHLY_REWARDS, month);
}

export function rewardWinnersHistory(lastNMonths: number, now: Date): RewardWinner[] {
  return coreRewardWinnersHistory(REWARD_WINNERS_HISTORY, lastNMonths, now);
}

export { monthKeyTr };

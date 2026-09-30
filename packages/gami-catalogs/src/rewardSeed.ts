import type { MonthlyReward } from "@egemed/gamification-core";

/**
 * Aylık ödül örnek tohumu (30 Eylül 2026, depo sahibi kararı): her sime 3 aylık
 * (Eylül–Ekim–Kasım 2026) birer ödül. Tek kaynak budur — kabuğun sentetik ödül
 * deposu ve API `seed:rewards` aynı veriyi kullanır. İçerik örnektir; ödül
 * yönetiminden düzenlenir veya silinir. Geçmiş kazanan yoktur (sıfırdan başlar).
 */
export type RewardSeedSimId = "pulse" | "ausculta" | "opaca";

export interface RewardSeedItem {
  readonly simId: RewardSeedSimId;
  readonly reward: MonthlyReward;
}

const ELIGIBILITY = { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true } as const;

function terms(department: string): string[] {
  return [
    "Uygun kohortlar: Dönem 1–6 öğrencileri.",
    "Ay içinde en az 4 değerlendirme oturumu tamamlanmalıdır.",
    "Puan: ay içindeki en iyi 3 değerlendirmenin ortalaması.",
    "Eşitlikte bu puana önce ulaşan öne geçer.",
    "Sıralamada adla görünmek (anonim olmamak) zorunludur.",
    "Kazananlarla fakülte e-postası üzerinden iletişim kurulur.",
    `Ödül devredilemez; hasta onamı ve klinik uygunluğa bağlıdır, tarih ${department} ile planlanır.`,
    "Kopya veya kural ihlalinde hak kaybedilir.",
  ];
}

function reward(month: string, title: string, description: string, sponsor: string): MonthlyReward {
  return { month, title, description, sponsor, winnersCount: 3, eligibility: { ...ELIGIBILITY, cohorts: [...ELIGIBILITY.cohorts] }, terms: terms(sponsor) };
}

const CARD = "Kardiyoloji Anabilim Dalı";
const CHEST = "Göğüs Hastalıkları Anabilim Dalı";
const PED = "Çocuk Sağlığı ve Hastalıkları Anabilim Dalı";
const RAD = "Radyoloji Anabilim Dalı";

export const REWARD_SEED: readonly RewardSeedItem[] = [
  { simId: "pulse", reward: reward("2026-09", "Koroner anjiyografi laboratuvarında bir işleme gözlemci olarak katılım", "Ayın ilk 3'ü, Kardiyoloji AD öğretim üyesi eşliğinde bir koroner anjiyografi işlemini gözlemleme fırsatı kazanır.", CARD) },
  { simId: "pulse", reward: reward("2026-10", "Kardiyoloji AD EKG değerlendirme toplantısına katılım", "Ayın ilk 3'ü, Kardiyoloji AD'nin EKG değerlendirme toplantısına konuk olarak katılır ve bir vakanın yorumuna eşlik eder.", CARD) },
  { simId: "pulse", reward: reward("2026-11", "Efor testi laboratuvarında bir gün", "Ayın ilk 3'ü, öğretim üyesi eşliğinde efor testi laboratuvarında bir gün geçirir; test sırasında EKG izlemini yakından görür.", CARD) },
  { simId: "ausculta", reward: reward("2026-09", "Göğüs Hastalıkları servisinde vizite katılım", "Ayın ilk 3'ü, Göğüs Hastalıkları AD öğretim üyesi eşliğinde bir servis vizitine katılır ve yatak başı oskültasyon yapar.", CHEST) },
  { simId: "ausculta", reward: reward("2026-10", "Ekokardiyografi laboratuvarında oskültasyon–eko eşleştirmesi", "Ayın ilk 3'ü, dinlediği üfürümü aynı hastanın ekokardiyografisiyle karşılaştırma fırsatı bulur.", CARD) },
  { simId: "ausculta", reward: reward("2026-11", "Çocuk kardiyolojisi polikliniğinde üfürüm muayenesi gözlemi", "Ayın ilk 3'ü, Çocuk Kardiyolojisi polikliniğinde öğretim üyesi eşliğinde üfürüm muayenesini gözlemler.", PED) },
  { simId: "opaca", reward: reward("2026-09", "Girişimsel Radyolojide bir girişime gözlemci olarak katılım", "Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir girişimsel işlemi gözlemleme fırsatı kazanır.", RAD) },
  { simId: "opaca", reward: reward("2026-10", "Toraks BT raporlama oturumuna katılım", "Ayın ilk 3'ü, Radyoloji AD toraks radyolojisi biriminde bir BT raporlama oturumuna konuk olarak katılır.", RAD) },
  { simId: "opaca", reward: reward("2026-11", "Radyoloji okuma odasında bir gün", "Ayın ilk 3'ü, öğretim üyesi eşliğinde acil radyoloji okuma odasında bir gün geçirir.", RAD) },
];

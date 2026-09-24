/** EGEMED CLIX — oyunlaştırma çekirdeği (sim-bağımsız) veri tipleri.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/types.ts.
 *  Opaca'ya özgü alanlar (bulgu, lokalizasyon, ABCDE vb.) `extra` içinde taşınır;
 *  çekirdek hiçbir sim verisine bağlı değildir. Bu dosya yalnız tip tanımları içerir. */

export type SimId = "pulse" | "ausculta" | "opaca";

export type GamiMode = "practice" | "assessment";

/** Bir deneme (uygulama ya da değerlendirme) oturumunun özet kaydı.
 *  `id` idempotensi sağlar: mode + sessionSeed + caseIds birleşiminin karması (çağıran taraf üretir).
 *  `TDomain` simin puanlama alanları (ör. Opaca'da `ScoringWeights` anahtarları), `TExtra` sim'e özgü ek alanlardır. */
export interface AttemptRecord<TDomain extends string = string, TExtra = unknown> {
  id: string;
  mode: GamiMode;
  finishedAt: string; // ISO 8601
  score: number; // 0–100, aggregateResults().total
  mastery: boolean;
  caseCount: number;
  hintsUsed: number;
  durationMs: number;
  domains: Partial<Record<TDomain, number>>; // yüzde 0–100
  extra: TExtra;
}

/** Öğrenme modu etkinliği — konu/öğe başına yalnız bir kez sayılır (set semantiği).
 *  `topics` düz konu anahtarlarıdır; `items` sim'e özgü koleksiyonları tamamlanmış öğe
 *  kimliklerine eşler (ör. Opaca'da `items.ctStacks`). Çekirdek anahtar uzayını bilmez. */
export interface LearnActivity {
  topics: string[];
  items: Record<string, string[]>;
}

/** Dönem (kohort) — 1'den 6'ya kadar tüm sınıflar (ödül/kohort kararı kaynakla aynı). */
export type Cohort = 1 | 2 | 3 | 4 | 5 | 6;

export interface GamiProfile {
  displayName: string | null;
  public: boolean;
  cohort: Cohort | null;
}

/** Kazanılan rozet kaydı; kazanım mantığı `badges.ts` jenerik motorundadır. */
export interface EarnedBadge {
  id: string;
  at: string; // ISO 8601
}

export interface GamiStateV1<TDomain extends string = string, TExtra = unknown> {
  v: 1;
  attempts: AttemptRecord<TDomain, TExtra>[];
  learn: LearnActivity;
  earned: EarnedBadge[];
  profile: GamiProfile;
}

/** Sıralama/dönem türleri. */
export type Period = "today" | "week" | "month" | "academic_year";
export type CohortFilter = "all" | Cohort;

/** Aylık ödül yapılandırması. Yapılandırma VERİSİ sim paketindedir (ör. sponsor/koşullar);
 *  çekirdek yalnız biçimi ve uygunluk mantığını taşır (`ranking.rewardStandings`). */
export interface MonthlyReward {
  month: string; // 'YYYY-MM'
  title: string;
  description: string;
  sponsor: string;
  winnersCount: number;
  eligibility: {
    cohorts: Cohort[];
    minAssessments: number;
    requirePublicName: boolean;
  };
  terms: string[];
}

/** Geçmiş ödül kazananı (sim'in kendi verisi). */
export interface RewardWinner {
  month: string;
  rank: number;
  displayName: string;
  score: number;
  isMe: boolean;
}

export type EligibilityReason = "eligible" | "min_assessments" | "cohort" | "private_profile";

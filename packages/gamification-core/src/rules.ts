/** EGEMED CLIX — oyunlaştırma çekirdeği sayısal kuralları (TEK kaynak).
 *  Salt okunur kaynak: egemed-opaca/src/gamification/rules.ts.
 *  Modüller sabit import etmez; kurallar parametre olarak geçirilir (`practiceXp(attempt, rules)` vb.).
 *  Sim başına farklı rozet/hedef = farklı `GamiRules` nesnesi. `DEFAULT_RULES` Opaca değerleridir.
 *  Not: kaynaktaki `storage` bölümü çekirdeğe alınmadı; depolama anahtarı sim paketlerine aittir. */

export interface GamiXpRules {
  /** Uygulama: vaka başına temel XP. */
  practiceCase: number;
  /** Uygulama: ustalık (mastery) vakası için ek XP (vaka başına). */
  practiceMasteryBonus: number;
  /** Uygulama: ipucu başına ceza (vaka başına en az 0'a kadar düşer). */
  practiceHintPenalty: number;
  /** Değerlendirme: vaka başına XP. */
  assessmentCase: number;
  /** Değerlendirme: bu eşiğin (oturum puanı) üzerinde/eşit ise başarı bonusu verilir. */
  assessmentBonusThreshold: number;
  assessmentBonus: number;
  /** Öğrenme: bir konu ilk kez incelendiğinde (konu başına yalnız bir kez). */
  learnTopicFirstView: number;
}

export interface GamiLevelRules {
  /** n. seviyenin genişliği = unitXp × n (1: 0–100, 2: 100–300, 3: 300–600, 4: 600–1000, 5: 1000–1500 …). */
  unitXp: number;
}

export interface GamiWeekRules {
  /** Haftalık hedef 1: en az bu kadar değerlendirme oturumu. */
  assessmentSessionsGoal: number;
  /** Haftalık hedef 2: haftalık değerlendirme ortalaması bu eşiğin üzerinde/eşit (en az 1 oturumla). */
  avgScoreGoal: number;
  /** Haftalık hedef 3: bu hafta kazanılan yeni rozet sayısı. */
  newBadgesGoal: number;
}

export interface GamiRankingRules {
  /** Dönem puanı: en iyi N değerlendirmenin ortalaması. */
  bestOfCount: number;
  /** Sıralamaya girmek için asgari değerlendirme sayısı. */
  minAttempts: number;
  /** Dönem puanı yuvarlama (ondalık basamak). */
  roundDecimals: number;
}

export interface GamiBadgeRules {
  /** bronz / gümüş / altın — isabetli lokalizasyon */
  sharpEye: readonly [number, number, number];
  filmQuality: number;
  interpreter: number;
  pleura: number;
  cardiac: number;
  nodule: number;
  tb: number;
  pediatric: number;
  diaphragm: number;
  bone: number;
  vascular: number;
  streak: readonly [number, number, number];
  /** değerlendirme oturumu sayısı */
  marathon: number;
  /** öğrenme modunda incelenen farklı konu */
  explorerTopics: number;
  /** uygulama vaka sayısı */
  practiceGrit: number;
  /** "Eşik Aşıldı" rozeti — ilk kez bu puana ulaşma */
  thresholdScore: number;
  /** "İpucusuz" rozeti — ipucusuz oturumdaki asgari vaka sayısı */
  noHintsCaseMin: number;
}

export interface GamiRules {
  xp: GamiXpRules;
  level: GamiLevelRules;
  week: GamiWeekRules;
  ranking: GamiRankingRules;
  badges: GamiBadgeRules;
}

export const DEFAULT_RULES: GamiRules = {
  xp: {
    practiceCase: 5,
    practiceMasteryBonus: 5,
    practiceHintPenalty: 2,
    assessmentCase: 10,
    assessmentBonusThreshold: 80,
    assessmentBonus: 20,
    learnTopicFirstView: 2,
  },
  level: {
    unitXp: 100,
  },
  week: {
    assessmentSessionsGoal: 5,
    avgScoreGoal: 80,
    newBadgesGoal: 2,
  },
  ranking: {
    bestOfCount: 3,
    minAttempts: 2,
    roundDecimals: 1,
  },
  badges: {
    sharpEye: [10, 25, 50],
    filmQuality: 10,
    interpreter: 10,
    pleura: 5,
    cardiac: 5,
    nodule: 10,
    tb: 10,
    pediatric: 5,
    diaphragm: 5,
    bone: 5,
    vascular: 3,
    streak: [3, 7, 30],
    marathon: 50,
    explorerTopics: 10,
    practiceGrit: 20,
    thresholdScore: 80,
    noHintsCaseMin: 10,
  },
};

/** EGEMED — deneme → XP, toplam XP → seviye/ilerleme.
 *  Salt okunur kaynak: egemed-opaca/src/gamification/xp.ts.
 *  Saf fonksiyonlar; zaman kullanılmaz, kurallar parametre olarak verilir. */

import type { AttemptRecord, LearnActivity } from "./types";
import type { GamiRules } from "./rules";

/** Uygulama oturumu XP'si: vaka başına temel + (ustalıksa) ustalık bonusu − ipucu cezası,
 *  vaka başına en az 0'a kadar. AttemptRecord oturum düzeyinde toplu tutulduğundan (vaka başına
 *  ayrı ipucu sayısı yok) ipucu cezası vaka başına ORTALAMA olarak uygulanır ve oturum toplamı
 *  bu vaka başına değerin caseCount ile çarpılıp yuvarlanmasıyla bulunur. */
export function practiceXp(
  attempt: Pick<AttemptRecord, "caseCount" | "hintsUsed" | "mastery">,
  rules: GamiRules,
): number {
  if (attempt.caseCount <= 0) return 0;
  const perCaseBase = rules.xp.practiceCase + (attempt.mastery ? rules.xp.practiceMasteryBonus : 0);
  const avgHintsPerCase = attempt.hintsUsed / attempt.caseCount;
  const perCaseXp = Math.max(0, perCaseBase - rules.xp.practiceHintPenalty * avgHintsPerCase);
  return Math.round(perCaseXp * attempt.caseCount);
}

/** Değerlendirme oturumu XP'si: vaka başına sabit + (oturum puanı eşiği geçtiyse) başarı bonusu. */
export function assessmentXp(
  attempt: Pick<AttemptRecord, "caseCount" | "score">,
  rules: GamiRules,
): number {
  const base = rules.xp.assessmentCase * Math.max(0, attempt.caseCount);
  const bonus = attempt.score >= rules.xp.assessmentBonusThreshold ? rules.xp.assessmentBonus : 0;
  return base + bonus;
}

/** Bir denemenin modu neyse ona göre XP hesaplar. */
export function attemptXp<TDomain extends string, TExtra>(
  attempt: AttemptRecord<TDomain, TExtra>,
  rules: GamiRules,
): number {
  return attempt.mode === "assessment" ? assessmentXp(attempt, rules) : practiceXp(attempt, rules);
}

/** Öğrenme etkinliğinden XP: `topics` bir küme (set) olduğundan her konu yalnız bir kez sayılır —
 *  bu doğal biçimde "konu başına bir kez" kuralını karşılar. */
export function learnXp(learn: LearnActivity, rules: GamiRules): number {
  return learn.topics.length * rules.xp.learnTopicFirstView;
}

/** Tüm denemeler + öğrenme etkinliğinden toplam XP. */
export function totalXpFor<TDomain extends string, TExtra>(
  attempts: readonly AttemptRecord<TDomain, TExtra>[],
  learn: LearnActivity,
  rules: GamiRules,
): number {
  return attempts.reduce((sum, a) => sum + attemptXp(a, rules), 0) + learnXp(learn, rules);
}

export interface LevelInfo {
  level: number;
  levelStartXp: number;
  levelEndXp: number;
  xpIntoLevel: number;
  xpToNext: number;
}

/** n. seviyenin başlangıç XP'si: toplam(100×1 … 100×(n−1)) = unitXp × (n−1) × n / 2. */
export function levelStartXp(level: number, rules: GamiRules): number {
  return (rules.level.unitXp * (level - 1) * level) / 2;
}

/** Toplam XP'den seviye ve o seviye içindeki ilerleme bilgisini üretir. */
export function levelForXp(totalXp: number, rules: GamiRules): LevelInfo {
  let level = 1;
  while (levelStartXp(level + 1, rules) <= totalXp) level++;
  const start = levelStartXp(level, rules);
  const end = levelStartXp(level + 1, rules);
  return { level, levelStartXp: start, levelEndXp: end, xpIntoLevel: totalXp - start, xpToNext: end - totalXp };
}

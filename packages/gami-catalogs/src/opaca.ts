/**
 * EGEMED Opaca — rozet kataloğu, istatistik ve kodlu deneme özeti (ADR-008).
 *
 * Saf modül: sim (yerel ekranlar) ve API (sunucu rozet değerlendirmesi) aynı
 * kaynağı kullanır. Kodlu özet, rozet istatistiğinin tek kaynağıdır; ham
 * öğrenci yanıtı içermez (KVKK). Konu ve birikimli sayaçlar sim tarafında
 * hesaplanıp özete kod olarak yazılır; bu paket sim verisine bağlı değildir.
 */
import type { BadgeContext, BadgeDef, GamiMode } from "@egemed/gamification-core";
import { startOfDayTr } from "@egemed/gamification-core";

/** Rozet konuları — sim `TOPIC_BADGE_MATCH` anahtarlarıyla aynı sıra (test eşitliği doğrular). */
export const OPACA_TOPICS = [
  "pleura", "cardiac", "nodule", "tb", "pediatric", "diaphragm", "bone", "vascular",
] as const;
export type OpacaTopic = (typeof OPACA_TOPICS)[number];

/** Rozet eşikleri — sim `OPACA_RULES.badges` ile aynı (test eşitliği doğrular). */
export const OPACA_BADGE_RULES = {
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
} as const;

export type OpacaBadgeContext = BadgeContext;

/** Rozet değerlendirmesinin tükettiği Opaca istatistik alanları (kodlu özetten türetilir). */
export interface OpacaStats {
  streakLongest: number;
  assessmentCount: number;
  practiceCaseTotal: number;
  localizationHits: number;
  abcdeCompleteCount: number;
  qualityCorrect: number;
  interpretationCorrect: number;
  fastPerfectCount: number;
  bestAssessmentScore: number;
  perfectSessionCount: number;
  noHintPracticeSessionCount: number;
  topicCorrect: Partial<Record<OpacaTopic, number>>;
  learnTopicsCount: number;
  ctStacksCompletedCount: number;
  allTopicsCoveredCount: number;
  allTopicsTotal: number;
}

const topic =
  (id: OpacaTopic, max: number): ((s: OpacaStats) => { value: number; max: number }) =>
  (s) => ({ value: s.topicCorrect[id] ?? 0, max });

export const OPACA_BADGES: BadgeDef<OpacaStats, OpacaBadgeContext>[] = [
  {
    id: "sharp-eye-1",
    category: "skill",
    icon: "Target",
    name: "Keskin Göz",
    tier: "bronze",
    description: `Değerlendirmede ${OPACA_BADGE_RULES.sharpEye[0]} isabetli lokalizasyon.`,
    rule: "10 isabet",
    studyKey: "technique.systematic",
    progress: (s) => ({ value: s.localizationHits, max: OPACA_BADGE_RULES.sharpEye[0] }),
  },
  {
    id: "sharp-eye-2",
    category: "skill",
    icon: "Target",
    name: "Keskin Göz",
    tier: "silver",
    description: `Değerlendirmede ${OPACA_BADGE_RULES.sharpEye[1]} isabetli lokalizasyon.`,
    rule: "25 isabet",
    studyKey: "technique.systematic",
    progress: (s) => ({ value: s.localizationHits, max: OPACA_BADGE_RULES.sharpEye[1] }),
  },
  {
    id: "sharp-eye-3",
    category: "skill",
    icon: "Target",
    name: "Keskin Göz",
    tier: "gold",
    description: `Değerlendirmede ${OPACA_BADGE_RULES.sharpEye[2]} isabetli lokalizasyon.`,
    rule: "50 isabet",
    studyKey: "technique.systematic",
    progress: (s) => ({ value: s.localizationHits, max: OPACA_BADGE_RULES.sharpEye[2] }),
  },
  {
    id: "systematic",
    category: "skill",
    icon: "Scan",
    name: "Sistematik Okuyucu",
    description: "Bir vakada ABCDE sırasını eksiksiz izle.",
    rule: "1 tam ABCDE",
    studyKey: "technique.systematic",
    progress: (s) => ({ value: s.abcdeCompleteCount, max: 1 }),
  },
  {
    id: "film-quality",
    category: "skill",
    icon: "Film",
    name: "Film Kalitesi",
    description: `${OPACA_BADGE_RULES.filmQuality} vakada film kalitesi sorusunu doğru yanıtla.`,
    rule: "10 doğru",
    studyKey: "technique.projection",
    progress: (s) => ({ value: s.qualityCorrect, max: OPACA_BADGE_RULES.filmQuality }),
  },
  {
    id: "fast-accurate",
    category: "skill",
    icon: "Clock",
    name: "Hızlı ve Doğru",
    description: "Süre sınırının yarısında 90+ puan.",
    rule: "90+ · yarı süre",
    progress: (s) => ({ value: s.fastPerfectCount, max: 1 }),
  },
  {
    id: "interpreter",
    category: "skill",
    icon: "Doc",
    name: "Klinik Yorumcu",
    description: `${OPACA_BADGE_RULES.interpreter} vakada klinik yorum sorusunu doğru yanıtla.`,
    rule: "10 doğru",
    progress: (s) => ({ value: s.interpretationCorrect, max: OPACA_BADGE_RULES.interpreter }),
  },
  {
    id: "pleura",
    category: "topic",
    icon: "Lungs",
    name: "Plevra Dedektifi",
    description: `${OPACA_BADGE_RULES.pleura} pnömotoraks/efüzyon vakasını doğru tanı.`,
    rule: "5 vaka",
    studyKey: "finding.pneumothorax",
    progress: topic("pleura", OPACA_BADGE_RULES.pleura),
  },
  {
    id: "cardiac",
    category: "topic",
    icon: "Heart",
    name: "Kalp Gölgesi",
    description: `${OPACA_BADGE_RULES.cardiac} kardiyomegali vakasını doğru tanı.`,
    rule: "5 vaka",
    studyKey: "finding.cardiomegaly",
    progress: topic("cardiac", OPACA_BADGE_RULES.cardiac),
  },
  {
    id: "nodule",
    category: "topic",
    icon: "Brain",
    name: "Nodül Avcısı",
    description: `${OPACA_BADGE_RULES.nodule} nodül/kitle vakasını doğru tanı.`,
    rule: "10 vaka",
    studyKey: "finding.nodule_mass",
    progress: topic("nodule", OPACA_BADGE_RULES.nodule),
  },
  {
    id: "tb",
    category: "topic",
    icon: "Lungs",
    name: "Tüberküloz Okuru",
    description: `${OPACA_BADGE_RULES.tb} tüberküloz vakasını doğru tanı.`,
    rule: "10 vaka",
    studyKey: "finding.tuberculosis",
    progress: topic("tb", OPACA_BADGE_RULES.tb),
  },
  {
    id: "pediatric",
    category: "topic",
    icon: "User",
    name: "Pediatri",
    description: `${OPACA_BADGE_RULES.pediatric} pediatrik vakayı doğru tanı.`,
    rule: "5 vaka",
    studyKey: "finding.steeple_sign",
    progress: topic("pediatric", OPACA_BADGE_RULES.pediatric),
  },
  {
    id: "diaphragm",
    category: "topic",
    icon: "Diaphragm",
    name: "Diyafram Bilgesi",
    description: `${OPACA_BADGE_RULES.diaphragm} diyafram konusu vakasını doğru tanı.`,
    rule: "5 vaka",
    studyKey: "finding.hiatal_hernia",
    progress: topic("diaphragm", OPACA_BADGE_RULES.diaphragm),
  },
  {
    id: "bone",
    category: "topic",
    icon: "Bone",
    name: "Kemik Gözü",
    description: `${OPACA_BADGE_RULES.bone} kırık vakasını doğru tanı.`,
    rule: "5 kırık",
    studyKey: "finding.fracture",
    progress: topic("bone", OPACA_BADGE_RULES.bone),
  },
  {
    id: "vascular",
    category: "topic",
    icon: "Wave",
    name: "Damar Yolu",
    description: `${OPACA_BADGE_RULES.vascular} pulmoner vasküler vakayı doğru tanı.`,
    rule: "3 vaka",
    studyKey: "finding.westermark_sign",
    progress: topic("vascular", OPACA_BADGE_RULES.vascular),
  },
  {
    id: "streak-3",
    category: "streak",
    icon: "Flame",
    name: "3 Günlük Seri",
    description: "3 gün üst üste en az bir oturum.",
    rule: "3 gün",
    progress: (s) => ({ value: s.streakLongest, max: OPACA_BADGE_RULES.streak[0] }),
  },
  {
    id: "streak-7",
    category: "streak",
    icon: "Flame",
    name: "7 Günlük Seri",
    description: "7 gün üst üste en az bir oturum.",
    rule: "7 gün",
    progress: (s) => ({ value: s.streakLongest, max: OPACA_BADGE_RULES.streak[1] }),
  },
  {
    id: "streak-30",
    category: "streak",
    icon: "Flame",
    name: "Ay Boyu Seri",
    description: "30 gün üst üste en az bir oturum.",
    rule: "30 gün",
    progress: (s) => ({ value: s.streakLongest, max: OPACA_BADGE_RULES.streak[2] }),
  },
  {
    id: "marathon",
    category: "streak",
    icon: "Chart",
    name: "Maraton",
    description: `${OPACA_BADGE_RULES.marathon} değerlendirme oturumu tamamla.`,
    rule: "50 oturum",
    progress: (s) => ({ value: s.assessmentCount, max: OPACA_BADGE_RULES.marathon }),
  },
  {
    id: "explorer",
    category: "learn",
    icon: "Book",
    name: "Öğrenme Kaşifi",
    description: `Öğrenme modunda ${OPACA_BADGE_RULES.explorerTopics} farklı konu incele.`,
    rule: "10 konu",
    progress: (s) => ({ value: s.learnTopicsCount, max: OPACA_BADGE_RULES.explorerTopics }),
  },
  {
    id: "ct-explorer",
    category: "learn",
    icon: "Diaphragm",
    name: "BT Kaşifi",
    description: "Bir toraks BT kesit yığınını baştan sona tara.",
    rule: "1 BT serisi",
    studyKey: "ct.axial_anatomy",
    progress: (s) => ({ value: s.ctStacksCompletedCount, max: 1 }),
  },
  {
    id: "practice-grit",
    category: "learn",
    icon: "Graduation",
    name: "Uygulama Azmi",
    description: `Uygulama modunda ${OPACA_BADGE_RULES.practiceGrit} vaka çöz.`,
    rule: "20 vaka",
    progress: (s) => ({ value: s.practiceCaseTotal, max: OPACA_BADGE_RULES.practiceGrit }),
  },
  {
    id: "first-step",
    category: "milestone",
    icon: "Chart",
    name: "İlk Adım",
    description: "İlk değerlendirme oturumunu tamamla.",
    rule: "İlk değerlendirme",
    progress: (s) => ({ value: s.assessmentCount, max: 1 }),
  },
  {
    id: "threshold",
    category: "milestone",
    icon: "CheckCircle",
    name: "Eşik Aşıldı",
    description: "Bir değerlendirmede ilk kez 80 ve üzeri puan.",
    rule: "80 puan",
    progress: (s) => ({ value: s.bestAssessmentScore, max: OPACA_BADGE_RULES.thresholdScore }),
  },
  {
    id: "no-hints",
    category: "milestone",
    icon: "Lightbulb",
    name: "İpucusuz",
    description: `Uygulamada ipucu kullanmadan ${OPACA_BADGE_RULES.noHintsCaseMin} vakalık oturum.`,
    rule: "İpucusuz oturum",
    progress: (s) => ({ value: s.noHintPracticeSessionCount, max: 1 }),
  },
  {
    id: "perfect",
    category: "milestone",
    icon: "Star",
    name: "Kusursuz Oturum",
    description: "Bir değerlendirmede 100 puan.",
    rule: "100 puan",
    progress: (s) => ({ value: s.perfectSessionCount, max: 1 }),
  },
  {
    id: "podium",
    category: "milestone",
    icon: "Medal",
    name: "Podyum",
    description: "Aylık sıralamada ilk 3'e gir.",
    rule: "Aylık ilk 3",
  },
  {
    id: "all-topics",
    category: "milestone",
    icon: "Trophy",
    name: "Tüm Konular",
    description: "Kütüphanedeki her konuda en az bir doğru.",
    rule: "Tüm konular",
    progress: (s) => ({ value: s.allTopicsCoveredCount, max: s.allTopicsTotal }),
  },
];

/** Rozet kimliği → öğrenme modu çalışma anahtarı (katalogdan türetilir). */
export const STUDY_KEY: Record<string, string> = Object.fromEntries(
  OPACA_BADGES.filter((b) => b.studyKey).map((b) => [b.id, b.studyKey!]),
);

/** Rozet istatistiğine giren deneme alanları (sim `OpacaAttemptRecord` ile yapısal uyumlu). */
export interface OpacaSummaryInput {
  readonly mode: GamiMode;
  readonly finishedAt: string;
  readonly score: number;
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly extra: {
    readonly localizationHits: number;
    readonly abcdeComplete: number;
    readonly qualityCorrect: number;
    readonly interpretationCorrect: number;
    readonly fastPerfect: boolean;
    /** Bu denemedeki konu başına doğru bulgu sayısı (sim TOPIC_BADGE_MATCH ile hesaplar); kodlanamıyorsa kod yazılmaz. */
    readonly topicCorrect?: Partial<Record<OpacaTopic, number>>;
  };
  /** Sim'in deneme anındaki birikimli öğrenme sayaçları (rozet istatistiğinin girdisi); kabuk raporunda yoksa kodlanmaz. */
  readonly learn?: {
    /** Birikimli benzersiz öğrenme konusu sayısı. */
    readonly topicsCount: number;
    /** Birikimli tamamlanmış toraks BT yığını sayısı. */
    readonly stacksCount: number;
    /** Kütüphanedeki toplam konu sayısı. */
    readonly libraryTopicsTotal: number;
    /** Bu deneme dahil kütüphanede kapsanan konu sayısı. */
    readonly libraryTopicsCovered: number;
  };
}

/** Kod sözlüğü v1. Kod ekle/çıkar = sürüm değişikliği (`opaca.v`). */
export const OPACA_SUMMARY_VERSION = 1;

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : 0)));

/** TR takvim günü indeksi — `computeStreak`'in gün tanımıyla aynı (Europe/Istanbul, UTC+3). */
const dayIndexOf = (iso: string): number =>
  Math.floor(startOfDayTr(new Date(iso)).getTime() / 86_400_000);

/** Denemeyi sözleşmedeki kodlu özete çevirir (kod → sınırlı tam sayı; serbest metin yok). */
export function encodeOpacaSummary(input: OpacaSummaryInput): Record<string, number> {
  const assessment = input.mode === "assessment";
  const summary: Record<string, number> = {
    "opaca.v": OPACA_SUMMARY_VERSION,
    "opaca.mode": assessment ? 1 : 0,
    "opaca.score": clampInt(input.score, 0, 100),
    "opaca.cases": clampInt(input.caseCount, 0, 100),
    "opaca.hints": clampInt(input.hintsUsed, 0, 1000),
    "opaca.day": clampInt(dayIndexOf(input.finishedAt), 0, 1_000_000),
  };
  if (input.learn !== undefined) {
    summary["opaca.learn"] = clampInt(input.learn.topicsCount, 0, 100_000);
    summary["opaca.stacks"] = clampInt(input.learn.stacksCount, 0, 100_000);
    summary["opaca.lib"] = clampInt(input.learn.libraryTopicsTotal, 0, 100_000);
    summary["opaca.cov"] = clampInt(input.learn.libraryTopicsCovered, 0, 100_000);
  }
  if (assessment) {
    summary["opaca.loc"] = clampInt(input.extra.localizationHits, 0, 10_000);
    summary["opaca.abcde"] = clampInt(input.extra.abcdeComplete, 0, 1);
    summary["opaca.quality"] = clampInt(input.extra.qualityCorrect, 0, 100);
    summary["opaca.interp"] = clampInt(input.extra.interpretationCorrect, 0, 100);
    if (input.extra.fastPerfect) summary["opaca.fast"] = 1;
  }
  for (const topic of OPACA_TOPICS) {
    const hits = clampInt(input.extra.topicCorrect?.[topic] ?? 0, 0, 1000);
    if (hits > 0) summary[`opaca.t.${topic}`] = hits;
  }
  return summary;
}

/** Kodlu özetlerden rozet istatistiği; bilinmeyen/bozuk kodlar yok sayılır. */
export function opacaStatsFromSummaries(
  summaries: readonly Readonly<Record<string, number>>[],
): OpacaStats {
  let assessmentCount = 0;
  let practiceCaseTotal = 0;
  let localizationHits = 0;
  let abcdeCompleteCount = 0;
  let qualityCorrect = 0;
  let interpretationCorrect = 0;
  let fastPerfectCount = 0;
  let bestAssessmentScore = 0;
  let perfectSessionCount = 0;
  let noHintPracticeSessionCount = 0;
  let learnTopicsCount = 0;
  let ctStacksCompletedCount = 0;
  let allTopicsTotal = 0;
  let allTopicsCoveredCount = 0;
  const topicCorrect: Partial<Record<OpacaTopic, number>> = {};
  const days = new Set<number>();
  for (const summary of summaries) {
    if (summary["opaca.v"] !== OPACA_SUMMARY_VERSION) continue;
    const assessment = summary["opaca.mode"] === 1;
    if (assessment) {
      assessmentCount += 1;
      localizationHits += clampInt(summary["opaca.loc"] ?? 0, 0, 10_000);
      abcdeCompleteCount += clampInt(summary["opaca.abcde"] ?? 0, 0, 1);
      qualityCorrect += clampInt(summary["opaca.quality"] ?? 0, 0, 100);
      interpretationCorrect += clampInt(summary["opaca.interp"] ?? 0, 0, 100);
      const score = clampInt(summary["opaca.score"] ?? 0, 0, 100);
      if (summary["opaca.fast"] === 1) fastPerfectCount += 1;
      if (score === 100) perfectSessionCount += 1;
      bestAssessmentScore = Math.max(bestAssessmentScore, score);
    } else {
      practiceCaseTotal += clampInt(summary["opaca.cases"] ?? 0, 0, 100);
      const hints = clampInt(summary["opaca.hints"] ?? 0, 0, 1000);
      const cases = clampInt(summary["opaca.cases"] ?? 0, 0, 100);
      if (hints === 0 && cases >= OPACA_BADGE_RULES.noHintsCaseMin) noHintPracticeSessionCount += 1;
    }
    for (const topic of OPACA_TOPICS) {
      topicCorrect[topic] = (topicCorrect[topic] ?? 0) + clampInt(summary[`opaca.t.${topic}`] ?? 0, 0, 1000);
    }
    const day = summary["opaca.day"];
    if (typeof day === "number" && Number.isInteger(day)) days.add(day);
    learnTopicsCount = Math.max(learnTopicsCount, clampInt(summary["opaca.learn"] ?? 0, 0, 100_000));
    ctStacksCompletedCount = Math.max(ctStacksCompletedCount, clampInt(summary["opaca.stacks"] ?? 0, 0, 100_000));
    allTopicsTotal = Math.max(allTopicsTotal, clampInt(summary["opaca.lib"] ?? 0, 0, 100_000));
    allTopicsCoveredCount = Math.max(allTopicsCoveredCount, clampInt(summary["opaca.cov"] ?? 0, 0, 100_000));
  }
  const sortedDays = [...days].sort((a, b) => a - b);
  let streakLongest = 0;
  if (sortedDays.length > 0) {
    streakLongest = 1;
    let run = 1;
    for (let i = 1; i < sortedDays.length; i += 1) {
      const day = sortedDays[i]!;
      const previous = sortedDays[i - 1]!;
      run = day === previous + 1 ? run + 1 : 1;
      streakLongest = Math.max(streakLongest, run);
    }
  }
  return {
    streakLongest,
    assessmentCount,
    practiceCaseTotal,
    localizationHits,
    abcdeCompleteCount,
    qualityCorrect,
    interpretationCorrect,
    fastPerfectCount,
    bestAssessmentScore,
    perfectSessionCount,
    noHintPracticeSessionCount,
    topicCorrect,
    learnTopicsCount,
    ctStacksCompletedCount,
    allTopicsCoveredCount,
    allTopicsTotal,
  };
}

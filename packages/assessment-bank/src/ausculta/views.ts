/**
 * T233 — Ausculta görünüm izin kuralının banka (sunucu) tarafı: vaka türüne göre
 * izinli gövde görünümleri, mod bazlı sunulabilirlik ve soru seçeneklerinin
 * görünüm güvenliği. Kuralın kendisi `@egemed/contracts` içindedir (tek saf
 * fonksiyon); burada yalnız veriyle (atamalar, nokta görünüm haritası) beslenir.
 */

import { allowedAuscultaViews, auscultaViewCategory, type AuscultaView, type AuscultaViewCategory, type SimSessionMode } from "@egemed/contracts";
import pointsJson from "../../../sim-ausculta/src/data/auscultation-points.json" with { type: "json" };
import { assessmentPointFilter, resolveCaseSoundsEx } from "./resolver";
import type { CaseDef, Question } from "./types";

interface PointRef {
  readonly id: string;
  readonly view: AuscultaView;
  readonly label: string;
  readonly fullLabel: string;
}

/** Nokta → görünüm haritası: veri sim paketinde kalır (ses manifestleri gibi). */
const POINTS: readonly PointRef[] = (pointsJson as unknown as { points: PointRef[] }).points;
const VIEW_BY_POINT = new Map(POINTS.map((point) => [point.id, point.view]));

export function viewOfPoint(pointId: string): AuscultaView | undefined {
  return VIEW_BY_POINT.get(pointId);
}

/** Mod başına sunulabilir noktalar: uygulamada fallback'li noktalar dahil,
 *  değerlendirme/düelloda O7 `assessmentPointFilter` sonrası. Kaydı çözülemeyen
 *  nokta zaten sunulmaz; izinli görünüm süzgeci `publicCaseViewPlan` ile uygulanır. */
export function presentedPointIds(caseDef: CaseDef, mode: SimSessionMode): string[] {
  const { sounds } = resolveCaseSoundsEx(caseDef.soundAssignments);
  const ids = mode === "practice" ? caseDef.soundAssignments.map((a) => a.pointId) : assessmentPointFilter(caseDef.soundAssignments);
  return ids.filter((pointId) => sounds[pointId] !== null && sounds[pointId] !== undefined);
}

/** Sunulan noktalardan türeyen görünümler (kanonik sıra: ön → arka). */
export function presentableViews(pointIds: readonly string[]): AuscultaView[] {
  const present = new Set<AuscultaView>();
  for (const pointId of pointIds) {
    const view = VIEW_BY_POINT.get(pointId);
    if (view !== undefined) present.add(view);
  }
  return (["front", "back"] as const).filter((view) => present.has(view));
}

/** Vaka kategorisi: tüm atamalar aynı kategoriyse o, değilse `mixed`. */
export function caseCategory(caseDef: CaseDef): AuscultaViewCategory {
  return auscultaViewCategory(caseDef.soundAssignments.map((assignment) => assignment.category));
}

/** Mod bazlı izinli görünümler: kategori kuralı ∩ sunulabilir görünümler,
 *  geri düşüş sırasıyla `presentableViews` ve vakanın bildirdiği görünümler. */
export function allowedViewsForCase(caseDef: CaseDef, mode: SimSessionMode): AuscultaView[] {
  return allowedAuscultaViews(caseCategory(caseDef), presentableViews(presentedPointIds(caseDef, mode)), caseDef.views);
}

function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}

function pointLabelVariants(point: PointRef): string[] {
  return point.fullLabel
    .split("/")
    .map(normalizeLabel)
    .filter((variant) => variant.length >= 3);
}

/** Konum/bölge soran seçeneklerde etiket bir oskültasyon noktasına işaret ediyorsa
 *  o noktaların kimlikleri. Eşleşme yalnız tam etiket üzerinden ve kelime sınırında
 *  başlar: "Mitral odak (apeks)" → cardiac_mitral; "Aort → Pulmoner → …" gibi
 *  sıralama metinleri ve kısa etiket ("Sağ üst") önekleri eşleşmez. */
export function optionPointIds(label: string, points: readonly PointRef[] = POINTS): string[] {
  const normalized = normalizeLabel(label);
  return points
    .filter((point) => pointLabelVariants(point).some((variant) => normalized === variant || normalized.startsWith(`${variant} `)))
    .map((point) => point.id);
}

export interface QuestionViewSafety {
  /** Seçenekleri izinli görünümlere süzülmüş sorular. */
  readonly questions: readonly Question[];
  /** Doğru cevap gizlenen bir noktayı gösteriyorsa genişletilmiş izinli görünümler. */
  readonly allowed: AuscultaView[];
}

interface PublicCaseViewPlan extends QuestionViewSafety {
  /** Public case'te gerçekten sunulacak noktalar (izinli görünüm süzgeci dahil). */
  readonly pointIds: string[];
}

interface OptionRef {
  readonly optionId: string;
  readonly views: AuscultaView[];
}

function optionRefs(question: Question): OptionRef[] {
  return question.options.map((option) => ({
    optionId: option.id,
    views: optionPointIds(option.label).flatMap((pointId) => {
      const view = viewOfPoint(pointId);
      return view === undefined ? [] : [view];
    }),
  }));
}

/**
 * T233 soru güvenliği:
 * - Doğru cevabı gizli görünümdeki bir noktayı gösteren soru SİLİNMEZ; o görünüm(ler)
 *   izinli listeye eklenir (güvenli geri düşüş) ve noktaları yeniden sunulur.
 * - Kalan gizli seçenekler public listeden çıkarılır; süzme sonrası sözleşmenin
 *   en az 2 seçenek kuralı bozulacaksa seçenekler olduğu gibi bırakılır.
 */
export function applyViewRuleToQuestions(questions: readonly Question[], allowed: readonly AuscultaView[]): QuestionViewSafety {
  const allowedSet = new Set(allowed);
  const refs = new Map(questions.map((question) => [question.id, optionRefs(question)]));
  const needed = new Set<AuscultaView>();
  for (const question of questions) {
    for (const ref of refs.get(question.id) ?? []) {
      if (question.correct.includes(ref.optionId) && ref.views.length > 0 && ref.views.every((view) => !allowedSet.has(view))) {
        for (const view of ref.views) needed.add(view);
      }
    }
  }
  const extended = (["front", "back"] as const).filter((view) => allowedSet.has(view) || needed.has(view));
  const finalSet = new Set(extended);
  const filtered = questions.map((question) => {
    const hidden = new Set(
      (refs.get(question.id) ?? [])
        .filter((ref) => ref.views.length > 0 && ref.views.every((view) => !finalSet.has(view)))
        .map((ref) => ref.optionId),
    );
    if (hidden.size === 0) return question;
    const options = question.options.filter((option) => !hidden.has(option.id));
    return options.length >= 2 ? { ...question, options } : question;
  });
  return { questions: filtered, allowed: extended };
}

/** `buildPublicCase` ve notlandırma için tam görünüm planı (kural + soru güvenliği).
 *  Hem public case `points`/`views` alanları hem teknik rubriği bu plandan beslenir. */
export function publicCaseViewPlan(caseDef: CaseDef, mode: SimSessionMode): PublicCaseViewPlan {
  const safety = applyViewRuleToQuestions(caseDef.questions, allowedViewsForCase(caseDef, mode));
  const allowed = new Set(safety.allowed);
  const pointIds = presentedPointIds(caseDef, mode).filter((pointId) => {
    const view = viewOfPoint(pointId);
    return view !== undefined && allowed.has(view);
  });
  return { allowed: safety.allowed, questions: safety.questions, pointIds };
}

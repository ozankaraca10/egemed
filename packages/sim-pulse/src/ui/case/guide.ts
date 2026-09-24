/** Kaynak rehber adımları ve ritme göre saf adım seçimi. */
export type GuidePhase = "atrial" | "qrs" | "eject" | "t" | "fill";
export interface GuideStep { readonly phase: GuidePhase; readonly title: string; readonly description: string }

const STANDARD_STEPS: readonly GuideStep[] = [
  { phase: "atrial", title: "P dalgası ve atriyum", description: "Uyarı sinüs düğümünden atriyuma yayılır. Atriyal kasılma doluşu tamamlar." },
  { phase: "qrs", title: "QRS ve ventrikül", description: "Ventriküler depolarizasyon mekanik kasılmadan hemen önce oluşur." },
  { phase: "eject", title: "ST ve ejeksiyon", description: "Basınç yükselince çıkış kapakları açılır ve kan pulmoner arter ile aortaya pompalanır." },
  { phase: "t", title: "T dalgası", description: "Ventriküler repolarizasyon, ejeksiyonun son bölümüyle örtüşebilir." },
  { phase: "fill", title: "Doluş", description: "Ventrikül basıncı düşünce AV kapakları açılır ve döngü yeniden başlar." },
];
const VF_STEPS: readonly GuideStep[] = [
  { phase: "qrs", title: "Kaotik elektriksel etkinlik", description: "VF’de organize QRS ve ölçülebilir elektriksel hız yoktur." },
  { phase: "fill", title: "Etkili dolaşım yok", description: "VF’de organize kasılma, ejeksiyon ve ileri akım gösterilmez." },
];

export function guideSteps(mode: string, noP: readonly string[] = []): readonly GuideStep[] {
  if (mode === "vf") return VF_STEPS;
  const steps = mode === "pat"
    ? STANDARD_STEPS.map((step, i) => i === 0 ? { ...step, title: "Ektopik P ve atriyum", description: "Sinüs düğümü dışındaki atriyal depolarizasyonu şematik kasılma izler." } : step)
    : STANDARD_STEPS;
  return noP.includes(mode) ? steps.filter((step) => step.phase !== "atrial") : steps;
}

export function guideStepAt(steps: readonly GuideStep[], index: number): GuideStep | null {
  if (steps.length === 0) return null;
  const normalized = ((Math.trunc(index) % steps.length) + steps.length) % steps.length;
  return steps[normalized] ?? null;
}

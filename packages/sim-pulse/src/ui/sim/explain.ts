import type { Mode } from "../../engine/shapes";

export type SystematicLabel = "rate" | "rhythm" | "pWave" | "pr" | "qrs" | "stT";
export interface SystematicFinding {
  readonly labelKey: `sim.pulse.systematic.${SystematicLabel}`;
  readonly value: string;
}

type FindingValues = readonly [string, string, string, string, string, string];
const SYSTEMATIC: Readonly<Record<Mode, FindingValues>> = {
  normal: ["75/dk", "Düzenli", "Her QRS öncesinde var", "Yaklaşık 175 ms", "Dar · 80 ms", "İzoelektrik ST, pozitif T"],
  af: ["Yaklaşık 60–100/dk", "Düzensiz düzensiz", "Seçilemez; f dalgaları", "Ölçülemez", "Genellikle dar · 80 ms", "Bu örnekte akut ST yükselmesi yok"],
  stemi: ["75/dk", "Düzenli sinüs ritmi", "Her QRS öncesinde var", "Yaklaşık 175 ms", "Dar · 80 ms", "J noktası +0,32 mV"],
  pvc: ["Temel sinüs hızı 75/dk", "Aralıklı erken ventriküler atım", "PVC öncesinde ilişkili P yok", "Sinüs atımlarında yaklaşık 175 ms", "PVC’de geniş · yaklaşık 140 ms", "PVC sonrası diskordan değişiklik"],
  svt: ["Yaklaşık 167/dk", "Düzenli taşikardi", "Bu örnekte seçilemiyor", "Ölçülemez", "Dar · 80 ms", "Kısa döngü nedeniyle T sonraki komplekse yakın"],
  inferior: ["75/dk", "Düzenli sinüs ritmi", "Her QRS öncesinde var", "Yaklaşık 175 ms", "Dar · 80 ms", "J noktası +0,20 mV"],
  vt: ["Yaklaşık 158/dk", "Düzenli ventriküler taşikardi", "QRS ile sabit ilişki yok", "Ölçülemez", "Geniş · yaklaşık 180 ms", "Geniş komplekse sekonder diskordans"],
  vf: ["Hesaplanamaz", "Kaotik", "Seçilemez", "Ölçülemez", "Organize kompleks yok", "Ayırt edilemez"],
  pat: ["Yaklaşık 150/dk", "Düzenli atriyal taşikardi", "Ektopik morfoloji", "Sabit ·140 ms", "Dar · 80 ms", "Hız nedeniyle T–P yakın"],
  flutter: ["Atriyal 300 · ventriküler 150/dk", "Düzenli 2:1 iletim", "P yok; sürekli F dalgaları", "Ölçülemez", "Dar · 80 ms", "F dalgaları temel hattı doldurur"],
  sintach: ["Yaklaşık 120/dk", "Düzenli sinüs taşikardisi", "Her QRS öncesinde sinüs P", "Sabit", "Dar · 80 ms", "Bu örnekte akut değişiklik yok"],
  lbbb: ["75/dk", "Düzenli sinüs ritmi", "Her QRS öncesinde var", "175 ms", "Geniş ·160 ms", "QRS’ye sekonder diskordans"],
  rbbb: ["75/dk", "Düzenli sinüs ritmi", "Her QRS öncesinde var", "175 ms", "Geniş ·140 ms", "V1–V3’te sekonder değişiklik"],
};

const LABELS: readonly SystematicLabel[] = ["rate", "rhythm", "pWave", "pr", "qrs", "stT"];

export interface SystematicOptions {
  readonly afProfile?: "rapid" | "controlled";
  readonly lead?: string;
  readonly stValue?: number;
}

function decimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Six authored ECG-reading findings. Labels are chrome keys; finding text remains authored content. */
export function systematicReadout(mode: Mode, options: SystematicOptions = {}): readonly SystematicFinding[] {
  const values = [...SYSTEMATIC[mode]];
  if (mode === "af" && options.afProfile === "rapid") values[0] = "Yaklaşık 110–175/dk";
  if (mode === "stemi" || mode === "inferior") {
    if (options.stValue === undefined) {
      const lead = options.lead ?? (mode === "stemi" ? "V3" : "aVF");
      values[5] = `${lead} ${mode === "stemi" ? "derivasyonunda " : ""}J noktası ${mode === "stemi" ? "+0,32" : "+0,20"} mV`;
    } else {
    const sign = options.stValue >= 0 ? "+" : "";
    values[5] = `${options.lead ?? (mode === "stemi" ? "V3" : "aVF")} ${mode === "stemi" ? "derivasyonunda " : ""}J noktası ${sign}${decimal(options.stValue)} mV`;
    }
  }
  return values.map((value, index) => ({
    labelKey: `sim.pulse.systematic.${LABELS[index] ?? "rate"}` as const,
    value,
  }));
}

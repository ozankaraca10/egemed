/** Kalp SVG'sinde faza göre vurgulanan anatomik bölgeler (DOM bağımsız). */
export const HEART_PHASES = ["atrial", "qrs", "eject", "t", "fill", "chaotic"] as const;
export type HeartPhase = (typeof HEART_PHASES)[number];

export const HEART_REGIONS = [
  "atria", "ventricles", "conduction", "av-valves", "outflow-valves", "ischemia", "fibrillation",
] as const;
export type HeartRegion = (typeof HEART_REGIONS)[number];

const PHASE_REGIONS: Readonly<Record<HeartPhase, readonly HeartRegion[]>> = {
  atrial: ["atria", "conduction"],
  qrs: ["ventricles", "conduction"],
  eject: ["ventricles", "outflow-valves"],
  t: ["ventricles"],
  fill: ["atria", "ventricles", "av-valves"],
  chaotic: ["ventricles", "fibrillation"],
};

/** Bilinmeyen fazlar nötr şemaya döner; fonksiyon girdi üzerinde değişiklik yapmaz. */
export function highlightedHeartRegions(phase: HeartPhase | string): readonly HeartRegion[] {
  return PHASE_REGIONS[(HEART_PHASES as readonly string[]).includes(phase) ? phase as HeartPhase : "fill"];
}

export function isHeartRegionActive(phase: HeartPhase | string, region: HeartRegion): boolean {
  return highlightedHeartRegions(phase).includes(region);
}

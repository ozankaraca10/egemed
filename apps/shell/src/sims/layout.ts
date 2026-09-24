import type { SimulatorId } from "@egemed/sim-host";

/**
 * Kabuk içerik genişliği sınırını ve host kartını kaldıran simler. Pulse kaynak
 * runtime'ı 16:9 öğretim ekranı için tam genişlikte tasarlanmıştır (PULSE-04).
 */
export const FULL_BLEED_SIMS: ReadonlySet<SimulatorId> = new Set<SimulatorId>(["pulse"]);

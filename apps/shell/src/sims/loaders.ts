import type { SimModule, SimModuleLoader, SimulatorId } from "@egemed/sim-host";

/**
 * Sim başına tek dinamik `import()` noktası. Sim paketleri mount dışa
 * aktarmaya başlayınca yalnız bu tablodaki satır değişir (ör.
 * `pulse: () => import("@egemed/sim-pulse")`); kabuk kodu ve sözleşme aynı
 * kalır. Üç satır aynı yer tutucuyu işaret ettiği için derlemede tek lazy
 * chunk oluşur.
 */
type SimChunkLoader = () => Promise<SimModule>;

const SIM_CHUNKS: Record<SimulatorId, SimChunkLoader> = {
  ausculta: () => import("./placeholder").then((chunk) => chunk.createPlaceholderModule("ausculta")),
  opaca: () => import("./placeholder").then((chunk) => chunk.createPlaceholderModule("opaca")),
  pulse: () => import("./placeholder").then((chunk) => chunk.createPlaceholderModule("pulse")),
};

/** `SimModuleLoader`: istenen simin lazy modülünü döndürür. */
export const loadSimModule: SimModuleLoader = (simId) => SIM_CHUNKS[simId]();

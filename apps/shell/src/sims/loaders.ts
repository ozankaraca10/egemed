import type { SimModule, SimModuleLoader, SimulatorId } from "@egemed/sim-host";

/**
 * Sim başına tek dinamik `import()` noktası. Sim paketleri mount dışa
 * aktarmaya başlayınca yalnız bu tablodaki satır değişir; kabuk kodu ve
 * sözleşme aynı kalır. Opaca gerçek modülüne bağlanır (T14c, @egemed/sim-opaca
 * kendi lazy chunk'ıdır); pulse/ausculta S15a/S18a'ya dek yer tutucuda kalır.
 */
type SimChunkLoader = () => Promise<SimModule>;

const SIM_CHUNKS: Record<SimulatorId, SimChunkLoader> = {
  ausculta: () => import("./placeholder").then((chunk) => chunk.createPlaceholderModule("ausculta")),
  opaca: () => import("@egemed/sim-opaca").then((mod) => mod.opacaModule),
  pulse: () => import("./placeholder").then((chunk) => chunk.createPlaceholderModule("pulse")),
};

/** `SimModuleLoader`: istenen simin lazy modülünü döndürür. */
export const loadSimModule: SimModuleLoader = (simId) => SIM_CHUNKS[simId]();

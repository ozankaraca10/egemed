import type { SimModule, SimModuleLoader, SimulatorId } from "@egemed/sim-host";

/**
 * Sim başına tek dinamik `import()` noktası. Sim paketleri mount dışa
 * aktarmaya başlayınca yalnız bu tablodaki satır değişir; kabuk kodu ve
 * sözleşme aynı kalır. Üç sim de gerçek modüllerine bağlanır (Opaca T14c,
 * Pulse T14d, Ausculta T14e); her satır kendi lazy chunk'ıdır ve yer tutucu
 * dönemi kapanmıştır.
 */
type SimChunkLoader = () => Promise<SimModule>;

const SIM_CHUNKS: Record<SimulatorId, SimChunkLoader> = {
  ausculta: () => import("@egemed/sim-ausculta").then((mod) => mod.auscultaModule),
  opaca: () => import("@egemed/sim-opaca").then((mod) => mod.opacaModule),
  pulse: () => import("@egemed/sim-pulse").then((mod) => mod.pulseModule),
};

/** `SimModuleLoader`: istenen simin lazy modülünü döndürür. */
export const loadSimModule: SimModuleLoader = (simId) => SIM_CHUNKS[simId]();

const prefetched = new Set<SimulatorId>();

/**
 * Yumuşak geçiş: kullanıcı sim kartına yaklaştığında (üzerine gelme, odak,
 * dokunma başlangıcı) modülün lazy chunk'ı önceden indirilir; rota açılınca
 * iskelet neredeyse görünmez. Hata sessizdir; asıl yükleme yine dener.
 */
export function prefetchSimModule(simId: SimulatorId): void {
  if (prefetched.has(simId)) return;
  prefetched.add(simId);
  void SIM_CHUNKS[simId]().catch(() => {
    prefetched.delete(simId);
  });
}

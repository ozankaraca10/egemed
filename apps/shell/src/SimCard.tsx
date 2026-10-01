/** Simülatör kimlikleri; sıra AGENTS.md'deki Pulse → Ausculta → Opaca sırasıdır. */
export const SIM_IDS = ["pulse", "ausculta", "opaca"] as const;
export type SimId = (typeof SIM_IDS)[number];

/**
 * Giriş ekranı sol paneli için beyaz sim ikonları. Üç kaynak da beyaz-saydam
 * PNG'dir (Pulse marka kitindeki `09_..._symbol-white.png`); CSS filtresi
 * gerekmez. `width`/`height` doğal piksel oranıdır.
 */
export const SIM_ICONS: Record<SimId, { src: string; width: number; height: number }> = {
  ausculta: { height: 256, src: "/brand/sims/ausculta-icon-white.png", width: 256 },
  opaca: { height: 256, src: "/brand/sims/opaca-icon-white.png", width: 256 },
  pulse: { height: 1024, src: "/brand/sims/pulse-icon-white.png", width: 1024 },
};

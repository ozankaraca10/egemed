/// <reference lib="dom" />
/**
 * Pulse sonuç ekranı kazanım kartı — Opaca ve Ausculta ile AYNI tasarım
 * (`@egemed/gami-ui` GamiGainsView). `progress.tsx`teki `mountPulseProgress`
 * emsali: kaynak gölge kökündeki bir kapsayıcıya React kökü kurulur; model
 * hazır oldukça `update` ile çizilir. Eylemler İlerlemem sayfasını açar.
 */
import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GamiGainsView, defaultGamiIcons } from "@egemed/gami-ui";
import type { GamiGainsModel } from "@egemed/gami-ui";

export interface PulseGainsActions {
  /** "Başarılarımı gör": İlerlemem sayfasını (Başarılarım) açar. */
  readonly onAchievements: () => void;
  /** API oturumunda veriler sunucudan: “Demo verisi” etiketi çizilmez. */
  readonly serverData?: boolean;
  /** "Sıralamaya bak": İlerlemem sayfasını (Liderlik) açar. */
  readonly onLeaderboard: () => void;
}

export interface PulseGainsHandle {
  update(model: GamiGainsModel): void;
  dispose(): void;
}

function PulseGainsCard({ model, actions }: { model: GamiGainsModel; actions: PulseGainsActions }): JSX.Element {
  return (
    <GamiGainsView
      gains={model}
      icons={defaultGamiIcons}
      onAchievements={actions.onAchievements}
      onLeaderboard={actions.onLeaderboard}
      {...(actions.serverData ? { demoLabel: "" } : {})}
    />
  );
}

/** Gölge kök içindeki `container`a React kökü kurar; model değiştikçe `update`. */
export function mountPulseGains(container: HTMLElement, actions: PulseGainsActions): PulseGainsHandle {
  const root: Root = createRoot(container);
  return {
    dispose: () => root.unmount(),
    update: (model) => root.render(<PulseGainsCard actions={actions} model={model} />),
  };
}

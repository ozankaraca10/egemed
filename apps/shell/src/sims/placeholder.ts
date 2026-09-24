import type { SimDispose, SimModule, SimMountTarget, SimulatorId } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { routeHref, simTitleKey } from "../routes";

/**
 * Sim paketleri kendi `mount` dışa aktarımlarını yayınlayana kadar kullanılan
 * kabuk içi yer tutucu (Opaca S19, Ausculta S18a, Pulse S15a sonrası silinir).
 * Vanilla TS'tir, React'e bağlanmaz; metinler sözlükten gelir ve kökü
 * dispose'ta kaldırır (SimHost sözleşmesi).
 */

/** Kök tsconfig DOM lib'i taşımadığı için yalnız kullanılan DOM yüzeyi tanımlanır. */
interface PlaceholderElement {
  appendChild(node: unknown): unknown;
  remove(): void;
  setAttribute(name: string, value: string): void;
  className: string;
  textContent: string;
}

interface PlaceholderDocument {
  createElement(tag: string): PlaceholderElement;
}

/** DOM yoksa (SSR/test) çizim atlanır; simler yalnız tarayıcıda mount edilir. */
function placeholderDocument(): PlaceholderDocument | null {
  return (globalThis as { document?: PlaceholderDocument }).document ?? null;
}

/** İstenen sim kimliğiyle eşleşen yer tutucu modülü üretir. */
export function createPlaceholderModule(simId: SimulatorId): SimModule {
  return {
    id: simId,
    mount(target: SimMountTarget): SimDispose {
      const doc = placeholderDocument();
      if (doc === null) return () => undefined;

      const root = doc.createElement("div");
      root.className = "eg-shell-sim-placeholder";

      const text = doc.createElement("p");
      text.className = "eg-shell-sim-placeholder__text";
      text.textContent = `${t(simTitleKey(simId))} · ${t("sims.soon")}`;

      const back = doc.createElement("a");
      back.className = "eg-shell-sim-placeholder__back";
      back.setAttribute("href", routeHref("simulators"));
      back.textContent = t("shell.nav.simulators");

      root.appendChild(text);
      root.appendChild(back);
      target.appendChild(root);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        root.remove();
      };
    },
  };
}

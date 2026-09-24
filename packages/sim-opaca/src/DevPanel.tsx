import type { JSX } from "react";
import { useStore } from "./core/StoreProvider";

/** Geliştirici teşhis paneli — yalnız `devBuild && devQuery` iken App çizer; üretim rotasına girmez. */
export function DevPanel(): JSX.Element {
  const { bus } = useStore();
  const log = bus.getLog();
  const tail = log.slice(-12);
  return (
    <aside className="dev-panel" aria-label="Geliştirici paneli">
      <h2 className="dev-panel-title">Olay günlüğü ({log.length})</h2>
      <pre className="dev-panel-log">{tail.length ? JSON.stringify(tail, null, 2) : "Henüz olay yok."}</pre>
    </aside>
  );
}

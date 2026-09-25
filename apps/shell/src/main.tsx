import { createRoot } from "react-dom/client";
import "@egemed/tokens/family-tokens.css";
import "@egemed/tokens/platform-tokens.css";
import "@egemed/ui/components.css";
import "@egemed/ui/primitives.css";
import "@egemed/gami-ui/styles.css";
import "./shell.css";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) throw new Error("Kabuk kökü (#root) bulunamadı.");
const root = createRoot(container);
// T151: bileşen vitrini yalnız geliştirmede (`#/_vitrin`); üretim paketine girmez.
if (import.meta.env.DEV && window.location.hash.startsWith("#/_vitrin")) {
  void import("./dev/UiShowcase").then(({ UiShowcase }) => root.render(<UiShowcase />));
} else {
  root.render(<App />);
}

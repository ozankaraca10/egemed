import { createRoot } from "react-dom/client";
import "@egemed/tokens/family-tokens.css";
import "@egemed/ui/components.css";
import "@egemed/gami-ui/styles.css";
import "./shell.css";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) throw new Error("Kabuk kökü (#root) bulunamadı.");
createRoot(container).render(<App />);

/// <reference lib="dom" />
/**
 * Pulse kaynak runtime'ını birleşik bara bağlar (UX kararı, 25 Eylül 2026).
 *
 * Kaynağın kendi üst çubuğu gömülü modda gizlidir (host EMBED_CSS). Onun
 * düğmeleri (İlerlemem, Mod değiştir, Tam ekran, Yardım, Hakkında), adım
 * durumu ve mod çipi `SimChrome` olarak kabuğa verilir; eylemler kaynağın
 * gizli düğmelerini tıklar, böylece davranış kaynakla aynı kalır.
 */
import type { SimChrome, SimChromeAction, SimChromeChip } from "@egemed/sim-host";
import type { PulseRuntimeHandle } from "./host";

const STEP_LABELS = ["Mod seçimi", "Çalışma", "Tamamla"] as const;

type ActiveView = "modes" | "sim" | "case" | "quiz" | "results" | "about" | "tutorial" | string;

function stepFor(view: ActiveView, previous: number): number {
  if (view === "modes") return 0;
  if (view === "results") return 2;
  if (view === "sim" || view === "case" || view === "quiz" || view === "tutorial") return 1;
  return previous;
}

function toneFor(text: string): NonNullable<SimChromeChip["tone"]> {
  const lower = text.toLocaleLowerCase("tr-TR");
  if (lower.includes("inceleme")) return "learn";
  if (lower.includes("uygulama")) return "practice";
  if (lower.includes("değerlendirme")) return "assessment";
  return "neutral";
}

/** Kaynak düğmesi görünür durumdaymış gibi etkin mi (gizli üst çubukta `hidden` özniteliği). */
function available(button: HTMLElement | null): button is HTMLElement {
  return button !== null && !button.hidden && !(button as HTMLButtonElement).disabled;
}

export function attachPulseChrome(
  handle: PulseRuntimeHandle,
  setChrome: (chrome: SimChrome | null) => void,
): () => void {
  const shadow = handle.shadow;
  const byId = (id: string): HTMLElement | null => shadow.getElementById(id);
  const controller = handle.global("CardAIController") as { readonly state: { readonly activeView: ActiveView } } | undefined;
  let step = 0;
  let detached = false;
  let lastKey = "";

  const click = (id: string) => () => byId(id)?.click();

  const publish = (): void => {
    if (detached) return;
    const view = controller?.state.activeView ?? "modes";
    step = stepFor(view, step);
    const actions: SimChromeAction[] = [];
    if (byId("egemedGamiBtn") !== null) actions.push({ icon: "progress", id: "progress", label: "İlerlemem", onSelect: click("egemedGamiBtn") });
    if (view !== "modes" && available(byId("modeSwitch"))) {
      actions.push({ icon: "swap", id: "modes", label: "Mod değiştir", onSelect: click("modeSwitch") });
    }
    actions.push({ icon: "fullscreen", id: "fullscreen", label: "Tam ekran", onSelect: click("fullscreenBtn") });
    actions.push({ icon: "help", id: "help", label: "Yardım", onSelect: click("helpBtn") });
    actions.push({ icon: "info", id: "about", label: "Hakkında", onSelect: click("aboutBtn") });

    const chips: SimChromeChip[] = [];
    const context = byId("headerContext");
    if (context !== null && !context.hidden) {
      const mode = byId("modeChip")?.textContent?.trim() ?? "";
      if (mode.length > 0) chips.push({ id: "mode", label: mode, tone: toneFor(mode) });
      const progress = byId("progressText")?.textContent?.trim() ?? "";
      if (progress.length > 0) chips.push({ id: "progress", label: progress, tone: "neutral" });
    }
    // Adımlara tıklama (26 Eyl 2026 kararı, T181): yalnız 0 (Mod seçimi)
    // desteklenir — "Çalışma" (1) sonuç ekranından (2) geri dönülecek anlamlı
    // bir ekran değildir, bu yüzden yok sayılır. Mod seçimine dönüş kaynağın
    // kendi `modeSwitch` düğmesini tıklar; değerlendirme (quiz) sürüyorsa
    // kaynağın süre kaybı uyarısı (`quizExitDialog`) devreye girer, uygulama
    // (case) modunda yanıtlar otomatik kaydedildiğinden onay gerekmez.
    const stepsOnSelect = (index: number): void => {
      if (index !== 0) return;
      click("modeSwitch")();
    };
    const chrome: SimChrome = { actions, chips, steps: { current: step, labels: STEP_LABELS, onSelect: stepsOnSelect } };
    // Aynı durumu tekrar göndermez (MutationObserver sık tetiklenir).
    const key = JSON.stringify({ a: actions.map((a) => a.id), c: chips, s: step });
    if (key === lastKey) return;
    lastKey = key;
    setChrome(chrome);
  };

  const topbar = shadow.querySelector(".app > .topbar");
  const observer = new MutationObserver(() => publish());
  if (topbar !== null) observer.observe(topbar, { attributes: true, characterData: true, childList: true, subtree: true });
  const views = shadow.querySelector(".app main");
  if (views !== null) observer.observe(views, { attributeFilter: ["hidden"], attributes: true, subtree: true });
  publish();

  return () => {
    detached = true;
    observer.disconnect();
    setChrome(null);
  };
}

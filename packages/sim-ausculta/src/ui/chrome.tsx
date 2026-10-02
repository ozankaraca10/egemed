import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import type { SimChrome, SimChromeAction, SimChromeChip } from "@egemed/sim-host";
import { useStore } from "../core/StoreProvider";
import type { Mode, Screen } from "../core/types";
import { useAudience, useSetChrome } from "./ScreenHeading";
import { HelpModal } from "./HelpModal";
import { ConfirmModal } from "./ConfirmModal";
import type { ModalEnv } from "./modal-env";

/** Ekranların paylaştığı alt bilgi ve arka plan (kaynak `ui/chrome.tsx` Footer/EcgDeco).
 *  Gömülü modda çizilmez: platform kabuğunun üst barı tek kalır. */

const HIT = { minWidth: 44, minHeight: 44 } as const;

interface FooterProps {
  readonly embedded?: boolean;
}

export function Footer({ embedded = false }: FooterProps): ReactNode {
  if (embedded) return null;
  return (
    <footer className="eg-footer">
      <div className="footer-left">
        <img src="brand/logo-icon-web.png" alt="" className="footer-seal" />
        <span className="footer-text">
          <span className="footer-brand">EGEMED Ausculta<sup className="tm">™</sup></span>
          <span className="footer-sub"> Kardiyopulmoner Oskültasyon Simülatörü</span>
          <span className="footer-inst">, Ege Üniversitesi Tıp Fakültesi Dekanlığı tarafından geliştirilmiştir.</span>
          <span className="footer-copy"> Tüm hakları saklıdır © 2026</span>
        </span>
      </div>
      <div className="footer-right">
        <span className="footer-attr2">Ses kayıtları: HLS-CMDS v3 · CC BY 4.0 — CirCor · ODC-BY 1.0</span>
      </div>
    </footer>
  );
}

interface EcgDecoProps {
  readonly embedded?: boolean;
}

export function EcgDeco({ embedded = false }: EcgDecoProps): ReactNode {
  if (embedded) return null;
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="bg-wash" />
    </div>
  );
}

export function touchTarget(): { minWidth: number; minHeight: number } {
  return HIT;
}

const STEP_LABELS = ["Mod seçimi", "Çalışma", "Tamamla"] as const;

export interface FullscreenEnv {
  readonly fullscreenElement: unknown;
  requestFullscreen(): void;
  exitFullscreen(): void;
  addEventListener(type: "fullscreenchange", handler: () => void): void;
  removeEventListener(type: "fullscreenchange", handler: () => void): void;
}

export function createNoopFullscreenEnv(): FullscreenEnv {
  return {
    fullscreenElement: null,
    requestFullscreen: () => undefined,
    exitFullscreen: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

function stepFor(screen: Screen, previous: number): number {
  if (screen === "modes") return 0;
  if (screen === "learn" || screen === "simulation") return 1;
  if (screen === "results") return 2;
  return previous;
}

function modeTone(mode: Mode): NonNullable<SimChromeChip["tone"]> {
  if (mode === "learn") return "learn";
  if (mode === "practice") return "practice";
  return "assessment";
}

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Adım düğmesi tıklamasının sonucu (T182): yalnız adım 0 (mod seçimi) anlamlıdır;
 *  "Çalışma" adımı (index 1) tamamlanmış olsa bile o ekrana geri dönüş tanımsızdır ve yok sayılır. */
export type StepSelectOutcome = "navigate" | "confirm" | "ignore";

/** Etkin oturum: uygulama veya değerlendirme sürüyor, kaydedilmemiş ilerleme kaybedilebilir. */
export function needsExitConfirm(screen: Screen): boolean {
  return screen === "simulation";
}

/** `SimChrome.steps.onSelect` sözleşmesinin saf kararı: bkz. `StepSelectOutcome`. */
export function resolveStepSelect(index: number, screen: Screen): StepSelectOutcome {
  if (index !== 0) return "ignore";
  return needsExitConfirm(screen) ? "confirm" : "navigate";
}

function chromeKey(chrome: SimChrome): string {
  return JSON.stringify({
    steps: chrome.steps,
    chips: chrome.chips,
    actions: (chrome.actions ?? []).map((action) => ({ id: action.id, label: action.label, pressed: action.pressed ?? false })),
  });
}

function usePublishChrome(chrome: SimChrome | null): void {
  const setChrome = useSetChrome();
  const token = useRef(0);
  const lastKey = useRef("");
  const key = chrome === null ? "" : chromeKey(chrome);
  if (setChrome && chrome && key !== lastKey.current) {
    lastKey.current = key;
    const ticket = ++token.current;
    const publish = setChrome;
    const snapshot = chrome;
    void Promise.resolve().then(() => {
      if (token.current === ticket) publish(snapshot);
    });
  }
  useEffect(() => {
    if (!setChrome) return undefined;
    return () => {
      token.current += 1;
      setChrome(null);
    };
  }, [setChrome]);
}

/** Birleşik bar: adım, mod çipi, süre ve eylemler kabuğa gider. Modallar simde kalır. */
export function UnifiedChrome({
  fullscreen = createNoopFullscreenEnv(),
  modalEnv,
}: {
  readonly fullscreen?: FullscreenEnv;
  readonly modalEnv?: ModalEnv;
}): JSX.Element | null {
  const setChrome = useSetChrome();
  const audience = useAudience();
  const { state, dispatch } = useStore();
  const [fs, setFs] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exitAsk, setExitAsk] = useState(false);
  const stepRef = useRef(0);
  const step = stepFor(state.screen, stepRef.current);
  stepRef.current = step;
  const inWork = state.screen === "learn" || state.screen === "simulation";
  const inAssessment = state.mode === "assessment" && state.screen === "simulation";
  const modeShort = state.mode === "learn" ? "Öğrenme" : state.mode === "practice" ? "Uygulama" : "Değerlendirme";
  const modeLabel = `${modeShort} Modu`;

  useEffect(() => {
    const onFs = () => setFs(fullscreen.fullscreenElement !== null);
    fullscreen.addEventListener("fullscreenchange", onFs);
    return () => fullscreen.removeEventListener("fullscreenchange", onFs);
  }, [fullscreen]);

  const toggleFs = () => {
    if (fullscreen.fullscreenElement === null) fullscreen.requestFullscreen();
    else fullscreen.exitFullscreen();
  };
  const goModes = () => {
    if (needsExitConfirm(state.screen)) setExitAsk(true);
    else dispatch({ type: "goto", screen: "modes" });
  };
  /** Kabuğun tamamlanan adım düğmeleri için (T182): kararı `resolveStepSelect` verir; yalnız
   *  adım 0 aksiyon üretir, diğerleri (örn. "Çalışma") yok sayılır. */
  const onStepSelect = (index: number) => {
    if (resolveStepSelect(index, state.screen) === "ignore") return;
    goModes();
  };
  const chips: SimChromeChip[] = [];
  if (setChrome && inWork) chips.push({ id: "mode", label: modeLabel, tone: modeTone(state.mode) });
  if (setChrome && inAssessment) chips.push({ id: "timer", label: fmtTimer(state.assessmentTimer), tone: "neutral" });
  const actions: SimChromeAction[] = [];
  if (setChrome && inWork) actions.push({ id: "modes", icon: "swap", label: "Mod değiştir", onSelect: goModes });
  if (setChrome) {
    // Oyunlaştırma yüzeyi yalnız öğrenciye çizilir (26 Eyl 2026 sözleşmesi).
    if (audience === "student") {
      actions.push({ id: "progress", icon: "progress", label: "İlerlemem", onSelect: () => dispatch({ type: "goto", screen: "progress" }) });
    }
    actions.push({
      id: "fullscreen",
      icon: "fullscreen",
      label: fs ? "Tam ekrandan çık" : "Tam ekran",
      pressed: fs,
      onSelect: toggleFs,
    });
    actions.push({ id: "help", icon: "help", label: "Yardım", onSelect: () => setHelpOpen(true) });
  }
  usePublishChrome(setChrome ? { actions, chips, steps: { current: step, labels: STEP_LABELS, onSelect: onStepSelect } } : null);
  if (!setChrome) return null;
  const exitTitle = inAssessment ? "Değerlendirmeden çıkılsın mı?" : "Çalışmadan çıkılsın mı?";
  const exitMessage = inAssessment
    ? "İlerlemeniz kaydedilmez ve geçen süre kaybedilir."
    : "İlerleme kaydedilmez.";
  return (
    <>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} {...(modalEnv ? { env: modalEnv } : {})} />
      <ConfirmModal
        open={exitAsk}
        title={exitTitle}
        message={exitMessage}
        confirmLabel="Çık"
        cancelLabel="Vazgeç"
        onConfirm={() => {
          setExitAsk(false);
          dispatch({ type: "goto", screen: "modes" });
        }}
        onCancel={() => setExitAsk(false)}
        {...(modalEnv ? { env: modalEnv } : {})}
      />
    </>
  );
}

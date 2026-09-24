import { type JSX } from "react";
import { useStore } from "./core/StoreProvider";
import type { Screen } from "./core/types";
import { DevPanel } from "./DevPanel";
import { LearnScreen } from "./screens/LearnScreen";
import { ModeSelectScreen } from "./screens/ModeSelectScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SimulationScreen } from "./screens/SimulationScreen";
import { StartScreen } from "./screens/StartScreen";
import { TutorialScreen } from "./screens/TutorialScreen";
import { ConfirmModal } from "./ui/ConfirmModal";
import { HelpModal } from "./ui/HelpModal";
import { EcgDeco, Footer, Header } from "./ui/chrome";
import type { ChromeEnv } from "./ui/chrome";
import type { ModalEnv } from "./ui/modal-env";
import type { LearnScreenEnv } from "./screens/LearnScreen";
import type { ResultsScreenEnv } from "./screens/ResultsScreen";
import type { StartScreenEnv } from "./screens/StartScreen";
import type { SimulationPopoverEnv } from "./screens/SimulationScreen";
import type { WindowLike } from "./core/lifecycle";
import { createNoopChromeEnv } from "./ui/chrome";
import { createNoopModalEnv } from "./ui/modal-env";
import { createNoopLearnScreenEnv } from "./screens/LearnScreen";
import { createNoopResultsScreenEnv } from "./screens/ResultsScreen";
import { createNoopStartScreenEnv } from "./screens/StartScreen";
import { createNoopSimulationPopoverEnv } from "./screens/SimulationScreen";

export interface AppProps {
  /** Platform kabuğu modu; varsayılan gömülü (çift üst bar/footer oluşmaz, §7.3). */
  readonly embedded?: boolean;
  readonly chromeEnv?: ChromeEnv;
  readonly modalEnv?: ModalEnv;
  readonly startEnv?: StartScreenEnv;
  readonly learnEnv?: LearnScreenEnv;
  readonly popoverEnv?: SimulationPopoverEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly timing?: WindowLike;
  /** Oyunlaştırma bayrağı (§7.7); varsayılan kapalı. */
  readonly gamiEnabled?: boolean;
  /** Geliştirici paneli; yalnız dev build + `?dev=1` için true verilir. */
  readonly showDevPanel?: boolean;
}

function PendingScreen({ screen, embedded }: { screen: Screen; embedded: boolean }): JSX.Element {
  const { dispatch } = useStore();
  const label =
    screen === "sources"
      ? "Kaynaklar ekranı yükleniyor."
      : screen === "achievements"
        ? "Başarılar ekranı yükleniyor."
        : "Sıralama ekranı yükleniyor.";
  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen screen-body">
        <p>{label}</p>
        <button type="button" className="btn outline" onClick={() => dispatch({ type: "goto", screen: "start" })}>
          Ana ekrana dön
        </button>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}

function ScreenBody({
  embedded,
  startEnv,
  learnEnv,
  popoverEnv,
  resultsEnv,
  modalEnv,
  timing,
  gamiEnabled,
}: {
  embedded: boolean;
  startEnv: StartScreenEnv;
  learnEnv: LearnScreenEnv;
  popoverEnv: SimulationPopoverEnv;
  resultsEnv: ResultsScreenEnv;
  modalEnv: ModalEnv;
  timing?: WindowLike;
  gamiEnabled: boolean;
}): JSX.Element | null {
  const { state } = useStore();
  switch (state.screen) {
    case "start":
      return timing
        ? <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} timing={timing} />
        : <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} />;
    case "modes":
      return <ModeSelectScreen embedded={embedded} gamiEnabled={gamiEnabled} />;
    case "tutorial":
      return <TutorialScreen embedded={embedded} />;
    case "learn":
      return <LearnScreen embedded={embedded} env={learnEnv} gamiEnabled={gamiEnabled} />;
    case "simulation":
      return (
        <SimulationScreen
          embedded={embedded}
          popoverEnv={popoverEnv}
          modalEnv={modalEnv}
          gamiEnabled={gamiEnabled}
        />
      );
    case "results":
      return <ResultsScreen embedded={embedded} env={resultsEnv} gamiEnabled={gamiEnabled} />;
    case "sources":
    case "achievements":
    case "leaderboard":
      return <PendingScreen screen={state.screen} embedded={embedded} />;
    default:
      return null;
  }
}

/** Opaca kök uygulama: ekran anahtarı, gömülü kabuk modu ve isteğe bağlı DevPanel (E2 §8 S19). */
export function App({
  embedded = true,
  chromeEnv = createNoopChromeEnv(),
  modalEnv = createNoopModalEnv(),
  startEnv = createNoopStartScreenEnv(),
  learnEnv = createNoopLearnScreenEnv(),
  popoverEnv = createNoopSimulationPopoverEnv(),
  resultsEnv = createNoopResultsScreenEnv(),
  timing,
  gamiEnabled = false,
  showDevPanel = false,
}: AppProps): JSX.Element {
  return (
    <div className="eg-sim-opaca app-shell">
      <Header
        embedded={embedded}
        env={chromeEnv}
        modals={{ help: HelpModal, confirm: ConfirmModal }}
        gamiEnabled={gamiEnabled}
      />
      <main className="app-content">
        {timing ? (
          <ScreenBody
            embedded={embedded}
            startEnv={startEnv}
            learnEnv={learnEnv}
            popoverEnv={popoverEnv}
            resultsEnv={resultsEnv}
            modalEnv={modalEnv}
            timing={timing}
            gamiEnabled={gamiEnabled}
          />
        ) : (
          <ScreenBody
            embedded={embedded}
            startEnv={startEnv}
            learnEnv={learnEnv}
            popoverEnv={popoverEnv}
            resultsEnv={resultsEnv}
            modalEnv={modalEnv}
            gamiEnabled={gamiEnabled}
          />
        )}
      </main>
      {showDevPanel ? <DevPanel /> : null}
    </div>
  );
}

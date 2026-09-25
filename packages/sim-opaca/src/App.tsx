import { type JSX } from "react";
import { EmbeddedProvider } from "./EmbeddedContext";
import type { SimChrome } from "@egemed/sim-host";
import { useStore } from "./core/StoreProvider";
import type { Screen } from "./core/types";
import { DevPanel } from "./DevPanel";
import { useLearnGamiPort, useSimulationGamiPort } from "./gamification/bindings";
import { GamiSyncErrorBanner } from "./ui/gami/GamiSyncErrorBanner";
import { AchievementsScreen } from "./screens/AchievementsScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
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
  readonly embedded?: boolean;
  readonly chromeEnv?: ChromeEnv;
  readonly modalEnv?: ModalEnv;
  readonly startEnv?: StartScreenEnv;
  readonly learnEnv?: LearnScreenEnv;
  readonly popoverEnv?: SimulationPopoverEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly timing?: WindowLike;
  readonly gamiEnabled?: boolean;
  readonly showDevPanel?: boolean;
  readonly devBuild?: boolean;
  /** Birleşik bar kanalı. Verilirse sim araç çubuğu çizilmez. */
  readonly setChrome?: (chrome: SimChrome | null) => void;
}

function PendingScreen({ screen, embedded }: { screen: Screen; embedded: boolean }): JSX.Element {
  const { dispatch } = useStore();
  const label = screen === "sources" ? "Kaynaklar ekranı yükleniyor." : "Ekran yükleniyor.";
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
  devBuild,
}: {
  embedded: boolean;
  startEnv: StartScreenEnv;
  learnEnv: LearnScreenEnv;
  popoverEnv: SimulationPopoverEnv;
  resultsEnv: ResultsScreenEnv;
  modalEnv: ModalEnv;
  timing?: WindowLike;
  gamiEnabled: boolean;
  devBuild: boolean;
}): JSX.Element | null {
  const { state } = useStore();
  const learnGamiPort = useLearnGamiPort();
  const simGamiPort = useSimulationGamiPort();
  const learnGami = gamiEnabled ? learnGamiPort : undefined;
  const simGami = gamiEnabled ? simGamiPort : undefined;
  switch (state.screen) {
    case "start":
      if (embedded) {
        return <ModeSelectScreen embedded={embedded} gamiEnabled={gamiEnabled} />;
      }
      return timing ? (
        <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} timing={timing} />
      ) : (
        <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} />
      );
    case "modes":
      return <ModeSelectScreen embedded={embedded} gamiEnabled={gamiEnabled} />;
    case "tutorial":
      return <TutorialScreen embedded={embedded} />;
    case "learn":
      return (
        <LearnScreen
          embedded={embedded}
          env={learnEnv}
          gamiEnabled={gamiEnabled}
          {...(learnGami ? { gami: learnGami } : {})}
        />
      );
    case "simulation":
      return (
        <SimulationScreen
          embedded={embedded}
          popoverEnv={popoverEnv}
          modalEnv={modalEnv}
          gamiEnabled={gamiEnabled}
          {...(simGami ? { gami: simGami } : {})}
        />
      );
    case "results":
      return (
        <ResultsScreen embedded={embedded} env={resultsEnv} gamiEnabled={gamiEnabled} devBuild={devBuild} />
      );
    case "achievements":
      return gamiEnabled ? (
        <AchievementsScreen embedded={embedded} devBuild={devBuild} modalEnv={modalEnv} />
      ) : (
        <PendingScreen screen="achievements" embedded={embedded} />
      );
    case "leaderboard":
      return gamiEnabled ? (
        <LeaderboardScreen embedded={embedded} devBuild={devBuild} modalEnv={modalEnv} />
      ) : (
        <PendingScreen screen="leaderboard" embedded={embedded} />
      );
    case "sources":
      return <PendingScreen screen="sources" embedded={embedded} />;
    default:
      return null;
  }
}

export function App({
  embedded = true,
  chromeEnv = createNoopChromeEnv(),
  modalEnv = createNoopModalEnv(),
  startEnv = createNoopStartScreenEnv(),
  learnEnv = createNoopLearnScreenEnv(),
  popoverEnv = createNoopSimulationPopoverEnv(),
  resultsEnv = createNoopResultsScreenEnv(),
  timing,
  gamiEnabled = true,
  showDevPanel = false,
  devBuild = false,
  setChrome,
}: AppProps): JSX.Element {
  return (
    <EmbeddedProvider embedded={embedded} {...(setChrome === undefined ? {} : { setChrome })}>
      <div className="eg-sim-opaca app-shell">
        <Header embedded={embedded} env={chromeEnv} modals={{ help: HelpModal, confirm: ConfirmModal }} gamiEnabled={gamiEnabled} />
        {gamiEnabled ? <GamiSyncErrorBanner /> : null}
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
              devBuild={devBuild}
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
              devBuild={devBuild}
            />
          )}
        </main>
        {showDevPanel ? <DevPanel /> : null}
      </div>
    </EmbeddedProvider>
  );
}

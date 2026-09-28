import { useEffect, useRef, type JSX } from "react";
import { EmbeddedProvider } from "./EmbeddedContext";
import type { SimAudience, SimChrome, SimSessionSource } from "@egemed/sim-host";
import { audienceShowsGamification } from "@egemed/sim-host";
import { useStore } from "./core/StoreProvider";
import type { Screen } from "./core/types";
import { DevPanel } from "./DevPanel";
import { useLearnGamiPort } from "./gamification/bindings";
import { GamiSyncErrorBanner } from "@egemed/gami-ui";
import { useGamiContext } from "./gamification/GamiContext";
import { IconInfo } from "./ui/icons";
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
import type { WindowLike } from "./core/lifecycle";
import { createNoopChromeEnv } from "./ui/chrome";
import { createNoopModalEnv } from "./ui/modal-env";
import { createNoopLearnScreenEnv } from "./screens/LearnScreen";
import { createNoopResultsScreenEnv } from "./screens/ResultsScreen";
import { createNoopStartScreenEnv } from "./screens/StartScreen";

export interface AppProps {
  readonly embedded?: boolean;
  readonly chromeEnv?: ChromeEnv;
  readonly modalEnv?: ModalEnv;
  readonly startEnv?: StartScreenEnv;
  readonly learnEnv?: LearnScreenEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly timing?: WindowLike;
  readonly gamiEnabled?: boolean;
  readonly showDevPanel?: boolean;
  readonly devBuild?: boolean;
  /** Birleşik bar kanalı. Verilirse sim araç çubuğu çizilmez. */
  readonly setChrome?: (chrome: SimChrome | null) => void;
  /** Kitle (T175); yoksa `student` (geriye uyum). */
  readonly audience?: SimAudience;
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly requestSignIn?: () => void;
  /** A2.3 (ADR-009): sunucu vaka oturumu kanalı; yoksa uygulama/değerlendirme açılmaz. */
  readonly sessions?: SimSessionSource;
  /** ADR-010: düello bağlamı; verilirse değerlendirme oturumu düellodan açılır. */
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
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
  resultsEnv,
  modalEnv,
  timing,
  gamiEnabled,
  devBuild,
  audience,
  requestSignIn,
}: {
  embedded: boolean;
  startEnv: StartScreenEnv;
  learnEnv: LearnScreenEnv;
  resultsEnv: ResultsScreenEnv;
  modalEnv: ModalEnv;
  timing?: WindowLike;
  gamiEnabled: boolean;
  devBuild: boolean;
  audience: SimAudience;
  requestSignIn?: () => void;
}): JSX.Element | null {
  const { state } = useStore();
  const learnGamiPort = useLearnGamiPort();
  const learnGami = gamiEnabled ? learnGamiPort : undefined;
  switch (state.screen) {
    case "start":
      if (embedded) {
        return (
          <ModeSelectScreen
            embedded={embedded}
            gamiEnabled={gamiEnabled}
            audience={audience}
            {...(requestSignIn ? { requestSignIn } : {})}
          />
        );
      }
      return timing ? (
        <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} timing={timing} />
      ) : (
        <StartScreen embedded={embedded} env={startEnv} modalEnv={modalEnv} />
      );
    case "modes":
      return (
        <ModeSelectScreen
          embedded={embedded}
          gamiEnabled={gamiEnabled}
          audience={audience}
          {...(requestSignIn ? { requestSignIn } : {})}
        />
      );
    case "tutorial":
      return <TutorialScreen embedded={embedded} />;
    case "learn":
      return (
        <LearnScreen
          embedded={embedded}
          env={learnEnv}
          gamiEnabled={gamiEnabled}
          audience={audience}
          {...(learnGami ? { gami: learnGami } : {})}
        />
      );
    case "simulation":
      return <SimulationScreen embedded={embedded} modalEnv={modalEnv} />;
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
  resultsEnv = createNoopResultsScreenEnv(),
  timing,
  gamiEnabled = true,
  showDevPanel = false,
  devBuild = false,
  setChrome,
  audience = "student",
  requestSignIn,
  sessions,
  challengeId,
  onChallengeFinished,
}: AppProps): JSX.Element {
  const { dispatch } = useStore();
  const { syncError, clearSyncError } = useGamiContext();
  // T175: kitle sözleşmesi — oyunlaştırma yüzeyleri (rozet/XP/liderlik/aylık ödül) yalnız
  // öğrenciye çizilir; çağıran `gamiEnabled=true` verse bile öğretim üyesi/ziyaretçide gizlenir
  // (depo sahibi kararı, plan.md). Tek kaynak burada: alt bileşenler yalnız bunu sorgular.
  const effectiveGami = gamiEnabled && audienceShowsGamification(audience);
  // ADR-010: düello bağlamıyla açılınca mod seçimi atlanır; oturumu sürücü düello ucundan açar.
  const challengeStarted = useRef<string | null>(null);
  useEffect(() => {
    if (challengeId === undefined || challengeStarted.current === challengeId || sessions === undefined) return;
    challengeStarted.current = challengeId;
    dispatch({ type: "startMode", mode: "assessment", challengeId });
  }, [challengeId, dispatch, sessions]);
  return (
    <EmbeddedProvider
      embedded={embedded}
      {...(setChrome === undefined ? {} : { setChrome })}
      {...(sessions === undefined ? {} : { sessions })}
      {...(challengeId === undefined ? {} : { challengeId })}
      {...(onChallengeFinished === undefined ? {} : { onChallengeFinished })}
    >
      <div className="eg-sim-opaca app-shell">
        <Header embedded={embedded} env={chromeEnv} modals={{ help: HelpModal, confirm: ConfirmModal }} gamiEnabled={effectiveGami} />
        {effectiveGami && syncError ? <GamiSyncErrorBanner message={syncError.message} onDismiss={clearSyncError} icon={<IconInfo width={16} height={16} />} /> : null}
        <main className="app-content">
          {timing ? (
            <ScreenBody
              embedded={embedded}
              startEnv={startEnv}
              learnEnv={learnEnv}
              resultsEnv={resultsEnv}
              modalEnv={modalEnv}
              timing={timing}
              gamiEnabled={effectiveGami}
              devBuild={devBuild}
              audience={audience}
              {...(requestSignIn ? { requestSignIn } : {})}
            />
          ) : (
            <ScreenBody
              embedded={embedded}
              startEnv={startEnv}
              learnEnv={learnEnv}
              resultsEnv={resultsEnv}
              modalEnv={modalEnv}
              gamiEnabled={effectiveGami}
              devBuild={devBuild}
              audience={audience}
              {...(requestSignIn ? { requestSignIn } : {})}
            />
          )}
        </main>
        {showDevPanel ? <DevPanel /> : null}
      </div>
    </EmbeddedProvider>
  );
}

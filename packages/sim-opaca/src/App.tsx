import { useEffect, useRef, type JSX } from "react";
import { EmbeddedProvider } from "./EmbeddedContext";
import type { SimAudience, SimChrome, SimLearnPort, SimSessionSource } from "@egemed/sim-host";
import { audienceShowsGamification } from "@egemed/sim-host";
import { useStore } from "./core/StoreProvider";
import { LearnGateProvider, useLearnGate } from "./core/LearnGate";
import { canStartMode } from "./core/learnLock";
import { DevPanel } from "./DevPanel";
import { useLearnGamiPort } from "./gamification/bindings";
import { GamiSyncErrorBanner } from "@egemed/gami-ui";
import { useGamiContext } from "./gamification/GamiContext";
import { IconInfo } from "./ui/icons";
import { AchievementsScreen } from "./screens/AchievementsScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { SourcesScreen } from "./screens/SourcesScreen";
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
  /** T218: kabuğun öğrenme tamamlama kanalı (ziyaretçide verilmez). */
  readonly learn?: SimLearnPort;
  /** ADR-010: düello bağlamı; verilirse değerlendirme oturumu düellodan açılır. */
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
  /** T281a/T289: 4. mod kartı → kabuğun sim içi Meydan Okuma merkezi. */
  readonly openChallenges?: () => void;
}

function PendingScreen({ embedded }: { embedded: boolean }): JSX.Element {
  const { dispatch } = useStore();
  const label = "Ekran yükleniyor.";
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
        <PendingScreen embedded={embedded} />
      );
    case "leaderboard":
      return gamiEnabled ? (
        <LeaderboardScreen embedded={embedded} devBuild={devBuild} modalEnv={modalEnv} />
      ) : (
        <PendingScreen embedded={embedded} />
      );
    case "sources":
      return <SourcesScreen embedded={embedded} />;
    default:
      return null;
  }
}

export function App({ embedded = true, learn, ...props }: AppProps): JSX.Element {
  return (
    <LearnGateProvider {...(learn === undefined ? {} : { learn })}>
      <Shell embedded={embedded} {...props} />
    </LearnGateProvider>
  );
}

/** Uygulama gövdesi (T218: öğrenme kilidi sağlayıcısının içinde; `learn` kanalı host'tan gelir). */
function Shell({
  embedded,
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
  openChallenges,
}: AppProps & { embedded: boolean }): JSX.Element {
  const { dispatch } = useStore();
  const { syncError, clearSyncError } = useGamiContext();
  const learnGate = useLearnGate();
  // T175: kitle sözleşmesi — oyunlaştırma yüzeyleri (rozet/XP/liderlik/aylık ödül) yalnız
  // öğrenciye çizilir; çağıran `gamiEnabled=true` verse bile öğretim üyesi/ziyaretçide gizlenir
  // (depo sahibi kararı, plan.md). Tek kaynak burada: alt bileşenler yalnız bunu sorgular.
  const effectiveGami = gamiEnabled && audienceShowsGamification(audience);
  // ADR-010: düello bağlamıyla açılınca mod seçimi atlanır; oturumu sürücü düello ucundan açar.
  // T218: öğrenme tamamlanmadıysa düello başlatılmaz; kullanıcı öğrenme ekranına düşer
  // (bilgi notu LearnScreen'de gösterilir). Sunucu da `learn_required` ile korur.
  const challengeStarted = useRef<string | null>(null);
  useEffect(() => {
    if (challengeId === undefined || challengeStarted.current === challengeId || sessions === undefined) return;
    if (!canStartMode("assessment", learnGate.complete)) {
      // Kilitliyken düello başlatılmaz; öğrenme ekranına düşülür. Etki, öğrenme
      // tamamlanınca (complete değişince) yeniden çalışıp düelloyu açar.
      dispatch({ type: "startMode", mode: "learn" });
      dispatch({ type: "goto", screen: "learn" });
      return;
    }
    challengeStarted.current = challengeId;
    dispatch({ type: "startMode", mode: "assessment", challengeId });
  }, [challengeId, dispatch, learnGate.complete, sessions]);
  return (
    <EmbeddedProvider
      embedded={embedded}
      {...(setChrome === undefined ? {} : { setChrome })}
      {...(sessions === undefined ? {} : { sessions })}
      {...(challengeId === undefined ? {} : { challengeId })}
      {...(onChallengeFinished === undefined ? {} : { onChallengeFinished })}
      {...(openChallenges === undefined ? {} : { openChallenges })}
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

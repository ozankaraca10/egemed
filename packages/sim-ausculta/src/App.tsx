import type { GamiServerSource } from "@egemed/gami-ui";
import type { GamiPageTab } from "@egemed/gami-ui";
import type { SimAudience, SimChrome, SimLearnPort, SimSessionSource } from "@egemed/sim-host";
import { useEffect, useRef, useState, type JSX } from "react";
import { LearnGateProvider, useLearnGate } from "./core/LearnGate";
import { canStartMode } from "./core/learnLock";
import { useStore } from "./core/StoreProvider";
import { gamiStoragePort } from "./core/storage";
import { resolveEntryScreen } from "./screens/entry";
import { LearnScreen, type LearnScreenEnv } from "./screens/LearnScreen";
import { ModeSelectScreen } from "./screens/ModeSelectScreen";
import { ResultsScreen, type ResultsScreenEnv } from "./screens/ResultsScreen";
import { SimulationScreen, type SimulationAudio } from "./screens/SimulationScreen";
import type { SimulationScreenEnv } from "./screens/simulation/runtime";
import { SourcesScreen } from "./screens/SourcesScreen";
import { StartScreen } from "./screens/StartScreen";
import type { VolumeCheckAudio, VolumeToneContext } from "./screens/tone";
import { TutorialScreen, type TutorialAudio } from "./screens/TutorialScreen";
import type { ModalEnv } from "./ui/modal-env";
import { UnifiedChrome, type FullscreenEnv } from "./ui/chrome";
import { EmbeddedProvider } from "./ui/ScreenHeading";
import { ProgressScreen } from "./screens/ProgressScreen";
import { LocalGamiRepository } from "./gamification/repo";

/** Kaynak `App.tsx`: belge ekranları sayfa düzeyinde kayar; öğrenme ve simülasyon kaymaz. */
const DOC_SCREENS = new Set(["start", "modes", "tutorial", "results", "progress", "sources"]);

/** Ekranların paylaştığı motor yüzeyi. Mount başına bir örnek; modül singleton'ı yoktur. */
export interface AuscultaAudio extends SimulationAudio, TutorialAudio {
  stop(): void;
  dispose(): void;
}

function volumeAudio(audio: AuscultaAudio): VolumeCheckAudio {
  return { ensureContext: () => audio.ensureContext() as Promise<VolumeToneContext> };
}

export interface AppProps {
  /** Platform kabuğu: tanıtım atlanır, sim üst barı çizilmez, başlıklar h2 olur. */
  readonly embedded?: boolean;
  readonly audio: AuscultaAudio;
  readonly learnEnv?: LearnScreenEnv;
  readonly simulationEnv?: SimulationScreenEnv;
  readonly modalEnv?: ModalEnv;
  readonly resultsEnv?: ResultsScreenEnv;
  readonly scrollToTop?: () => void;
  readonly gamification?: GamiServerSource;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly fullscreenEnv?: FullscreenEnv;
  /** Kitle (26 Eyl 2026 sözleşmesi); verilmezse `student`. */
  readonly audience?: SimAudience;
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly requestSignIn?: () => void;
  /** A1: sunucu vaka oturumu kanalı. */
  readonly sessions?: SimSessionSource;
  /** T209: kabuğun öğrenme tamamlama kanalı (ziyaretçide verilmez). */
  readonly learn?: SimLearnPort;
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
}

function Shell({
  embedded,
  audio,
  learnEnv,
  simulationEnv,
  modalEnv,
  resultsEnv,
  scrollToTop,
  gamification,
  setChrome,
  fullscreenEnv,
  audience = "student",
  requestSignIn,
  sessions,
  challengeId,
  onChallengeFinished,
}: AppProps & { embedded: boolean }): JSX.Element {
  const { state, dispatch, bus, now, storage } = useStore();
  const learnGate = useLearnGate();
  const gamiRef = useRef<LocalGamiRepository | null>(null);
  if (gamiRef.current === null) {
    gamiRef.current = new LocalGamiRepository({ storage: gamiStoragePort(storage), now: () => new Date(now()) });
  }
  const gami = gamiRef.current;
  const [progressTab, setProgressTab] = useState<GamiPageTab>("achievements");
  const openProgress = (tab: GamiPageTab) => {
    setProgressTab(tab);
    dispatch({ type: "goto", screen: "progress" });
  };
  const screen = resolveEntryScreen(state.screen, embedded);

  useEffect(() => {
    audio.stop();
  }, [audio, state.screen]);

  // ADR-010: düello bağlamıyla açılınca mod seçimi atlanır; oturumu sürücü düello ucundan açar.
  // T209: öğrenme tamamlanmadıysa düello başlatılmaz; kullanıcı öğrenme ekranına düşer
  // (bilgi notu LearnScreen'de gösterilir). Sunucu da `learn_required` ile korur.
  const challengeStarted = useRef<string | null>(null);
  useEffect(() => {
    if (challengeId === undefined || challengeStarted.current === challengeId) return;
    if (!canStartMode("assessment", learnGate.complete)) {
      // Kilitliyken düello başlatılmaz; öğrenme ekranına düşülür. Etki, öğrenme
      // tamamlanınca (complete değişince) yeniden çalışıp düelloyu açar.
      dispatch({ type: "startMode", mode: "learn" });
      dispatch({ type: "goto", screen: "learn" });
      return;
    }
    challengeStarted.current = challengeId;
    dispatch({ type: "startMode", mode: "assessment", challengeId });
  }, [challengeId, dispatch, learnGate.complete]);

  useEffect(() => bus.subscribe((event) => {
    // Oyunlaştırma yalnız öğrenci kitlesi içindir (26 Eyl 2026 sözleşmesi):
    // öğretim üyesi/ziyaretçi için yerel kayıt hiç yapılmaz.
    // A4 (ADR-009): puanlı deneme sunucuya gönderilmez; denemeyi sunucu oturumu
    // yazar, burada yalnız yerel (API'siz) görünüm için kayıt tutulur.
    if (audience !== "student") return;
    const write = (payload: Parameters<LocalGamiRepository["recordEvent"]>[0]): void => {
      gami.recordEvent(payload);
    };
    if (event.type === "case_completed" && event.mode === "practice") {
      write({ type: "case_completed", id: `${event.caseId}:${event.mode}:${event.at}`, finishedAt: new Date(event.at).toISOString(), mode: event.mode, score: event.score, mastery: event.mastery, hintsUsed: event.hintsUsed, domains: event.domains });
    } else if (event.type === "assessment_completed") {
      write({ type: "case_completed", id: `assessment:${event.at}`, finishedAt: new Date(event.at).toISOString(), mode: "assessment", score: event.total, mastery: event.total >= 80, hintsUsed: 0, domains: {} });
    } else if (event.type === "correct_diagnosis") {
      gami.recordEvent({ type: "correct_diagnosis", id: `${event.caseId}:${event.qid}:${event.at}`, finishedAt: new Date(event.at).toISOString() });
    }
  }), [audience, bus, gami]);

  useEffect(() => {
    scrollToTop?.();
  }, [scrollToTop, state.screen]);

  useEffect(() => {
    if (embedded) return;
    if (state.screen === "modes" && !state.tutorialDone && !state.tutorialSeen) {
      dispatch({ type: "goto", screen: "tutorial" });
    }
  }, [dispatch, embedded, state.screen, state.tutorialDone, state.tutorialSeen]);

  const doc = DOC_SCREENS.has(screen);
  return (
    <EmbeddedProvider
      embedded={embedded}
      audience={audience}
      {...(sessions === undefined ? {} : { sessions })}
      {...(challengeId === undefined ? {} : { challengeId })}
      {...(onChallengeFinished === undefined ? {} : { onChallengeFinished })}
      {...(setChrome === undefined ? {} : { setChrome })}
      {...(requestSignIn === undefined ? {} : { requestSignIn })}
    >
      <div className={`eg-sim-ausculta app-shell${doc ? " app-shell--doc" : ""}`}>
        <UnifiedChrome
          {...(fullscreenEnv ? { fullscreen: fullscreenEnv } : {})}
          {...(modalEnv ? { modalEnv } : {})}
        />
        <main className="app-content">
          {screen === "start" ? <StartScreen embedded={embedded} audio={volumeAudio(audio)} /> : null}
          {screen === "modes" ? <ModeSelectScreen embedded={embedded} /> : null}
          {screen === "tutorial" ? <TutorialScreen embedded={embedded} audio={audio} /> : null}
          {screen === "learn" ? (
            <LearnScreen embedded={embedded} audio={audio} {...(learnEnv ? { env: learnEnv } : {})} />
          ) : null}
          {screen === "simulation" ? (
            <SimulationScreen
              embedded={embedded}
              audio={audio}
              {...(simulationEnv ? { env: simulationEnv } : {})}
              {...(modalEnv ? { modalEnv } : {})}
            />
          ) : null}
          {screen === "results" ? (
            <ResultsScreen
              embedded={embedded}
              repository={gami}
              onAchievements={() => openProgress("achievements")}
              onLeaderboard={() => openProgress("leaderboard")}
              serverData={gamification !== undefined}
              {...(resultsEnv ? { env: resultsEnv } : {})}
            />
          ) : null}
          {screen === "progress" ? (
            <ProgressScreen embedded={embedded} repository={gami} tab={progressTab} onTab={setProgressTab} {...(modalEnv ? { modalEnv } : {})} {...(gamification === undefined ? {} : { gamification })} />
          ) : null}
          {screen === "sources" ? <SourcesScreen embedded={embedded} /> : null}
        </main>
      </div>
    </EmbeddedProvider>
  );
}

/** Gömülü kabuk. Üst bar platformdadır; sim ikinci bir `header` çizmez.
 *  T209: öğrenme kilidi sağlayıcısı tüm ekranları sarar; `learn` kanalı host'tan gelir. */
export function App({ embedded = true, learn, ...props }: AppProps): JSX.Element {
  return (
    <LearnGateProvider {...(learn === undefined ? {} : { learn })}>
      <Shell embedded={embedded} {...props} />
    </LearnGateProvider>
  );
}

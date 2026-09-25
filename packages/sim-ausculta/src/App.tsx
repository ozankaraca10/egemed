import type { AttemptRecord } from "@egemed/gamification-core";
import type { GamiServerSource } from "@egemed/gami-ui";
import type { GamiPageTab } from "@egemed/gami-ui";
import type { SimChrome } from "@egemed/sim-host";
import { useEffect, useRef, useState, type JSX } from "react";
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
  readonly reportAttempt?: (attempt: AttemptRecord) => void;
  readonly gamification?: GamiServerSource;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly fullscreenEnv?: FullscreenEnv;
}

function Shell({
  embedded,
  audio,
  learnEnv,
  simulationEnv,
  modalEnv,
  resultsEnv,
  scrollToTop,
  reportAttempt,
  gamification,
  setChrome,
  fullscreenEnv,
}: AppProps & { embedded: boolean }): JSX.Element {
  const { state, dispatch, bus, now, storage } = useStore();
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

  useEffect(() => bus.subscribe((event) => {
    const write = (payload: Parameters<LocalGamiRepository["recordEvent"]>[0]): void => {
      const seen = gami.snapshot().seenEvents.includes(payload.id);
      gami.recordEvent(payload);
      if (seen || payload.type !== "case_completed" || reportAttempt === undefined) return;
      const record = gami.snapshot().attempts.find((item) => item.id === payload.id);
      if (record === undefined) return;
      try {
        const reported = reportAttempt(record) as void | Promise<void>;
        if (reported instanceof Promise) void reported.catch(() => undefined);
      } catch {
        // Rapor hatası dinleme akışını bozmaz.
      }
    };
    if (event.type === "case_completed" && event.mode === "practice") {
      write({ type: "case_completed", id: `${event.caseId}:${event.mode}:${event.at}`, finishedAt: new Date(event.at).toISOString(), mode: event.mode, score: event.score, mastery: event.mastery, hintsUsed: event.hintsUsed, domains: event.domains });
    } else if (event.type === "assessment_completed") {
      write({ type: "case_completed", id: `assessment:${event.at}`, finishedAt: new Date(event.at).toISOString(), mode: "assessment", score: event.total, mastery: event.total >= 80, hintsUsed: 0, domains: {} });
    } else if (event.type === "correct_diagnosis") {
      gami.recordEvent({ type: "correct_diagnosis", id: `${event.caseId}:${event.qid}:${event.at}`, finishedAt: new Date(event.at).toISOString() });
    }
  }), [bus, gami, reportAttempt]);

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
    <EmbeddedProvider embedded={embedded} {...(setChrome === undefined ? {} : { setChrome })}>
      <div className={`eg-sim-ausculta app-shell${doc ? " app-shell--doc" : ""}`}>
        <UnifiedChrome
          audio={audio}
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

/** Gömülü kabuk. Üst bar platformdadır; sim ikinci bir `header` çizmez. */
export function App({ embedded = true, ...props }: AppProps): JSX.Element {
  return <Shell embedded={embedded} {...props} />;
}

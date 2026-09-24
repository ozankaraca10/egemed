import type { JSX } from "react";
import { useStore } from "../core/StoreProvider";
import { resolveEntryScreen } from "./entry";
import { ModeSelectScreen } from "./ModeSelectScreen";
import { StartScreen, type StartScreenProps } from "./StartScreen";
import { TutorialScreen, type TutorialScreenProps } from "./TutorialScreen";

export interface EntryScreensProps {
  /** Platform içinde tanıtım atlanır; mod seçimi açılır. Üst bar çizilmez. */
  readonly embedded?: boolean;
  readonly audio?: StartScreenProps["audio"];
  readonly tutorialAudio?: TutorialScreenProps["audio"];
}

/** Giriş yüzeyi: start, mod seçimi ve öğretici. Gömülü modda start yoktur. */
export function EntryScreens({ embedded = false, audio, tutorialAudio }: EntryScreensProps): JSX.Element | null {
  const { state } = useStore();
  const screen = resolveEntryScreen(state.screen, embedded);
  if (screen === "start") return <StartScreen embedded={embedded} {...(audio ? { audio } : {})} />;
  if (screen === "modes") return <ModeSelectScreen embedded={embedded} />;
  if (screen === "tutorial") {
    return <TutorialScreen embedded={embedded} {...(tutorialAudio ? { audio: tutorialAudio } : {})} />;
  }
  return null;
}

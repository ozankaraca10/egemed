import type { Mode, Screen } from "../core/types";

/** Platform gömülü modunda tanıtım (start) atlanır; mod seçimi açılır. */
export function resolveEntryScreen(screen: Screen, embedded: boolean): Screen {
  if (embedded && screen === "start") return "modes";
  return screen;
}

/** T209: öğrenme tamamlanmadan uygulama/değerlendirme hedefi öğrenmedir (kilit, öneri değil). */
export function modePickTarget(mode: Mode, learnComplete: boolean, poolReady: boolean): Mode {
  if (!learnComplete && poolReady && mode !== "learn") return "learn";
  return mode;
}

/** T209: öğrenme kilidi — tamamlanmadıysa ve havuz hazırsa kart kilitlidir. */
export function modeLearnLocked(learnComplete: boolean, poolReady: boolean): boolean {
  return !learnComplete && poolReady;
}

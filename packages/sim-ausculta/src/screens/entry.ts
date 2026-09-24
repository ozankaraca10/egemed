import type { Mode, Screen } from "../core/types";

/** Platform gömülü modunda tanıtım (start) atlanır; mod seçimi açılır. */
export function resolveEntryScreen(screen: Screen, embedded: boolean): Screen {
  if (embedded && screen === "start") return "modes";
  return screen;
}

/** Oturum tohumu. Kaynak `Date.now()` yerine enjekte `now()` kullanılır. */
export function sessionSeed(nowMs: number): number {
  return (nowMs % 2147483647) | 0;
}

/** Kilit ≠ öneri: havuz hazır ve öğretici görülmediyse hedef öğrenmedir; düğme kapalı değildir. */
export function modePickTarget(mode: Mode, tutorialSeen: boolean, poolReady: boolean): Mode {
  if (!tutorialSeen && poolReady && mode !== "learn") return "learn";
  return mode;
}

export function modeRecommendLocked(tutorialSeen: boolean, poolReady: boolean): boolean {
  return !tutorialSeen && poolReady;
}

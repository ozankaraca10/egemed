/** Vaka içi görev doğrulaması; klinik model veya DOM bağımlılığı yoktur. */
import type { PulseLifecycle } from "../../host/lifecycle";

export type ChallengeType = "rr" | "st";
export interface ChallengeBeat { readonly r: number }
export interface ChallengeGeometry { readonly leftTime: number }
export interface ChallengeTimerPort {
  setTimeout(handler: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export function validateChallenge(
  type: ChallengeType,
  time: number,
  beat: ChallengeBeat,
  visibleBeats: readonly ChallengeBeat[],
  geometry: ChallengeGeometry,
  endTime: number,
): boolean {
  if (![time, beat.r, geometry.leftTime, endTime].every(Number.isFinite)) return false;
  if (type === "st") {
    const offset = time - beat.r;
    return offset >= 0.04 && offset <= 0.2;
  }
  let longest: { a: number; b: number; rr: number } | null = null;
  for (let i = 1; i < visibleBeats.length; i += 1) {
    const a = visibleBeats[i - 1]?.r;
    const b = visibleBeats[i]?.r;
    if (a === undefined || b === undefined) continue;
    const row = { a, b, rr: b - a };
    if (!longest || row.rr > longest.rr) longest = row;
  }
  if (!longest) return false;
  const midpoint = (longest.a + longest.b) / 2;
  return time >= geometry.leftTime - 0.1 && time <= endTime - 0.05
    && Math.abs(time - midpoint) < Math.min(0.24, longest.rr * 0.32);
}

/** Başarı geri bildirimini geciktirir; timer dispose edildiğinde çalışamaz. */
export function scheduleChallengeCompletion(
  lifecycle: PulseLifecycle,
  timers: ChallengeTimerPort,
  onComplete: () => void,
  delayMs = 1400,
): void {
  let active = true;
  const handle = timers.setTimeout(() => {
    if (active) onComplete();
  }, delayMs);
  lifecycle.timer(handle, (value) => {
    active = false;
    timers.clearTimeout(value);
  });
}

/** Nötr ses düzeyi kontrol tonu (kaynak StartScreen `playTone`). DOM ve `Date.now()` yok. */

interface ToneParam {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

interface VolumeToneNode {
  connect(node: unknown): void;
}

export interface VolumeToneOscillator extends VolumeToneNode {
  frequency: { value: number };
  type: string;
  start(time: number): void;
  stop(time: number): void;
}

export interface VolumeToneGain extends VolumeToneNode {
  gain: ToneParam;
}

export interface VolumeToneContext {
  currentTime: number;
  destination: unknown;
  createOscillator(): VolumeToneOscillator;
  createGain(): VolumeToneGain;
}

export interface VolumeCheckAudio {
  ensureContext(): Promise<VolumeToneContext>;
}

export function playVolumeCheckTone(ctx: VolumeToneContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440;
  osc.type = "sine";
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
  gain.gain.setValueAtTime(0.2, t + 0.7);
  gain.gain.linearRampToValueAtTime(0, t + 0.8);
  osc.start(t);
  osc.stop(t + 0.85);
}

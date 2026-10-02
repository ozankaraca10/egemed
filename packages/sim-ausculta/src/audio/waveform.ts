import type { SoundRecord } from "../core/types";

/** Hafif dalga formu. Tepeler bir kez hesaplanır. DOM lib yok; tuval ve pencere yapısal okunur. */

const peaksCache = new Map<string, Float32Array>();

/** `AudioBuffer.getChannelData` ile uyumlu sahte tampon. */
interface PeakAudioBuffer {
  getChannelData(channel: number): ArrayLike<number>;
}

export interface WaveContext2D {
  fillStyle: string;
  font: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface WaveCanvas {
  clientWidth: number;
  clientHeight: number;
  width: number;
  height: number;
  getContext(contextId: "2d"): WaveContext2D | null;
}

interface WaveAnnotation {
  at: number;
  label: string;
  color: string;
}

interface DrawWaveOptions {
  color?: string;
  progress?: number;
  annotations?: WaveAnnotation[];
  progressColor?: string;
}

interface WaveWindow {
  devicePixelRatio?: number;
}

interface WaveDocument {
  body: object;
}

function devicePixelRatio(): number {
  const win = (globalThis as { window?: WaveWindow }).window;
  return win?.devicePixelRatio || 1;
}

export function computePeaks(sound: SoundRecord, buffer: PeakAudioBuffer, buckets = 240): Float32Array {
  const cached = peaksCache.get(sound.id);
  if (cached) return cached;
  const ch = buffer.getChannelData(0);
  const per = Math.floor(ch.length / buckets);
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * per;
    for (let j = 0; j < per; j += 2) {
      const a = Math.abs(ch[start + j] || 0);
      if (a > max) max = a;
    }
    peaks[i] = max;
  }
  peaksCache.set(sound.id, peaks);
  return peaks;
}

export function drawWave(canvas: WaveCanvas, peaks: Float32Array, opts: DrawWaveOptions): void {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;
  const dpr = devicePixelRatio();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2d.clearRect(0, 0, w, h);

  const mid = h / 2;
  const n = peaks.length;
  const barW = Math.max(1, w / n - 0.35);
  const progress = opts.progress ?? 0;

  for (let i = 0; i < n; i++) {
    const x = (i / n) * w;
    const amp = Math.pow(peaks[i] ?? 0, 0.72) * (h / 2 - 6);
    const inProgress = i / n <= progress;
    ctx2d.fillStyle = inProgress ? (opts.progressColor ?? "#1673e6") : (opts.color ?? "#b9cfeb");
    ctx2d.fillRect(x, mid - amp, barW, amp * 2 || 1);
  }

  if (opts.annotations?.length) {
    const host = globalThis as unknown as {
      document: WaveDocument;
      getComputedStyle(element: object): { fontFamily: string };
    };
    ctx2d.font = "600 11px " + host.getComputedStyle(host.document.body).fontFamily;
    for (const a of opts.annotations) {
      const x = a.at * w;
      ctx2d.fillStyle = a.color;
      ctx2d.fillRect(x - 0.5, 0, 1, h);
      ctx2d.fillText(a.label, Math.min(x + 4, w - 30), 12);
    }
  }
}

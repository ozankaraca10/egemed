import type { PulseLifecycle, Disconnectable } from "../../host/lifecycle";

/** Canvas 2D API'sinin yalnız bu sahnede kullanılan yapısal altkümesi. */
export interface HeartCanvasContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
}

export interface HeartCanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface CoronaryParticle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Zaman/index'ten doğrudan hesaplanır; rastgelelik ve paylaşılan durum kullanmaz. */
export function coronaryParticlePositions(timeMs: number, count = 8): readonly CoronaryParticle[] {
  const safeCount = Math.max(0, Math.floor(count));
  const time = Number.isFinite(timeMs) ? timeMs : 0;
  return Array.from({ length: safeCount }, (_, index) => {
    const phase = ((time / 1800 + index / safeCount) % 1 + 1) % 1;
    const wave = Math.sin((phase + index * 0.07) * Math.PI * 2);
    return {
      x: 0.22 + phase * 0.56,
      y: 0.47 + wave * 0.12,
      radius: 2 + ((index % 3) * 0.5),
    };
  });
}

function circle(context: HeartCanvasContext, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/** Kalbi ve koroner akış parçacıklarını verilen bağlama çizer. */
export function drawHeartCanvas(
  context: HeartCanvasContext,
  size: HeartCanvasSize,
  timeMs = 0,
): void {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  context.clearRect(0, 0, width, height);

  const x = width * 0.5;
  const y = height * 0.49;
  const scale = Math.min(width, height) * 0.34;
  context.beginPath();
  context.moveTo(x, y + scale * 0.82);
  context.bezierCurveTo(x - scale * 1.2, y + scale * 0.12, x - scale * 1.05, y - scale * 0.75, x, y - scale * 0.18);
  context.bezierCurveTo(x + scale * 1.05, y - scale * 0.75, x + scale * 1.2, y + scale * 0.12, x, y + scale * 0.82);
  context.closePath();
  context.fillStyle = "#c83c52";
  context.fill();
  context.strokeStyle = "#7c2033";
  context.lineWidth = Math.max(1, scale * 0.035);
  context.stroke();

  context.fillStyle = "#ffd166";
  for (const particle of coronaryParticlePositions(timeMs)) {
    circle(context, particle.x * width, particle.y * height, particle.radius);
  }
}

export interface HeartResizeObserver extends Disconnectable {
  observe(target: unknown, onResize: () => void): void;
}

export interface HeartCanvasOptions {
  readonly context: HeartCanvasContext;
  readonly lifecycle: Pick<PulseLifecycle, "observe">;
  readonly observer: HeartResizeObserver;
  readonly target: unknown;
  readonly size: () => HeartCanvasSize;
  readonly timeMs: () => number;
}

/** Kayıtlı gözlemci her boyut değişiminde yeniden çizer ve lifecycle dispose'ta kapanır. */
export function observeHeartCanvas(options: HeartCanvasOptions): void {
  options.lifecycle.observe(options.observer);
  const redraw = (): void => drawHeartCanvas(options.context, options.size(), options.timeMs());
  options.observer.observe(options.target, redraw);
  redraw();
}

export interface AudioParamPort {
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

export interface MonitorOscillatorNode {
  type: string;
  frequency: AudioParamPort;
  connect(node: unknown): void;
  start(time: number): void;
  stop(time: number): void;
}

export interface MonitorGainNode {
  gain: AudioParamPort;
  connect(node: unknown): void;
}

export interface MonitorAudioContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): MonitorOscillatorNode;
  createGain(): MonitorGainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface MonitorIntervalHost {
  setInterval(handler: () => void, timeoutMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface AudioPort {
  unlock(): Promise<boolean>;
  start(): void;
  stop(): void;
  close(): Promise<void>;
}

export interface MonitorAudioConfig {
  readonly beatSeconds: number;
  readonly lookAheadSeconds: number;
  readonly scheduleIntervalMs: number;
  readonly toneHz: number;
  readonly toneSeconds: number;
  readonly toneGain: number;
}

export interface CreateMonitorAudioPortOptions {
  createContext: () => MonitorAudioContext | null;
  intervals: MonitorIntervalHost;
  config?: Partial<MonitorAudioConfig>;
}

const DEFAULT_CONFIG: MonitorAudioConfig = {
  beatSeconds: 0.8,
  lookAheadSeconds: 0.5,
  scheduleIntervalMs: 250,
  toneHz: 880,
  toneSeconds: 0.06,
  toneGain: 0.06,
};

/** Source landing monitor beep extracted as an injectable AudioPort. */
export function createMonitorAudioPort(options: CreateMonitorAudioPortOptions): AudioPort {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  let context: MonitorAudioContext | null = null;
  let nextBeatTime = 0;
  let running = false;
  let closed = false;
  let intervalHandle: unknown = null;

  const scheduleBeat = (time: number): void => {
    const ctx = context;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(config.toneHz, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(config.toneGain, time + 0.008);
      gain.gain.linearRampToValueAtTime(0, time + config.toneSeconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + config.toneSeconds + 0.02);
    } catch {
      // Audio graph errors are ignored so the scheduler can continue.
    }
  };

  const schedulerTick = (): void => {
    const ctx = context;
    if (!ctx || !running || ctx.state !== "running") return;
    while (nextBeatTime < ctx.currentTime + config.lookAheadSeconds) {
      scheduleBeat(nextBeatTime);
      nextBeatTime += config.beatSeconds;
    }
  };

  const clearTimer = (): void => {
    if (intervalHandle === null) return;
    options.intervals.clearInterval(intervalHandle);
    intervalHandle = null;
  };

  const ensureContext = (): MonitorAudioContext | null => {
    if (context || closed) return context;
    context = options.createContext();
    return context;
  };

  return {
    async unlock(): Promise<boolean> {
      if (closed) return false;
      const ctx = ensureContext();
      if (!ctx) return false;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      return ctx.state === "running";
    },
    start(): void {
      if (closed || running) return;
      const ctx = context;
      if (!ctx || ctx.state !== "running") return;
      running = true;
      nextBeatTime = ctx.currentTime + 0.05;
      schedulerTick();
      intervalHandle = options.intervals.setInterval(schedulerTick, config.scheduleIntervalMs);
    },
    stop(): void {
      running = false;
      clearTimer();
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      running = false;
      clearTimer();
      const ctx = context;
      context = null;
      if (!ctx) return;
      try {
        await ctx.close();
      } catch {
        // Close failures should not break unmount/dispose flow.
      }
    },
  };
}

import { AUDIO_CONFIG, type StethHead } from "./config";
import type { SoundRecord } from "../core/types";

/** Yapısal Web Audio yüzeyi. DOM lib yok; tarayıcı bağlamı dışarıdan gelir. */

export interface AudioParamLike {
  value: number;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): void;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(startTime: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: { value: number };
  gain: { value: number };
  Q: { value: number };
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
}

export interface AudioBufferLike {
  readonly id?: string;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  onended: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface AudioContextLike {
  state: string;
  currentTime: number;
  destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** ES2022 lib'inde AbortSignal yok; fetch/decode bu sinyalle iptal edilir. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AudioEngineDeps {
  createContext: () => AudioContextLike;
  fetchImpl: (url: string, init: { cache: "force-cache"; signal: AbortSignalLike }) => Promise<FetchResponseLike>;
  decodeAudioData: (
    ctx: AudioContextLike,
    data: ArrayBuffer,
    signal: AbortSignalLike,
  ) => Promise<AudioBufferLike>;
  now: () => number;
}

export type EngineState = "idle" | "loading" | "playing";

interface ActiveChannel {
  pointId: string;
  soundId: string;
  source: AudioBufferSourceNodeLike;
  gain: GainNodeLike;
  head: StethHead;
  startedAt: number;
  listenMs: number;
}

interface CancelSource {
  readonly signal: AbortSignalLike;
  abort(): void;
}

interface Inflight {
  ticket: number;
  cancel: CancelSource;
  promise: Promise<AudioBufferLike>;
}

interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

const timers = globalThis as unknown as TimerHost;

function createCancelSource(): CancelSource {
  let aborted = false;
  const listeners = new Set<() => void>();
  return {
    signal: {
      get aborted() {
        return aborted;
      },
      addEventListener(_type, listener) {
        if (aborted) listener();
        else listeners.add(listener);
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener);
      },
    },
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}

function cancelled(): Error {
  const error = new Error("audio cancelled");
  error.name = "AbortError";
  return error;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class AudioEngine {
  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private readonly buffers = new Map<string, AudioBufferLike>();
  private readonly inflight = new Map<string, Inflight>();
  private readonly pendingTimers = new Set<number>();
  private active: ActiveChannel | null = null;
  private volume = AUDIO_CONFIG.defaultVolume;
  private epoch = 0;
  private disposed = false;
  lastListenMs = 0;

  constructor(private readonly deps: AudioEngineDeps) {}

  /** Kullanıcı etkileşimi içinde çağrılmalı (autoplay uyumu). */
  async ensureContext(): Promise<AudioContextLike> {
    if (this.disposed) throw cancelled();
    if (!this.ctx) {
      const ctx = this.deps.createContext();
      const master = ctx.createGain();
      master.gain.value = this.volume * AUDIO_CONFIG.clipGuardGain;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = AUDIO_CONFIG.masterLowpassHz;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = AUDIO_CONFIG.limiter.thresholdDb;
      lim.knee.value = AUDIO_CONFIG.limiter.kneeDb;
      lim.ratio.value = AUDIO_CONFIG.limiter.ratio;
      lim.attack.value = AUDIO_CONFIG.limiter.attackSec;
      lim.release.value = AUDIO_CONFIG.limiter.releaseSec;
      master.connect(lp);
      lp.connect(lim);
      lim.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    const ctx = this.ctx;
    if (ctx.state === "suspended") await ctx.resume();
    if (this.disposed || this.ctx !== ctx) throw cancelled();
    return ctx;
  }

  async load(sound: SoundRecord): Promise<AudioBufferLike> {
    if (this.disposed) throw cancelled();
    return this.loadFor(sound, this.epoch);
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyMasterGain();
  }

  getActive(): ActiveChannel | null {
    return this.active;
  }

  getState(): EngineState {
    return this.active ? "playing" : "idle";
  }

  /** Bir noktanın sesini başlat (çapraz geçişli). Aynı ses zaten çalıyorsa işlem yapmaz. */
  async play(pointId: string, sound: SoundRecord, head: StethHead): Promise<void> {
    if (this.disposed) return;
    if (this.active && this.active.soundId === sound.id && this.active.head === head) return;
    const ticket = this.claim();
    try {
      const ctx = await this.ensureContext();
      if (!this.alive(ticket)) return;
      const buffer = await this.loadFor(sound, ticket);
      if (!this.alive(ticket)) return;
      this.fadeOutActive();
      const master = this.master;
      if (!this.alive(ticket) || !master) return;
      this.startChannel(ctx, master, pointId, sound, head, buffer);
    } catch (error) {
      if (!this.alive(ticket) || isAbort(error)) return;
      (globalThis as unknown as { console: { error: (...args: unknown[]) => void } }).console.error(
        "[Ausculta] ses yüklenemedi:",
        sound.runtimeUrl,
        error,
      );
      throw error;
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.claim();
    this.fadeOutActive();
  }

  /** Tekrar dinleme — aynı nokta sesini yeniden başlatır. */
  async replay(pointId: string, sound: SoundRecord, head: StethHead): Promise<void> {
    this.stop();
    await this.play(pointId, sound, head);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.abortStale();
    this.clearTimers();
    this.haltActive();
    this.buffers.clear();
    this.inflight.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().then(
      () => undefined,
      () => undefined,
    );
  }

  private claim(): number {
    this.epoch += 1;
    this.abortStale();
    return this.epoch;
  }

  private alive(ticket: number): boolean {
    return !this.disposed && ticket === this.epoch;
  }

  private abortStale(): void {
    for (const [id, job] of this.inflight) {
      if (job.ticket !== this.epoch) {
        job.cancel.abort();
        this.inflight.delete(id);
      }
    }
  }

  private async loadFor(sound: SoundRecord, ticket: number): Promise<AudioBufferLike> {
    const cached = this.buffers.get(sound.id);
    if (cached) return cached;
    const existing = this.inflight.get(sound.id);
    if (existing?.ticket === ticket) return existing.promise;
    if (existing) existing.cancel.abort();
    const cancel = createCancelSource();
    const promise = this.fetchDecode(sound, ticket, cancel);
    this.inflight.set(sound.id, { ticket, cancel, promise });
    try {
      const buf = await promise;
      if (this.alive(ticket)) this.buffers.set(sound.id, buf);
      return buf;
    } finally {
      if (this.inflight.get(sound.id)?.ticket === ticket) this.inflight.delete(sound.id);
    }
  }

  private async fetchDecode(sound: SoundRecord, ticket: number, cancel: CancelSource): Promise<AudioBufferLike> {
    const ctx = await this.ensureContext();
    if (!this.alive(ticket) || cancel.signal.aborted) throw cancelled();
    const res = await this.deps.fetchImpl(sound.runtimeUrl, { cache: "force-cache", signal: cancel.signal });
    if (!this.alive(ticket) || cancel.signal.aborted) throw cancelled();
    if (!res.ok) throw new Error(`audio fetch failed: ${sound.runtimeUrl} (${res.status})`);
    const data = await res.arrayBuffer();
    if (!this.alive(ticket) || cancel.signal.aborted) throw cancelled();
    const buf = await this.deps.decodeAudioData(ctx, data, cancel.signal);
    if (!this.alive(ticket) || cancel.signal.aborted) throw cancelled();
    return buf;
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx) return;
    const level = this.volume * AUDIO_CONFIG.clipGuardGain;
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.03);
  }

  private startChannel(
    ctx: AudioContextLike,
    master: GainNodeLike,
    pointId: string,
    sound: SoundRecord,
    head: StethHead,
    buffer: AudioBufferLike,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = AUDIO_CONFIG.loopWholeSegment;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (head === "bell") {
      const dsp = AUDIO_CONFIG.dsp.bell;
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = dsp.lowshelfHz;
      low.gain.value = dsp.lowshelfDb;
      const peak = ctx.createBiquadFilter();
      peak.type = "peaking";
      peak.frequency.value = dsp.peakingHz;
      peak.gain.value = dsp.peakingDb;
      peak.Q.value = dsp.peakingQ;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = dsp.highshelfHz;
      high.gain.value = dsp.highshelfDb;
      src.connect(low);
      low.connect(peak);
      peak.connect(high);
      high.connect(gain);
    } else {
      const dsp = AUDIO_CONFIG.dsp.diaphragm;
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = dsp.lowshelfHz;
      low.gain.value = dsp.lowshelfDb;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = dsp.highshelfHz;
      high.gain.value = dsp.highshelfDb;
      src.connect(low);
      low.connect(high);
      high.connect(gain);
    }
    gain.connect(master);
    const t0 = ctx.currentTime;
    const xf = AUDIO_CONFIG.crossfadeMs / 1000;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + xf);
    src.onended = () => {
      if (this.active?.source === src) this.active = null;
      try {
        src.disconnect();
      } catch {
        /* disposed */
      }
      try {
        gain.disconnect();
      } catch {
        /* disposed */
      }
    };
    src.start();
    this.active = { pointId, soundId: sound.id, source: src, gain, head, startedAt: this.deps.now(), listenMs: 0 };
  }

  /** Çalan kanalı söndürür. Dönem artışı çağırandadır; aksi halde yeni play kendini iptal eder. */
  private fadeOutActive(): void {
    if (!this.active) return;
    const { source, gain } = this.active;
    const ctx = this.ctx;
    if (ctx) {
      const t = ctx.currentTime;
      const xf = AUDIO_CONFIG.crossfadeMs / 1000;
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + xf);
      } catch {
        /* ignore */
      }
      this.later(() => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }, Math.ceil(xf * 1000) + 30);
    } else {
      try {
        source.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      gain.disconnect();
    } catch {
      /* ignore */
    }
    this.lastListenMs = this.active.listenMs + (this.deps.now() - this.active.startedAt);
    this.active = null;
  }

  private haltActive(): void {
    const active = this.active;
    if (!active) return;
    this.lastListenMs = active.listenMs + (this.deps.now() - active.startedAt);
    this.active = null;
    try {
      active.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      active.gain.disconnect();
    } catch {
      /* disposed */
    }
    try {
      active.source.disconnect();
    } catch {
      /* disposed */
    }
  }

  private later(fn: () => void, ms: number): void {
    const id = timers.setTimeout(() => {
      this.pendingTimers.delete(id);
      if (this.disposed) return;
      fn();
    }, ms);
    this.pendingTimers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.pendingTimers) timers.clearTimeout(id);
    this.pendingTimers.clear();
  }
}

/** Mount başına bir örnek. Modül düzeyinde singleton yoktur. */
export function createAudioEngine(deps: AudioEngineDeps): AudioEngine {
  return new AudioEngine(deps);
}

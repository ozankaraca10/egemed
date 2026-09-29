import { describe, expect, it, vi } from "vitest";
import { createAudioEngine, createStageSession } from "../../packages/sim-ausculta/src/index";
import type { SoundRecord, StageEnv, StagePoint, StageSessionBindings } from "../../packages/sim-ausculta/src/index";
import type {
  AbortSignalLike,
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioEngineDeps,
  AudioNodeLike,
  AudioParamLike,
  FetchResponseLike,
  GainNodeLike,
} from "../../packages/sim-ausculta/src/audio/engine";

/** Unmount sırası: geç çözülen play kaynak başlatmaz. DOM yok. */

const point: StagePoint = {
  id: "cardiac_aortic",
  view: "front",
  label: "Aort",
  color: "s1",
  tagSide: "left",
  x: 0.46,
  y: 0.27,
};

function sound(): SoundRecord {
  return { id: "s1", runtimeUrl: "assets/audio/runtime/s1.wav" } as SoundRecord;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function scriptedEnv(): { env: StageEnv; flush: () => void; pending: () => number } {
  let next = 1;
  const timeouts = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  return {
    env: {
      setTimeout(handler) {
        const id = next++;
        timeouts.set(id, handler);
        return id;
      },
      clearTimeout(id) {
        timeouts.delete(id);
      },
      setInterval(handler) {
        const id = next++;
        intervals.set(id, handler);
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      },
      observeStage: () => () => undefined,
    },
    flush() {
      const due = [...timeouts.entries()];
      timeouts.clear();
      for (const [, handler] of due) handler();
    },
    pending: () => timeouts.size,
  };
}

function param(): AudioParamLike {
  return {
    value: 0,
    setTargetAtTime(value) {
      this.value = value;
    },
    setValueAtTime(value) {
      this.value = value;
    },
    linearRampToValueAtTime(value) {
      this.value = value;
    },
    cancelScheduledValues() {
      /* yok */
    },
  };
}

function node(): AudioNodeLike {
  return { connect() {}, disconnect() {} };
}

function harness(decode: AudioEngineDeps["decodeAudioData"]): {
  engine: ReturnType<typeof createAudioEngine>;
  sources: AudioBufferSourceNodeLike[];
  fetches: AbortSignalLike[];
} {
  const sources: AudioBufferSourceNodeLike[] = [];
  const fetches: AbortSignalLike[] = [];
  let master: GainNodeLike | null = null;
  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 1,
    destination: node(),
    createGain() {
      const gain = { ...node(), gain: param() } as GainNodeLike;
      master ??= gain;
      return gain;
    },
    createBiquadFilter() {
      return { ...node(), type: "", frequency: { value: 0 }, gain: { value: 0 }, Q: { value: 0 } };
    },
    createDynamicsCompressor() {
      return { ...node(), threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } };
    },
    createBufferSource() {
      const source: AudioBufferSourceNodeLike = {
        ...node(),
        buffer: null,
        loop: false,
        onended: null,
        start() {},
        stop() {},
      };
      sources.push(source);
      return source;
    },
    resume: async () => undefined,
    close: async () => undefined,
  };
  void master;
  const engine = createAudioEngine({
    createContext: () => ctx,
    fetchImpl: async (_url, init) => {
      fetches.push(init.signal);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) } satisfies FetchResponseLike;
    },
    decodeAudioData: decode,
    now: () => 1_000,
  });
  return { engine, sources, fetches };
}

function sessionFor(
  engine: StageSessionBindings["engine"],
  env: StageEnv,
  overrides?: Partial<StageSessionBindings>,
) {
  const bindings: StageSessionBindings = {
    points: [point],
    bodyType: "erkek",
    view: "front",
    head: "diaphragm",
    strict: false,
    env,
    engine,
    soundFor: () => sound(),
    onVisit: () => undefined,
    onDwell: () => undefined,
    onListen: () => undefined,
    onPlayingChange: () => undefined,
    onSnapped: () => undefined,
    onPlaying: () => undefined,
    onSpent: () => undefined,
    onAudioStatus: () => undefined,
    onPulse: () => undefined,
    getPos: () => ({ x: 0.5, y: 0.75 }),
    setPos: () => undefined,
    applyPos: () => undefined,
    measure: () => null,
    ...overrides,
  };
  return createStageSession(bindings);
}

describe("PatientStage ses temizliği", () => {
  it("unmount sırayı artırır ve geç decode ses başlatmaz", async () => {
    const gate = deferred<AudioBufferLike>();
    const { engine, sources, fetches } = harness(() => gate.promise);
    const clock = scriptedEnv();
    const session = sessionFor(engine, clock.env);
    const before = session.seq();
    session.place(point.id);
    expect(session.seq()).toBe(before + 1);
    expect(clock.pending()).toBe(1);
    clock.flush();
    await vi.waitFor(() => expect(fetches.length).toBe(1));
    session.dispose();
    expect(session.seq()).toBe(before + 2);
    expect(fetches[0]?.aborted).toBe(true);
    gate.resolve({ id: "late" });
    await vi.waitFor(() => expect(fetches[0]?.aborted).toBe(true));
    await Promise.resolve();
    expect(sources).toHaveLength(0);
  });
});

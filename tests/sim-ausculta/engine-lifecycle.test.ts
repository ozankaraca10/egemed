import { describe, expect, it, vi } from "vitest";
import type { SoundRecord } from "../../packages/sim-ausculta/src/index";
import { AUDIO_CONFIG } from "../../packages/sim-ausculta/src/audio/config";
import { createAudioEngine } from "../../packages/sim-ausculta/src/audio/engine";
import type {
  AbortSignalLike,
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioEngineDeps,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  DynamicsCompressorNodeLike,
  FetchResponseLike,
  GainNodeLike,
} from "../../packages/sim-ausculta/src/audio/engine";

function sound(id: string): SoundRecord {
  return { id, runtimeUrl: `assets/audio/runtime/${id}.wav` } as SoundRecord;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
      /* recorded by the caller via the node */
    },
  };
}

function node(): AudioNodeLike {
  return { connect() {}, disconnect() {} };
}

interface FakeSource extends AudioBufferSourceNodeLike {
  stop: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  ctx: AudioContextLike;
  sources: FakeSource[];
  biquads: BiquadFilterNodeLike[];
  master: GainNodeLike | null;
  close: ReturnType<typeof vi.fn>;
}

function createFakeContext(state = "running"): FakeContext {
  const sources: FakeSource[] = [];
  const biquads: BiquadFilterNodeLike[] = [];
  const bag: FakeContext = {
    ctx: undefined as unknown as AudioContextLike,
    sources,
    biquads,
    master: null,
    close: vi.fn(() => Promise.resolve()),
  };
  bag.ctx = {
    state,
    currentTime: 4,
    destination: node(),
    createGain() {
      const gain = { ...node(), gain: param() } as GainNodeLike;
      bag.master ??= gain;
      return gain;
    },
    createBiquadFilter() {
      const filter = {
        ...node(),
        type: "",
        frequency: { value: 0 },
        gain: { value: 0 },
        Q: { value: 0 },
      } as BiquadFilterNodeLike;
      biquads.push(filter);
      return filter;
    },
    createDynamicsCompressor() {
      return {
        ...node(),
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
      } as DynamicsCompressorNodeLike;
    },
    createBufferSource() {
      const source: FakeSource = {
        ...node(),
        buffer: null,
        loop: false,
        onended: null,
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    },
    resume: () => {
      bag.ctx.state = "running";
      return Promise.resolve();
    },
    close: bag.close,
  };
  return bag;
}

function okResponse(): FetchResponseLike {
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
}

function harness(options?: {
  fetchImpl?: AudioEngineDeps["fetchImpl"];
  decodeAudioData?: AudioEngineDeps["decodeAudioData"];
  state?: string;
  now?: () => number;
}): { engine: ReturnType<typeof createAudioEngine>; fake: FakeContext; fetches: AbortSignalLike[] } {
  const fake = createFakeContext(options?.state ?? "running");
  const fetches: AbortSignalLike[] = [];
  const engine = createAudioEngine({
    createContext: () => fake.ctx,
    fetchImpl: options?.fetchImpl ?? (async (_url, init) => {
      fetches.push(init.signal);
      return okResponse();
    }),
    decodeAudioData: options?.decodeAudioData ?? (async () => ({ id: "buf" }) satisfies AudioBufferLike),
    now: options?.now ?? (() => 1_000),
  });
  return { engine, fake, fetches };
}

describe("Ausculta ses motoru yaşam döngüsü", () => {
  it("oynatır ve durdurur", async () => {
    const { engine, fake, fetches } = harness();
    await engine.play("aortic", sound("s1"), "bell");
    expect(fetches[0]?.aborted).toBe(false);
    expect(fake.master?.gain.value).toBe(AUDIO_CONFIG.defaultVolume);
    expect(fake.biquads).toHaveLength(4);
    expect(fake.biquads.some((filter) => filter.type === "peaking")).toBe(true);
    const source = fake.sources[0];
    expect(source?.loop).toBe(true);
    expect(source?.start).toHaveBeenCalledOnce();
    expect(engine.getState()).toBe("playing");
    expect(engine.getActive()?.pointId).toBe("aortic");

    vi.useFakeTimers();
    engine.stop();
    expect(engine.getState()).toBe("idle");
    expect(engine.lastListenMs).toBe(0);
    expect(source?.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(source?.stop).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("uçuştaki decode dispose sonrası ses başlatmaz", async () => {
    const gate = deferred<AudioBufferLike>();
    const { engine, fake, fetches } = harness({
      decodeAudioData: () => gate.promise,
    });
    const pending = engine.play("mitral", sound("s2"), "diaphragm");
    await vi.waitFor(() => expect(fetches.length).toBe(1));
    engine.dispose();
    expect(fetches[0]?.aborted).toBe(true);
    gate.resolve({ id: "late" });
    await pending;
    expect(fake.sources).toHaveLength(0);
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it("yeni play önceki epoch yüklemesini iptal eder", async () => {
    const first = deferred<FetchResponseLike>();
    const second = deferred<FetchResponseLike>();
    let calls = 0;
    const { engine, fake, fetches } = harness({
      fetchImpl: (_url, init) => {
        fetches.push(init.signal);
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    });
    const older = engine.play("p1", sound("old"), "bell");
    await vi.waitFor(() => expect(fetches.length).toBe(1));
    const newer = engine.play("p2", sound("new"), "diaphragm");
    await vi.waitFor(() => expect(fetches.length).toBe(2));
    expect(fetches[0]?.aborted).toBe(true);
    first.resolve(okResponse());
    await older;
    expect(fake.sources).toHaveLength(0);
    second.resolve(okResponse());
    await newer;
    expect(fake.sources).toHaveLength(1);
    expect(engine.getActive()?.soundId).toBe("new");
  });

  it("dispose zamanlayıcıyı temizler", async () => {
    const { engine, fake } = harness();
    await engine.play("p", sound("s"), "bell");
    vi.useFakeTimers();
    const host = globalThis as unknown as { clearTimeout: (id: number) => void };
    const clear = vi.spyOn(host, "clearTimeout");
    engine.stop();
    engine.dispose();
    expect(clear).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.sources[0]?.stop).not.toHaveBeenCalled();
    clear.mockRestore();
    vi.useRealTimers();
  });

  it("çift dispose AudioContext.close'u bir kez çağırır", async () => {
    const { engine, fake } = harness({ state: "suspended" });
    await engine.play("p", sound("s"), "bell");
    expect(fake.ctx.state).toBe("running");
    engine.dispose();
    engine.dispose();
    expect(fake.close).toHaveBeenCalledOnce();
    await engine.play("p", sound("s2"), "diaphragm");
    expect(fake.sources).toHaveLength(1);
  });

  it("iki örnek birbirinin bağlamını paylaşmaz", async () => {
    const a = harness();
    const b = harness();
    await a.engine.play("p", sound("shared"), "bell");
    expect(a.fake.sources).toHaveLength(1);
    expect(b.fake.sources).toHaveLength(0);
    a.engine.dispose();
    expect(a.fake.close).toHaveBeenCalledOnce();
    expect(b.fake.close).not.toHaveBeenCalled();
    await b.engine.play("p", sound("shared"), "diaphragm");
    expect(b.fake.sources).toHaveLength(1);
    expect(b.fetches).toHaveLength(1);
  });
});

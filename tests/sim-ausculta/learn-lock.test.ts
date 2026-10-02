import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimLearnPort } from "../../packages/sim-host/src/SimHost";
import {
  AUSCULTA_CONTENT_VERSION,
  EmbeddedProvider,
  LearnGateProvider,
  LEARN_LISTENED_KEY,
  LEARN_EXAMPLE_SECONDS,
  exampleKey,
  LIBRARY_GROUPS,
  LIBRARY_ITEM_COUNT,
  LIBRARY_ITEM_KEYS,
  ModeSelectScreen,
  StoreProvider,
  canStartMode,
  challengeLearnLockText,
  contentVersion,
  createLearnCompletionNotifier,
  createLearnTracker,
  createMemoryRuntimeAdapter,
  createStageSession,
  initialState,
  learnLockText,
  learnProgressText,
  listenedKeyOnPlay,
  parseListened,
  resolveLibrarySoundEx,
} from "../../packages/sim-ausculta/src/index";
import { learnExamples } from "../../packages/sim-ausculta/src/data/learnSets";
import { examplePointIds } from "../../packages/sim-ausculta/src/screens/LearnScreen";
import type {
  StageAudio,
  StageEnv,
  StagePoint,
  StageSessionBindings,
  StoragePort,
  WindowLike,
} from "../../packages/sim-ausculta/src/index";

/** T209 — öğrenme tamamlama tespiti ve mod kilidi: saf hesap + statik işaretleme. */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

interface MemoryStorage extends StoragePort {
  readonly entries: Map<string, string>;
}

function memoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

function learnPort(complete: boolean, calls: string[] = []): SimLearnPort {
  return {
    complete,
    async markComplete(version: string): Promise<void> {
      calls.push(version);
    },
  };
}

function renderInGate(node: ReactNode, options: { storage?: StoragePort; learn?: SimLearnPort; audience?: "student" | "visitor" } = {}): string {
  const { storage = memoryStorage(), learn, audience } = options;
  const screen = audience === undefined
    ? node
    : createElement(EmbeddedProvider, { embedded: true, audience, children: node });
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      env: inertWindow,
      initialState,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
      children: createElement(LearnGateProvider, {
        ...(learn === undefined ? {} : { learn }),
        children: screen,
      }),
    }),
  );
}

describe("contentVersion", () => {
  it("deterministik, sıra duyarlı ve sözleşme desenine uyar", () => {
    expect(contentVersion(["a", "b"])).toBe(contentVersion(["a", "b"]));
    expect(contentVersion(["a", "b"])).not.toBe(contentVersion(["b", "a"]));
    expect(contentVersion(["a", "b"])).toMatch(/^[a-z0-9._-]{1,40}$/);
    expect(AUSCULTA_CONTENT_VERSION).toBe(contentVersion(LIBRARY_ITEM_KEYS));
    expect(AUSCULTA_CONTENT_VERSION).toMatch(/^[a-z0-9._-]{1,40}$/);
  });
});

describe("parseListened", () => {
  it("bozuk/eksik/dizi veri boş harita sayılır", () => {
    expect(parseListened(null).size).toBe(0);
    expect(parseListened("{bozuk").size).toBe(0);
    expect(parseListened('"heart.normal"').size).toBe(0);
    expect(parseListened("{}").size).toBe(0);
    expect(parseListened('["heart.normal"]').size).toBe(0);
  });

  it("yalnız var olan örnek anahtarları okunur, süre örnek eşiğine kırpılır", () => {
    const countOf = (key: string) => (key === "lung.normal" ? 4 : 1);
    const parsed = parseListened(
      '{"heart.normal#0":3,"heart.normal#1":5,"heart.normal":5,"bilinmeyen#0":5,"heart.s3#0":"x","lung.normal#3":600}',
      LIBRARY_ITEM_KEYS,
      countOf,
    );
    expect([...parsed]).toEqual([["heart.normal#0", 3], ["lung.normal#3", LEARN_EXAMPLE_SECONDS]]);
  });
});

describe("learnLock metinleri", () => {
  it("ilerleme, kilit ve düello metinleri ilerlemeyi taşır", () => {
    expect(learnProgressText(3, 24)).toBe("Öğrenme: 3/24 ses dinlendi");
    expect(learnLockText(3, 24)).toBe("Önce öğrenme modunu tamamlayın: 3/24 ses dinlendi.");
    expect(challengeLearnLockText(0, 24)).toBe("Meydan okuma için önce öğrenme modunu tamamlayın: 0/24 ses dinlendi.");
  });
});

describe("canStartMode", () => {
  it("öğrenme her zaman açık; uygulama/değerlendirme yalnız tamamlanınca", () => {
    expect(canStartMode("learn", false)).toBe(true);
    expect(canStartMode("learn", true)).toBe(true);
    expect(canStartMode("practice", false)).toBe(false);
    expect(canStartMode("practice", true)).toBe(true);
    expect(canStartMode("assessment", false)).toBe(false);
    expect(canStartMode("assessment", true)).toBe(true);
  });
});

describe("listenedKeyOnPlay", () => {
  const points = ["cardiac_aortic", "cardiac_pulmonic"];

  it("oynatma başarısı + öğenin dinleme noktası öğeyi dinlendi yapar", () => {
    expect(listenedKeyOnPlay(true, "cardiac_aortic", "heart.normal", points)).toBe("heart.normal");
  });

  it("yalnız seçmek yetmez; oynatmayan/boş/yabancı nokta kaydedilmez", () => {
    expect(listenedKeyOnPlay(false, "cardiac_aortic", "heart.normal", points)).toBeNull();
    expect(listenedKeyOnPlay(true, null, "heart.normal", points)).toBeNull();
    expect(listenedKeyOnPlay(true, "lung_left", "heart.normal", points)).toBeNull();
  });
});

describe("öğrenme tamamlanabilirliği", () => {
  it("her kütüphane öğesinin ilk örneğinde çalınabilir ses noktası var (kilit açılabilir olmalı)", () => {
    for (const group of LIBRARY_GROUPS) {
      for (const item of group.items) {
        const [first] = learnExamples(item.key);
        expect(first, `${item.key}: örnek yok`).toBeDefined();
        if (!first) continue;
        const points = examplePointIds(
          first,
          item.category,
          (pointId) => resolveLibrarySoundEx(item.category, item.acousticFinding, pointId).record !== null,
        );
        expect(points.length, `${item.key}: çalınabilir ses noktası yok`).toBeGreaterThan(0);
      }
    }
  });
});

const FULL = JSON.stringify(
  Object.fromEntries(
    LIBRARY_ITEM_KEYS.flatMap((key) => learnExamples(key).map((_, index) => [exampleKey(key, index), LEARN_EXAMPLE_SECONDS])),
  ),
);

function listenFully(tracker: ReturnType<typeof createLearnTracker>, key: string): void {
  for (let index = 0; index < learnExamples(key).length; index += 1) {
    for (let ms = 0; ms < LEARN_EXAMPLE_SECONDS * 1000; ms += 250) tracker.addListen(key, index, 250);
  }
}

describe("createLearnTracker", () => {
  it("konu ancak TÜM örnekleri (gerçekler dahil) 5'er sn çalan sesle dinlenince tamamlanır; süre kalıcıdır", () => {
    const storage = memoryStorage();
    const exampleCount = (key: string) => (key === "heart.normal" ? 2 : 1);
    const tracker = createLearnTracker({ storage, exampleCount });
    expect(tracker.snapshot().lockText).toBe(learnLockText(0, LIBRARY_ITEM_COUNT));

    // Sentetik örnek tam dinlendi, gerçek örnek 4,75 sn: konu henüz bitmedi.
    for (let ms = 0; ms < 5_000; ms += 250) tracker.addListen("heart.normal", 0, 250);
    for (let ms = 0; ms < 4_750; ms += 250) tracker.addListen("heart.normal", 1, 250);
    expect(tracker.snapshot().listenedCount).toBe(0);
    expect(tracker.snapshot().seconds.get(exampleKey("heart.normal", 1))).toBeCloseTo(4.75, 5);

    tracker.addListen("heart.normal", 1, 250);
    expect(tracker.snapshot().listenedCount).toBe(1);
    expect(tracker.snapshot().progressText).toBe(learnProgressText(1, LIBRARY_ITEM_COUNT));
    expect(JSON.parse(storage.entries.get(LEARN_LISTENED_KEY) ?? "{}")).toEqual({
      [exampleKey("heart.normal", 0)]: LEARN_EXAMPLE_SECONDS,
      [exampleKey("heart.normal", 1)]: LEARN_EXAMPLE_SECONDS,
    });

    // Var olmayan örnek sırası sayılmaz.
    tracker.addListen("heart.s3", 5, 10_000);
    expect(tracker.snapshot().seconds.has(exampleKey("heart.s3", 5))).toBe(false);

    const reopened = createLearnTracker({ storage, exampleCount });
    expect(reopened.snapshot().listened.has("heart.normal")).toBe(true);
  });

  it("tıklama sayılmaz: çalmayan seçim süre eklemez, sıfır/negatif süre yok sayılır", () => {
    const tracker = createLearnTracker({ storage: memoryStorage() });
    expect(listenedKeyOnPlay(false, "cardiac_aortic", "heart.normal", ["cardiac_aortic"])).toBeNull();
    tracker.addListen("heart.normal", 0, 0);
    tracker.addListen("heart.normal", 0, -500);
    expect(tracker.snapshot().seconds.size).toBe(0);
  });

  it("bozuk kayıt boş sayılır; bilinmeyen anahtar yok sayılır", () => {
    const storage = memoryStorage({ [LEARN_LISTENED_KEY]: "{bozuk" });
    const tracker = createLearnTracker({ storage });
    expect(tracker.snapshot().listenedCount).toBe(0);
    listenFully(tracker, "bilinmeyen.ses");
    expect(tracker.snapshot().listenedCount).toBe(0);
    expect(storage.entries.get(LEARN_LISTENED_KEY)).toBe("{bozuk");
  });

  it("yerel küme tamamlanınca complete olur ve markComplete bir kez doğru sürümle çağrılır", () => {
    const calls: string[] = [];
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: learnPort(false, calls) });
    for (const key of LIBRARY_ITEM_KEYS) listenFully(tracker, key);
    expect(tracker.snapshot().localComplete).toBe(true);
    expect(tracker.snapshot().complete).toBe(true);
    expect(calls).toEqual([AUSCULTA_CONTENT_VERSION]);
    tracker.addListen(LIBRARY_ITEM_KEYS[0] ?? "", 0, 250);
    tracker.notify();
    expect(calls).toEqual([AUSCULTA_CONTENT_VERSION]);
  });

  it("açılışta küme zaten tamamsa notify kaydı tazeler (bir kez)", () => {
    const calls: string[] = [];
    const storage = memoryStorage({ [LEARN_LISTENED_KEY]: FULL });
    const tracker = createLearnTracker({ storage, learn: learnPort(false, calls) });
    tracker.notify();
    tracker.notify();
    expect(calls).toEqual([AUSCULTA_CONTENT_VERSION]);
  });

  it("host complete ise yerel küme boşken de açıktır", () => {
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: learnPort(true) });
    expect(tracker.snapshot().hostComplete).toBe(true);
    expect(tracker.snapshot().listenedCount).toBe(0);
    expect(tracker.snapshot().complete).toBe(true);
  });

  it("markComplete hatası yutulur; kilit yerel tamamlanmaya göre açılır", async () => {
    const failing: SimLearnPort = {
      complete: false,
      async markComplete(): Promise<void> {
        throw new Error("ağ hatası");
      },
    };
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: failing });
    for (const key of LIBRARY_ITEM_KEYS) listenFully(tracker, key);
    expect(tracker.snapshot().complete).toBe(true);
    await Promise.resolve();
  });
});

describe("createLearnCompletionNotifier", () => {
  it("yalnız tamamlanmada ve bir kez çağırır", () => {
    const calls: string[] = [];
    const notifier = createLearnCompletionNotifier(learnPort(false, calls), "lib-test");
    notifier.notify(false);
    expect(calls).toEqual([]);
    notifier.notify(true);
    notifier.notify(true);
    expect(calls).toEqual(["lib-test"]);
  });

});

describe("PatientStage oynatma tetikleyicisi", () => {
  const point: StagePoint = {
    id: "cardiac_aortic",
    view: "front",
    label: "Aort",
    color: "s1",
    tagSide: "left",
    x: 0.46,
    y: 0.27,
  };

  function timerEnv(): { env: StageEnv; fire: () => void } {
    const pending: Array<() => void> = [];
    return {
      env: {
        setTimeout: (handler) => {
          pending.push(handler);
          return pending.length;
        },
        clearTimeout: () => undefined,
        setInterval: () => 0,
        clearInterval: () => undefined,
        observeStage: () => () => undefined,
      },
      fire: () => {
        const queued = [...pending];
        pending.length = 0;
        for (const handler of queued) handler();
      },
    };
  }

  function engine(play: () => Promise<void>): StageAudio {
    return {
      play,
      replay: async () => undefined,
      stop: () => undefined,
      setVolume: () => undefined,
      getActive: () => null,
      ensureContext: async () => undefined,
    };
  }

  function bindings(env: StageEnv, audio: StageAudio, changes: Array<{ playing: boolean; pointId: string | null }>): StageSessionBindings {
    return {
      points: [point],
      bodyType: "erkek",
      view: "front",
      head: "bell",
      strict: false,
      env,
      engine: audio,
      soundFor: () => ({
        id: "s",
        category: "heart",
        acousticFinding: "normal",
        sourceDataset: "test",
        sourceFile: "x.wav",
        durationSec: 3,
        sampleRate: 44_100,
        channels: 1,
        peak: 1,
        rms: 0.1,
        recordedLocation: "test",
        anatomicalLocation: "aortic",
        simulationLocation: null,
        nativeFilter: "unspecified",
        gender: "unknown",
        runtimeUrl: "x.wav",
        validationStatus: "validated",
        issues: [],
      }),
      onVisit: () => undefined,
      onDwell: () => undefined,
      onListen: () => undefined,
      onPlayingChange: (playing, pointId) => changes.push({ playing, pointId }),
      onSnapped: () => undefined,
      onPlaying: () => undefined,
      onSpent: () => undefined,
      onAudioStatus: () => undefined,
      onPulse: () => undefined,
      getPos: () => ({ x: 0.5, y: 0.5 }),
      setPos: () => undefined,
      applyPos: () => undefined,
      measure: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    };
  }

  it("play başarıyla başlayınca playing=true bildirilir (dinlendi tetikleyicisi)", async () => {
    const changes: Array<{ playing: boolean; pointId: string | null }> = [];
    const { env, fire } = timerEnv();
    const session = createStageSession(bindings(env, engine(async () => undefined), changes));
    session.place("cardiac_aortic");
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(changes).toEqual([{ playing: true, pointId: "cardiac_aortic" }]);
    session.dispose();
  });

  it("play başarısızsa playing=false bildirilir (kayıt oluşmaz)", async () => {
    const changes: Array<{ playing: boolean; pointId: string | null }> = [];
    const { env, fire } = timerEnv();
    const session = createStageSession(bindings(env, engine(async () => {
      throw new Error("varlık yok");
    }), changes));
    session.place("cardiac_aortic");
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(changes).toEqual([{ playing: false, pointId: "cardiac_aortic" }]);
    session.dispose();
  });
});

describe("ModeSelectScreen öğrenme kilidi", () => {
  it("kilitliyken uygulama/değerlendirme kartları pasif ve ilerleme metni görünür", () => {
    const html = renderInGate(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).toContain("mode-card practice learn-locked");
    expect(html).toContain("mode-card assessment learn-locked");
    expect(html).toContain('data-learn-locked="true"');
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/24 ses dinlendi.");
    // T289: kilitli düğmede metnin önünde kilit simgesi (svg) bulunur.
    expect(html).toMatch(/disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?Önce öğrenme modunu tamamlayın/);
  });

  it("host complete ise yerel küme boşken de kartlar açıktır", () => {
    const html = renderInGate(createElement(ModeSelectScreen, { embedded: true }), { learn: learnPort(true) });
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(html).toContain("Değerlendirmeye gir");
    expect(html).not.toContain("mode-lock-hint");
  });

  it("yerel küme tamamsa kartlar açıktır", () => {
    const storage = memoryStorage({ [LEARN_LISTENED_KEY]: FULL });
    const html = renderInGate(createElement(ModeSelectScreen, { embedded: true }), { storage });
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
  });

  it("ziyaretçi kilidi önceliklidir: öğrenme kilidi metni çizilmez", () => {
    const html = renderInGate(createElement(ModeSelectScreen, { embedded: true }), { audience: "visitor" });
    expect(html).toContain('data-audience-locked="true"');
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Bu mod yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır.");
    expect(html).not.toContain("Önce öğrenme modunu tamamlayın");
  });
});

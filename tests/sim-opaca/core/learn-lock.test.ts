import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import type { SimLearnPort } from "../../../packages/sim-host/src/SimHost";
import {
  LEARN_VIEWED_KEY,
  LEARN_VIEW_SECONDS,
  LIBRARY_ITEM_COUNT,
  LIBRARY_ITEM_KEYS,
  LIBRARY_ITEMS,
  LearnGateProvider,
  ModeSelectScreen,
  OPACA_CONTENT_VERSION,
  StoreProvider,
  canStartMode,
  challengeLearnLockText,
  contentVersion,
  createLearnCompletionNotifier,
  createLearnTracker,
  createMemoryRuntimeAdapter,
  learnLockText,
  learnProgressText,
  libraryExampleCount,
  libraryExamples,
  exampleKey,
  parseViewed,
  zonesForImage,
} from "../../../packages/sim-opaca/src/index";
import type { LearnTracker, StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";
import { LEARN_EXAMPLE_LIMIT } from "../../../packages/sim-opaca/src/core/examples";
import { hasClinicalContext } from "../../../packages/sim-opaca/src/data/clinicalContext";
import { fakeSessions } from "../session-fixture";

/** T320: konunun film sayısı (öğrenme örnekleri). */
const filmCount = (key: string): number => libraryExamples(LIBRARY_ITEMS.find((item) => item.key === key)!).length;
const FULL_MS = LEARN_VIEW_SECONDS * 1000;

/** Tüm konuların tüm filmlerini eşik kadar inceler. */
function viewAll(tracker: LearnTracker): void {
  for (const key of LIBRARY_ITEM_KEYS) for (let index = 0; index < filmCount(key); index += 1) tracker.addView(key, index, FULL_MS);
}

/** Tüm filmleri incelenmiş kayıt (depo tohumu). */
function fullViewedRecord(): string {
  const out: Record<string, number> = {};
  for (const key of LIBRARY_ITEM_KEYS) for (let index = 0; index < filmCount(key); index += 1) out[exampleKey(key, index)] = LEARN_VIEW_SECONDS;
  return JSON.stringify(out);
}

/** T218 — öğrenme tamamlama tespiti ve mod kilidi: saf hesap + statik işaretleme.
 *  Ausculta T209 test kümesinin Opaca karşılığı. */

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

function renderModes(
  options: {
    storage?: StoragePort;
    learn?: SimLearnPort;
    audience?: "student" | "visitor";
    sessions?: boolean;
  } = {},
): string {
  const { storage = memoryStorage(), learn, audience, sessions = false } = options;
  const screen = createElement(ModeSelectScreen, {
    embedded: true,
    ...(audience === undefined ? {} : { audience }),
  });
  const tree = sessions
    ? createElement(EmbeddedProvider, { embedded: true, sessions: fakeSessions({ mode: "practice" }), children: screen })
    : screen;
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
      children: createElement(LearnGateProvider, {
        ...(learn === undefined ? {} : { learn }),
        children: tree,
      }),
    }),
  );
}

describe("contentVersion", () => {
  it("deterministik, sıra duyarlı ve sözleşme desenine uyar", () => {
    expect(contentVersion(["a", "b"])).toBe(contentVersion(["a", "b"]));
    expect(contentVersion(["a", "b"])).not.toBe(contentVersion(["b", "a"]));
    expect(contentVersion(["a", "b"])).toMatch(/^[a-z0-9._-]{1,40}$/);
    expect(OPACA_CONTENT_VERSION).toBe(contentVersion(LIBRARY_ITEM_KEYS));
    expect(OPACA_CONTENT_VERSION).toMatch(/^[a-z0-9._-]{1,40}$/);
  });
});

describe("parseViewed", () => {
  it("bozuk/eksik veri boş harita sayılır", () => {
    expect(parseViewed(null).size).toBe(0);
    expect(parseViewed("{bozuk").size).toBe(0);
    expect(parseViewed('["technique.systematic#0"]').size).toBe(0);
    expect(parseViewed("{}").size).toBe(0);
  });

  it("bilinmeyen konu/örnek ve geçersiz değerler yok sayılır; değer eşikle kırpılır", () => {
    const parsed = parseViewed(JSON.stringify({ "technique.systematic#0": 99, "technique.systematic#99": 5, "bilinmeyen#0": 5, "technique.systematic#1": "x" }));
    expect([...parsed.entries()]).toEqual([["technique.systematic#0", LEARN_VIEW_SECONDS]]);
  });
});

describe("learnLock metinleri", () => {
  it("ilerleme, kilit ve düello metinleri ilerlemeyi taşır", () => {
    expect(learnProgressText(3, 33)).toBe("Öğrenme: 3/33 konu incelendi");
    expect(learnLockText(3, 33)).toBe("Önce öğrenme modunu tamamlayın: 3/33 konu incelendi.");
    expect(challengeLearnLockText(0, 33)).toBe("Meydan okuma için önce öğrenme modunu tamamlayın: 0/33 konu incelendi.");
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

describe("öğrenme tamamlanabilirliği", () => {
  it("her kütüphane öğesi en az bir örnek filmle açılabilir (kilit açılabilir olmalı)", () => {
    expect(LIBRARY_ITEMS).toHaveLength(LIBRARY_ITEM_COUNT);
    for (const item of LIBRARY_ITEMS) {
      const examples = libraryExamples(item);
      expect(examples.length, `${item.key}: örnek film yok`).toBeGreaterThan(0);
      expect(examples[0]?.runtimeUrl, `${item.key}: görüntü adresi yok`).toBeTruthy();
      expect(libraryExampleCount(item), `${item.key}: sayaç`).toBeGreaterThan(0);
    }
  });

  it("T318: konu başına en çok 4 örnek; klinik kayıtlı görüntü varsa yalnız onlar gösterilir", () => {
    for (const item of LIBRARY_ITEMS) {
      const examples = libraryExamples(item);
      expect(examples.length, item.key).toBeLessThanOrEqual(LEARN_EXAMPLE_LIMIT);
      const withText = examples.filter((image) => hasClinicalContext(image.id)).length;
      expect([0, examples.length], `${item.key}: kayıtlı ve kayıtsız karışık`).toContain(withText);
    }
  });

  it("Lateral grafi konusu yalnız image-zones lateral setindeki üç grafiyi gösterir", () => {
    const topic = LIBRARY_ITEMS.find((item) => item.key === "technique.lateral");
    expect(topic).toBeDefined();
    if (!topic) return;
    const examples = libraryExamples(topic);
    expect(examples.map((image) => image.id)).toEqual(["commons_coin_lat", "commons_hiatal_lat", "commons_normal_lat"]);
    expect(libraryExampleCount(topic)).toBe(3);
  });

  it("Temel okuma konuları yalnız okuma bölgesi tanımlı görüntüleri gösterir ve sayar", () => {
    const topics = LIBRARY_ITEMS.filter((item) => item.group === "technique");
    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      const examples = libraryExamples(topic);
      expect(examples.length, `${topic.key}: örnek`).toBeGreaterThan(0);
      expect(examples.filter((image) => zonesForImage(image.id) === null).map((image) => image.id), topic.key).toEqual([]);
    }
    const projection = topics.find((item) => item.key === "technique.projection");
    const projectionIds = projection ? libraryExamples(projection).map((image) => image.id) : [];
    expect(projectionIds).not.toContain("commons_clavicle_fx");
  });
});

describe("createLearnTracker", () => {
  it("T320: konu, tüm filmleri eşik kadar incelenince tamamlanır; kayıt kalıcıdır", () => {
    const storage = memoryStorage();
    const tracker = createLearnTracker({ storage });
    const key = "technique.systematic";
    const films = filmCount(key);
    expect(films).toBeGreaterThan(1);
    expect(tracker.snapshot().openedCount).toBe(0);
    expect(tracker.snapshot().lockText).toBe(learnLockText(0, LIBRARY_ITEM_COUNT));

    // Eşiğin altında kalan süre ve tek film konuyu tamamlamaz.
    tracker.addView(key, 0, FULL_MS - 1000);
    expect(tracker.snapshot().openedCount).toBe(0);
    tracker.addView(key, 0, 1000);
    expect(tracker.snapshot().seconds.get(exampleKey(key, 0))).toBe(LEARN_VIEW_SECONDS);
    expect(tracker.snapshot().openedCount).toBe(0);

    for (let index = 1; index < films; index += 1) tracker.addView(key, index, FULL_MS);
    expect(tracker.snapshot().openedCount).toBe(1);
    expect(tracker.snapshot().progressText).toBe(learnProgressText(1, LIBRARY_ITEM_COUNT));
    expect(JSON.parse(storage.entries.get(LEARN_VIEWED_KEY) ?? "{}")[exampleKey(key, 0)]).toBe(LEARN_VIEW_SECONDS);

    // Aynı depoyla yeni mount (açılış) kaydı korur.
    const reopened = createLearnTracker({ storage });
    expect(reopened.snapshot().opened.has(key)).toBe(true);
  });

  it("bozuk kayıt boş sayılır; bilinmeyen konu ve aralık dışı örnek yok sayılır", () => {
    const storage = memoryStorage({ [LEARN_VIEWED_KEY]: "{bozuk" });
    const tracker = createLearnTracker({ storage });
    tracker.addView("bilinmeyen.konu", 0, FULL_MS);
    tracker.addView("technique.systematic", 99, FULL_MS);
    tracker.addView("technique.systematic", 0, -5);
    expect(tracker.snapshot().seconds.size).toBe(0);
    expect(storage.entries.get(LEARN_VIEWED_KEY)).toBe("{bozuk");
  });

  it("tüm konular tamamlanınca complete olur ve markComplete bir kez doğru sürümle çağrılır", () => {
    const calls: string[] = [];
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: learnPort(false, calls) });
    viewAll(tracker);
    expect(tracker.snapshot().localComplete).toBe(true);
    expect(tracker.snapshot().complete).toBe(true);
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
    // Fazladan inceleme/notify yeni çağrı üretmez.
    tracker.addView(LIBRARY_ITEM_KEYS[0] ?? "", 0, FULL_MS);
    tracker.notify();
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
  });

  it("açılışta kayıt zaten tamamsa notify kaydı tazeler (bir kez)", () => {
    const calls: string[] = [];
    const storage = memoryStorage({ [LEARN_VIEWED_KEY]: fullViewedRecord() });
    const tracker = createLearnTracker({ storage, learn: learnPort(false, calls) });
    tracker.notify();
    tracker.notify();
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
  });

  it("host complete ise yerel kayıt boşken de açıktır", () => {
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: learnPort(true) });
    expect(tracker.snapshot().hostComplete).toBe(true);
    expect(tracker.snapshot().openedCount).toBe(0);
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
    viewAll(tracker);
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

describe("ModeSelectScreen öğrenme kilidi", () => {
  it("kilitliyken uygulama/değerlendirme kartları pasif ve ilerleme metni görünür", () => {
    const html = renderModes({ sessions: true });
    expect(html).toContain("mode-card practice learn-locked");
    expect(html).toContain("mode-card assessment learn-locked");
    expect(html).toContain('data-learn-locked="true"');
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/33 konu incelendi.");
    // T320: öğrenme kartı tamamlama ölçütünü gösterir.
    expect(html).toContain("Tamamlama ölçütü");
    expect(html).toContain(`en az ${LEARN_VIEW_SECONDS} sn incelenince konu tamamlanır`);
    // T289: kilitli düğmede metnin önünde kilit simgesi (svg) bulunur.
    expect(html).toMatch(/disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?Önce öğrenme modunu tamamlayın/);
  });

  it("host complete ise yerel küme boşken de kartlar açıktır", () => {
    const html = renderModes({ learn: learnPort(true), sessions: true });
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(html).toContain("Değerlendirmeye gir");
    expect(html).not.toContain("mode-lock-hint");
  });

  it("yerel küme tamamsa kartlar açıktır", () => {
    const storage = memoryStorage({ [LEARN_VIEWED_KEY]: fullViewedRecord() });
    const html = renderModes({ storage, sessions: true });
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
  });

  it("ziyaretçi kilidi önceliklidir: öğrenme kilidi metni çizilmez", () => {
    const html = renderModes({ audience: "visitor" });
    expect(html).toContain('data-audience-locked="true"');
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Bu mod yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır.");
    expect(html).not.toContain("Önce öğrenme modunu tamamlayın");
  });
});

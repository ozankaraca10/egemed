import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import type { SimLearnPort } from "../../../packages/sim-host/src/SimHost";
import {
  LEARN_OPENED_KEY,
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
  parseOpened,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";
import { fakeSessions } from "../session-fixture";

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

describe("parseOpened", () => {
  it("bozuk/eksik veri boş küme sayılır", () => {
    expect(parseOpened(null).size).toBe(0);
    expect(parseOpened("{bozuk").size).toBe(0);
    expect(parseOpened('"technique.systematic"').size).toBe(0);
    expect(parseOpened("{}").size).toBe(0);
  });

  it("kütüphanede olmayan anahtarlar yok sayılır, geçerli olanlar tekilleşir", () => {
    const parsed = parseOpened('["technique.systematic","bilinmeyen","technique.systematic",3]');
    expect([...parsed]).toEqual(["technique.systematic"]);
  });
});

describe("learnLock metinleri", () => {
  it("ilerleme, kilit ve düello metinleri ilerlemeyi taşır", () => {
    expect(learnProgressText(3, 33)).toBe("Öğrenme: 3/33 konu açıldı");
    expect(learnLockText(3, 33)).toBe("Önce öğrenme modunu tamamlayın: 3/33 konu açıldı.");
    expect(challengeLearnLockText(0, 33)).toBe("Meydan okuma için önce öğrenme modunu tamamlayın: 0/33 konu açıldı.");
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
});

describe("createLearnTracker", () => {
  it("konu açma kaydı kalıcıdır; yalnız seçmek kaydı büyütmez", () => {
    const storage = memoryStorage();
    const tracker = createLearnTracker({ storage });
    expect(tracker.snapshot().openedCount).toBe(0);
    expect(tracker.snapshot().complete).toBe(false);
    expect(tracker.snapshot().lockText).toBe(learnLockText(0, LIBRARY_ITEM_COUNT));

    tracker.markOpened("technique.systematic");
    expect(tracker.snapshot().openedCount).toBe(1);
    expect(tracker.snapshot().progressText).toBe(learnProgressText(1, LIBRARY_ITEM_COUNT));
    expect(JSON.parse(storage.entries.get(LEARN_OPENED_KEY) ?? "[]")).toEqual(["technique.systematic"]);

    // Aynı depoyla yeni mount (açılış) kaydı korur.
    const reopened = createLearnTracker({ storage });
    expect(reopened.snapshot().openedCount).toBe(1);
    expect(reopened.snapshot().opened.has("technique.systematic")).toBe(true);
  });

  it("bozuk kayıt boş küme sayılır; bilinmeyen anahtar yok sayılır", () => {
    const storage = memoryStorage({ [LEARN_OPENED_KEY]: "{bozuk" });
    const tracker = createLearnTracker({ storage });
    expect(tracker.snapshot().openedCount).toBe(0);
    tracker.markOpened("bilinmeyen.konu");
    expect(tracker.snapshot().openedCount).toBe(0);
    expect(storage.entries.get(LEARN_OPENED_KEY)).toBe("{bozuk");
  });

  it("yerel küme tamamlanınca complete olur ve markComplete bir kez doğru sürümle çağrılır", () => {
    const calls: string[] = [];
    const tracker = createLearnTracker({ storage: memoryStorage(), learn: learnPort(false, calls) });
    for (const key of LIBRARY_ITEM_KEYS) tracker.markOpened(key);
    expect(tracker.snapshot().localComplete).toBe(true);
    expect(tracker.snapshot().complete).toBe(true);
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
    // Fazladan markOpened/notify yeni çağrı üretmez.
    tracker.markOpened(LIBRARY_ITEM_KEYS[0] ?? "");
    tracker.notify();
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
  });

  it("açılışta küme zaten tamamsa notify kaydı tazeler (bir kez)", () => {
    const calls: string[] = [];
    const storage = memoryStorage({ [LEARN_OPENED_KEY]: JSON.stringify(LIBRARY_ITEM_KEYS) });
    const tracker = createLearnTracker({ storage, learn: learnPort(false, calls) });
    tracker.notify();
    tracker.notify();
    expect(calls).toEqual([OPACA_CONTENT_VERSION]);
  });

  it("host complete ise yerel küme boşken de açıktır", () => {
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
    for (const key of LIBRARY_ITEM_KEYS) tracker.markOpened(key);
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
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/33 konu açıldı.");
    expect(html).toMatch(/disabled=""[^>]*>Öğrenmeye git/);
  });

  it("host complete ise yerel küme boşken de kartlar açıktır", () => {
    const html = renderModes({ learn: learnPort(true), sessions: true });
    expect(html).toContain('data-learn-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(html).toContain("Değerlendirmeye gir");
    expect(html).not.toContain("mode-lock-hint");
  });

  it("yerel küme tamamsa kartlar açıktır", () => {
    const storage = memoryStorage({ [LEARN_OPENED_KEY]: JSON.stringify(LIBRARY_ITEM_KEYS) });
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

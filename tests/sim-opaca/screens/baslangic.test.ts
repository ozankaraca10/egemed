import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import { FS_PROMPT_KEY, ModeSelectScreen, StoreProvider, TutorialScreen, createMemoryRuntimeAdapter, loadFsPromptDone, saveFsPromptDone } from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";
import { fakeSessions } from "../session-fixture";

/** Başlangıç ekranları — E2 §8 S13 kabulü (statik render): başlangıç CTA'ları, üç mod kartı
 *  (Öğrenme · Uygulama · Değerlendirme tonları), kilitli öneri kartı, öğretici adımları,
 *  fsPromptDone depo davranışı (bellek StoragePort). */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(seed: Record<string, string> = {}): StoragePort {
  const entries = new Map(Object.entries(seed));
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

function renderInStore(node: ReactNode, storage: StoragePort = memoryStorage(), withSessions = false): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: withSessions
        ? createElement(EmbeddedProvider, { embedded: true, sessions: fakeSessions({ mode: "practice" }), children: node })
        : node,
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    })
  );
}

describe("ModeSelectScreen (statik render)", () => {

  it("T218: öğrenme tamamlanmadan uygulama/değerlendirme kartları kilitlidir (gönderim kilidi)", () => {
    const html = renderInStore(createElement(ModeSelectScreen), memoryStorage(), true);
    expect(html).toContain('data-learn-locked="true"');
    expect(html).toContain("mode-lock-hint");
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/33 konu incelendi.");
    expect(html).toContain("Önce öğrenme modunu tamamlayın");
    expect(html).toMatch(/disabled=""[^>]*>Önce öğrenme modunu tamamlayın/);
    expect(html).not.toContain("Bu ayın ödülü");
  });

  it("gömülü modda SCORM ifadesi yoktur (ADR-006, T137)", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("SCORM");
    expect(html).toContain("Puan kaydedilir");
    expect(html).not.toContain("LMS");
  });
});

describe("TutorialScreen (statik render)", () => {
  it("üç öğretici adımını ve film görüntüleyiciyi çizer", () => {
    const html = renderInStore(createElement(TutorialScreen));
    expect(html).toContain("Nasıl kullanılır?");
    expect(html).toContain("Filmi yakınlaştırın");
    expect(html).toContain("Pencereyi değiştirin");
    expect(html).toContain("Film üzerine işaret koyun");
    expect(html).toContain("Öğretici film görüntüleyici");
    expect(html).toContain("Tekrar gösterme");
    expect(html).toContain("Atla");
  });
});

describe("fsPromptDone deposu (StoragePort)", () => {
  it("opaca.fsPromptDone anahtarı bellek deposunda okunur/yazılır", () => {
    const storage = memoryStorage();
    expect(FS_PROMPT_KEY).toBe("opaca.fsPromptDone");
    expect(loadFsPromptDone(storage)).toBe(false);
    saveFsPromptDone(storage);
    expect(storage.get(FS_PROMPT_KEY)).toBe("1");
    expect(loadFsPromptDone(storage)).toBe(true);
  });

  it("erişim engelinde sessizce yutulur", () => {
    const broken: StoragePort = {
      get() {
        throw new Error("erişim engelli");
      },
      set() {
        throw new Error("erişim engelli");
      },
    };
    expect(loadFsPromptDone(broken)).toBe(false);
    expect(() => saveFsPromptDone(broken)).not.toThrow();
  });
});

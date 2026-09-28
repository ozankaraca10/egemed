import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import {
  FS_PROMPT_KEY,
  ModeSelectScreen,
  StartScreen,
  StoreProvider,
  TutorialScreen,
  createMemoryRuntimeAdapter,
  loadFsPromptDone,
  saveFsPromptDone,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";
import { fakeSessions } from "../session-fixture";

/** Başlangıç ekranları — E2 §8 S13 kabulü (statik render): başlangıç CTA'ları, üç mod kartı
 *  (İnceleme/Öğrenme · Uygulama · Değerlendirme tonları), kilitli öneri kartı, öğretici adımları,
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

describe("StartScreen (statik render)", () => {
  it("başlangıç CTA'ları ve güven kutularını çizer", () => {
    const html = renderInStore(createElement(StartScreen));
    expect(html).toContain("Simülatörü başlat");
    expect(html).toContain("Nasıl kullanılır?");
    expect(html).toContain("Hakkında ve kaynaklar");
    expect(html).toContain("Neden güvenilir?");
    expect(html).toContain("radyolojik görüntü");
    expect(html).toContain('<footer class="eg-footer">');
    expect(html).toContain('src="/sims/opaca/brand/logo-horizontal-web.png"');
    expect(html).toContain("SCORM uyumlu ölçme ve değerlendirme");
  });

  it("gömülü modda footer çizilmez ve SCORM ifadesi kaldırılır", () => {
    const html = renderInStore(createElement(StartScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("SCORM");
    expect(html).toContain("ölçme ve değerlendirme");
  });
});

describe("ModeSelectScreen (statik render)", () => {
  it("üç mod kartını İnceleme/Uygulama/Değerlendirme tonlarıyla çizer", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    expect(html).toContain('class="mode-card learn"');
    expect(html).toContain('class="mode-card practice');
    expect(html).toContain('class="mode-card assessment');
    expect(html).toContain("Öğrenme Modu");
    expect(html).toContain("Uygulama Modu");
    expect(html).toContain("Değerlendirme Modu");
    expect(html).toContain("Öğrenmeye başla");
    expect(html).toContain("Önce öğrenme modunda okuma sırasını oturtmanız önerilir.");
  });

  it("T218: öğrenme tamamlanmadan uygulama/değerlendirme kartları kilitlidir (gönderim kilidi)", () => {
    const html = renderInStore(createElement(ModeSelectScreen), memoryStorage(), true);
    expect(html).toContain('data-learn-locked="true"');
    expect(html).toContain("mode-lock-hint");
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/33 konu açıldı.");
    expect(html).toContain("Öğrenmeye git");
    expect(html).toMatch(/disabled=""[^>]*>Öğrenmeye git/);
    expect(html).not.toContain("Bu ayın ödülü");
  });

  it("A2.3: oturum kanalı yokken uygulama/değerlendirme kartları pasiftir", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    const segments = html.split('class="mode-card ');
    expect(segments.find((segment) => segment.startsWith("practice")) ?? "").toContain('disabled=""');
    expect(segments.find((segment) => segment.startsWith("assessment")) ?? "").toContain('disabled=""');
  });

  it("oyunlaştırma bayrağı açıkken ayın ödülü satırı çizilir", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { gamiEnabled: true }));
    expect(html).toContain("Bu ayın ödülü");
    expect(html).toContain("gün kaldı");
  });

  it("gömülü modda footer ve arka plan dekorasyonu çizilmez", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
  });

  it("gömülü modda SCORM ifadesi yoktur (ADR-006, T137)", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("SCORM");
    expect(html).toContain("Puan kaydedilir");
    expect(html).not.toContain("LMS");
  });

  it("gömülü olmayan modda SCORM puanı maddesi görünür", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    expect(html).toContain("SCORM puanı");
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

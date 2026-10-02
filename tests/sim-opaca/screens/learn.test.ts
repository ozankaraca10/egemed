import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "../../../packages/sim-opaca/src/EmbeddedContext";
import { LIBRARY_GROUPS, LIBRARY_ITEMS, LearnGateProvider, LearnScreen, StoreProvider, createMemoryRuntimeAdapter, createNoopLearnScreenEnv } from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";

/** Öğrenme ekranı — E2 §8 S14 kabulü (statik render): konu listesi, ABCDE okuma rehberi,
 *  film paneli, erişilebilir başlıklar; sentetik konu/görüntü fixture'ı; T218 öğrenme kilidi
 *  işaretleri (ilerleme, grup sayacı, açıldı). */

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

function renderInStore(node: ReactNode, storage: StoragePort = memoryStorage()): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(LearnGateProvider, { children: node }),
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
}

/** Sentetik konu: varsayılan seçili kütüphane öğesi (gerçek JSON toplu okunmaz). */
const sampleTopic = LIBRARY_ITEMS[0];

/** renderToStaticMarkup metni HTML kaçışlı üretir (ör. ' → &#x27;); beklenen metni aynı biçime çevirir. */
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("LearnScreen (statik render)", () => {
  it("kütüphane konu listesini ve erişilebilir başlıkları çizer", () => {
    const html = renderInStore(createElement(LearnScreen));
    expect(html).toContain('aria-label="Öğrenme kütüphanesi"');
    expect(html).toContain("<h2");
    expect(html).toContain("Konular · 0/33");
    // T318 sağ çerçeve: hasta kartı kayıt durumunu metinle bildirir (renk dışında işaret).
    expect(html).toContain('aria-label="Hasta kartı ve konu bilgisi"');
    expect(html).toContain("Klinik kayıt");
    expect(html).toMatch(/Gerçek hasta verisi|Kayıt yok/);
    expect(sampleTopic).toBeDefined();
    expect(html).toContain(sampleTopic!.short);
    expect(html).toContain(esc(sampleTopic!.title));
    for (const g of LIBRARY_GROUPS) {
      expect(html).toContain(esc(g.title));
    }
  });

  it("varsayılan kaydırma sınırıyla kütüphaneyi çizer", () => {
    const env = createNoopLearnScreenEnv();
    const html = renderInStore(createElement(LearnScreen, { env }));
    expect(html).toContain("learn-grid");
  });

  it("T218: düello bağlamında kilitliyken öğrenme ekranı bilgi notu gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(StoreProvider, {
        children: createElement(LearnGateProvider, {
          children: createElement(EmbeddedProvider, {
            embedded: true,
            challengeId: "11111111-1111-4111-8111-111111111111",
            children: createElement(LearnScreen),
          }),
        }),
        env: inertWindow,
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage: memoryStorage(),
      }),
    );
    expect(html).toContain("Meydan okuma için önce öğrenme modunu tamamlayın: 0/33 konu incelendi.");
  });
});

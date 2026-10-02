import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider, LearnGateProvider, LearnScreen, StoreProvider, createMemoryRuntimeAdapter, createNoopLearnAudio, createNoopLearnScreenEnv, initialState } from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Öğrenme ekranı — statik işaretleme. DOM kütüphanesi yok. */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

const storage: StoragePort = {
  get: () => null,
  set: () => undefined,
};

/** renderToStaticMarkup kesme işaretini &#x27; yazar; beklenen metin aynı biçime çevrilir. */
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function renderInStore(
  node: ReactNode,
  learnFocusKey: string | null = null,
  seedStorage: StoragePort = storage,
): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(LearnGateProvider, { children: node }),
      env: inertWindow,
      initialState: { ...initialState, learnFocusKey },
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage: seedStorage,
    }),
  );
}

describe("LearnScreen", () => {

  it("varsayılan kaydırma ve ses sınırlarıyla kütüphaneyi çizer", () => {
    const env = createNoopLearnScreenEnv();
    const audio = createNoopLearnAudio();
    const html = renderInStore(createElement(LearnScreen, { env, audio }));
    expect(html).toContain("learn-grid");
  });

  it("ziyaretçi kitlesinde açık olmayan öğeler kilit ikonuyla işaretlenir (T174)", () => {
    const html = renderInStore(
      createElement(EmbeddedProvider, { embedded: true, audience: "visitor", children: createElement(LearnScreen) }),
    );
    // heart.s4 kataloğun açık öğelerinden değildir; kilitli görünmeli (kilit ikonu + soluk stil).
    expect(html).toContain("lib-item locked");
    expect(html).toContain(esc("Tüm içerik yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır."));
  });

  it("T307/T308: akciğer öğesinde sentetik + 3 gerçek örnek ve örnek sayacı çizilir", () => {
    const html = renderInStore(createElement(LearnScreen), "lung.normal");
    expect(html).toContain('data-view="front"');
    expect(html).toContain("Örnekler 0/4 dinlendi · bu örnek 0/5 sn · yalnız ses çalarken sayılır");
    expect(html).toContain(">Sentetik<");
    expect(html.match(/Gerçek \d · \d+ bölge/g)).toHaveLength(3);
  });

  it("T307: kalp öğesinde posterior görünüm kapalı ve gerekçeli", () => {
    const html = renderInStore(createElement(LearnScreen), "heart.s3");
    expect(html).toContain('data-view="front"');
    expect(html).toContain("Posterior görünüm kapalı");
    expect(html).toContain("Bu vakada dinlenecek posterior bölge yok");
  });

  it("T233: karma öğede iki görünüm de açık", () => {
    const html = renderInStore(createElement(LearnScreen), "mixed.msm_wheezing");
    expect(html).toContain('data-view="front"');
    expect(html).not.toContain("görünüm kapalı");
    expect(html).not.toContain('aria-disabled="true"');
  });
});

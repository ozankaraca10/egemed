import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EmbeddedProvider,
  LEARN_LISTENED_KEY,
  LearnGateProvider,
  LearnScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
  createNoopLearnAudio,
  createNoopLearnScreenEnv,
  initialState,
  libraryTitle,
} from "../../packages/sim-ausculta/src/index";
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

function memoryStorage(seed: Record<string, string> = {}): StoragePort {
  const entries = new Map(Object.entries(seed));
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

/** renderToStaticMarkup kesme işaretini &#x27; yazar; beklenen metin aynı biçime çevrilir. */
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const EARLY_SYSTOLIC =
  "Erken sistolik üfürüm, S1'den hemen sonra başlayıp sistolün ilk yarısında söner.";

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
  it("kalp kütüphanesini, açıklamayı ve sahneyi çizer", () => {
    const html = renderInStore(createElement(LearnScreen));
    expect(html).toContain("learn-grid");
    expect(html).toContain("<h2");
    expect(html).toContain("Kalp Sesleri");
    expect(html).toContain("Dinle, tanı, öğren.");
    expect(html).toContain("Normal S1–S2");
    expect(html).toContain(esc(libraryTitle("heart.normal")));
    expect(html).toContain("Açıklama");
    expect(html).toContain("Dalga Formu");
    expect(html).toContain("Klinik Bilgi");
    expect(html).toContain("Pediatrik referans");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("stage-card");
    expect(html).toContain("<footer");
    expect(html).not.toContain("<header");
    expect(html).toContain("min-width:44px");
    expect(html).not.toContain("DevPanel");
  });

  it("kesme işaretli açıklamayı HTML kaçışıyla karşılaştırır", () => {
    const html = renderInStore(createElement(LearnScreen), "heart.murmur.early_systolic");
    expect(html).toContain("Üfürüm");
    expect(html).toContain(esc(EARLY_SYSTOLIC));
    expect(html).not.toContain("S1'den");
  });

  it("gömülü modda footer ve arka plan çizilmez", () => {
    const html = renderInStore(createElement(LearnScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
    expect(html).toContain("Dinle, tanı, öğren.");
  });

  it("kaydırma ve ses sınırları no-op ile güvenli çalışır", () => {
    const env = createNoopLearnScreenEnv();
    const audio = createNoopLearnAudio();
    expect(() => env.scrollActiveLibraryItem()).not.toThrow();
    expect(() => audio.stop()).not.toThrow();
    const html = renderInStore(createElement(LearnScreen, { env, audio }));
    expect(html).toContain("learn-grid");
  });

  it("öğrenme ilerlemesi, grup sayacı ve dinlendi işaretini gösterir (T209)", () => {
    const html = renderInStore(
      createElement(LearnScreen),
      null,
      memoryStorage({ [LEARN_LISTENED_KEY]: JSON.stringify(["heart.normal"]) }),
    );
    expect(html).toContain("Öğrenme: 1/20 ses dinlendi");
    expect(html).toContain("1/10");
    expect(html).toContain('aria-label="dinlendi"');
    expect(html).toContain("lib-item active listened");
  });

  it("ziyaretçi kitlesinde açık olmayan öğeler kilit ikonuyla işaretlenir (T174)", () => {
    const html = renderInStore(
      createElement(EmbeddedProvider, { embedded: true, audience: "visitor", children: createElement(LearnScreen) }),
    );
    // heart.s4 kataloğun açık öğelerinden değildir; kilitli görünmeli (kilit ikonu + soluk stil).
    expect(html).toContain("lib-item locked");
    expect(html).toContain(esc("Tüm içerik yalnızca Ege Üniversitesi Tıp Fakültesi öğrencilerine açıktır."));
  });

  it("T233: akciğer öğesinde sahne arkada ve Ön görünüm kapalı", () => {
    const html = renderInStore(createElement(LearnScreen), "lung.normal");
    expect(html).toContain('data-view="back"');
    expect(html).toContain("Ön görünüm kapalı");
    expect(html).toContain("Bu vakada dinlenecek ön bölge yok");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("view-locked");
  });

  it("T233: kalp öğesinde sahne önde ve Arka görünüm kapalı", () => {
    const html = renderInStore(createElement(LearnScreen), "heart.s3");
    expect(html).toContain('data-view="front"');
    expect(html).toContain("Arka görünüm kapalı");
    expect(html).toContain("Bu vakada dinlenecek arka bölge yok");
  });

  it("T233: karma öğede iki görünüm de açık", () => {
    const html = renderInStore(createElement(LearnScreen), "mixed.msm_wheezing");
    expect(html).toContain('data-view="front"');
    expect(html).not.toContain("görünüm kapalı");
    expect(html).not.toContain('aria-disabled="true"');
  });
});

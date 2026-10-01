import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  App,
  StoreProvider,
  createMemoryRuntimeAdapter,
  createNoopChromeEnv,
  initialState,
} from "../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-opaca/src/index";

/** Statik render kabulü — E2 §8 S19: gömülü App, Türkçe başlık, çift üst bar yok, iframe yok. */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

function renderApp(
  overrides: {
    embedded?: boolean;
    showDevPanel?: boolean;
    audience?: "student" | "faculty" | "visitor";
    gamiEnabled?: boolean;
    requestSignIn?: () => void;
  } = {},
): string {
  const embedded = overrides.embedded ?? true;
  const showDevPanel = overrides.showDevPanel ?? false;
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(App, {
        embedded,
        showDevPanel,
        chromeEnv: createNoopChromeEnv(),
        ...(overrides.audience === undefined ? {} : { audience: overrides.audience }),
        ...(overrides.gamiEnabled === undefined ? {} : { gamiEnabled: overrides.gamiEnabled }),
        ...(overrides.requestSignIn === undefined ? {} : { requestSignIn: overrides.requestSignIn }),
      }),
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    }),
  );
}

describe("Opaca App (statik render)", () => {
  it("gömülü varsayılan modda bağımsız üst bar çizilmez; tanıtım atlanıp mod seçimi açılır", () => {
    const html = renderApp();
    expect(html).not.toContain('<header class="eg-header">');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Simülatörü başlat");
    expect(html).toContain("Çalışma Modunu Seçin");
    expect(html).toContain('<h2 class="mode-title eg-gami-journey-title"');
    expect(html).not.toContain('<h1 class="mode-title">');
    expect(html).toContain('class="mode-card learn ');
    expect(html).toContain('class="eg-sim-opaca app-shell"');
  });

  it("gömülü App ağacında h1 çizilmez (kabuk çubuğu sayfanın tek h1ini taşır)", () => {
    const html = renderApp();
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(0);
  });

  it("bağımsız modda tek üst bar ve footer çizilir", () => {
    const html = renderApp({ embedded: false });
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain('<header class="eg-header">');
    expect(html).toContain('<footer class="eg-footer">');
    expect(html).toContain("Radyolojik Görüntüleme Simülatörü");
    expect(html).toContain('<h1 class="hero-title">');
  });

  it("DevPanel yalnız açıkça istendiğinde çizilir", () => {
    expect(renderApp()).not.toContain("dev-panel");
    const html = renderApp({ showDevPanel: true });
    expect(html).toContain('class="dev-panel"');
    expect(html).toContain("Olay günlüğü");
  });
});

/** T175: kitle (öğrenci/öğretim üyesi/ziyaretçi) statik render kabulü. */
describe("Opaca App — kitle (T175)", () => {
  it("öğrenci (varsayılan): uygulama/değerlendirme açık, ziyaretçi şeridi ve öğretim üyesi notu yok", () => {
    const html = renderApp({ gamiEnabled: true });
    expect(html).not.toContain("visitor-banner");
    expect(html).not.toContain("Öğretim üyesi görünümü");
    expect(html).toContain('data-audience-locked="false"');
    expect(html).not.toContain('data-audience-locked="true"');
  });

  it("öğretim üyesi: tüm kartlar açık, nötr not görünür, oyunlaştırma yüzeyleri gizli", () => {
    const html = renderApp({ audience: "faculty", gamiEnabled: true });
    expect(html).toContain("Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.");
    expect(html).not.toContain('data-audience-locked="true"');
    expect(html).not.toContain("Başarılarım");
    expect(html).not.toContain("Bu ayın ödülü");
  });

  it("ziyaretçi: uygulama/değerlendirme kilitli, şerit görünür, oyunlaştırma gizli", () => {
    const html = renderApp({ audience: "visitor", gamiEnabled: true, requestSignIn: () => undefined });
    expect(html).toContain("visitor-banner");
    expect(html).toContain("Ziyaretçi modu");
    expect(html).toContain("Öğrenci girişi");
    // T289: uygulama, değerlendirme ve 4. mod Meydan Okuma ziyaretçide kilitli.
    expect(html.match(/data-audience-locked="true"/g) ?? []).toHaveLength(3);
    expect(html).not.toContain("Başarılarım");
    expect(html).not.toContain("Bu ayın ödülü");
  });

  it("ziyaretçi mod kartlarında uygulama/değerlendirme kilit sınıfı taşır", () => {
    const html = renderApp({ audience: "visitor" });
    expect(html).toContain('class="mode-card practice audience-locked ');
    expect(html).toContain('class="mode-card assessment audience-locked ');
  });

  it("ziyaretçi Öğrenme ekranında ilk kategori + 2 bulgu açık; diğerleri kilit rozetiyle işaretli", () => {
    const html = renderToStaticMarkup(
      createElement(StoreProvider, {
        children: createElement(App, { embedded: true, audience: "visitor", chromeEnv: createNoopChromeEnv() }),
        env: inertWindow,
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage: memoryStorage(),
        initialState: { ...initialState, screen: "learn" },
      }),
    );
    // technique.systematic (ilk konu, varsayılan seçili) açık, kilit rozeti taşımaz.
    expect(html).not.toMatch(/lib-item active locked/);
    // LIBRARY_ITEMS toplamı 33 (library.json); 6 öğe açık (ilk kategori + 2 bulgu), kalan 27 kilitli.
    expect(html.match(/class="lib-item [^"]*locked"/g)?.length).toBe(27);
  });
});

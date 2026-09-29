import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BrandMark,
  EcgDeco,
  Footer,
  Header,
  IconCheckCircle,
  IconHeart,
  StoreProvider,
  createMemoryRuntimeAdapter,
  createNoopChromeEnv,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";

/** Chrome grubu — E2 §8 S8 kabulü (statik render): bağımsız modda tek üst bar + footer;
 *  gömülü modda üst bar/footer yok, tek sim araç çubuğu; marka görsel yolu/alt metni;
 *  ikonlar dekoratif olarak `aria-hidden`. Kaynak `ui/chrome.tsx`/`ui/icons.tsx` portu. */

/** Etkisiz pencere sınırı: statik render'da React effect'leri koşmaz, provider yalnız sözleşmeyi arar. */
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

/** Chrome'u gerçek store bağlamında statik çizer (S7 provider'ı). */
function renderChrome(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      now: () => 0,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    })
  );
}

function renderStandalone(): string {
  return renderChrome(createElement(Fragment, null, createElement(Header), createElement(Footer)));
}

describe("Opaca chrome (statik render)", () => {
  it("bağımsız modda tek üst bar ve footer çizilir", () => {
    const html = renderStandalone();
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain('<header class="eg-header">');
    expect(html).toContain('<footer class="eg-footer">');
    expect(html).toContain("Radyolojik Görüntüleme Simülatörü");
    expect(html).toContain("EGEMED");
    expect(html).not.toContain("eg-sim-toolbar");
  });

  it("marka görselleri assetUrl ile çözümlenmiş yolla ve dekoratif boş alt metinle çizilir", () => {
    expect(renderToStaticMarkup(createElement(BrandMark, { size: 32 }))).toContain(
      'src="/sims/opaca/brand/logo-icon-white-web.png"'
    );
    const html = renderStandalone();
    expect(html).toContain('src="/sims/opaca/brand/logo-icon-white-web.png"');
    expect(html).toContain('src="/sims/opaca/brand/logo-icon-web.png"');
    expect(html.match(/alt=""/g)).toHaveLength(2);
  });

  it("ikonlar dekoratif olarak aria-hidden taşır; çağıran prop ile ezebilir", () => {
    const helpButton = /<button[^>]*aria-label="Yardım"[^>]*>(.*?)<\/button>/.exec(renderStandalone())?.[1] ?? "";
    expect(helpButton).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(createElement(IconHeart, {}))).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(createElement(IconCheckCircle, { "aria-hidden": false }))).toContain('aria-hidden="false"');
  });

  it("arka plan yıkaması bağımsız modda çizilir, gömülü modda çizilmez", () => {
    expect(renderToStaticMarkup(createElement(EcgDeco))).toContain('class="app-bg"');
    expect(renderToStaticMarkup(createElement(EcgDeco, { embedded: true }))).toBe("");
  });

  it("varsayılan pencere sınırı güvenli no-op'tur", () => {
    const env = createNoopChromeEnv();
    expect(env.fullscreenElement).toBeNull();
    expect(env.hasOpenModal()).toBe(false);
    expect(env.devBuild).toBe(false);
    expect(env.devQuery).toBe(false);
  });
});

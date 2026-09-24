import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  App,
  StoreProvider,
  createMemoryRuntimeAdapter,
  createNoopChromeEnv,
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

function renderApp(overrides: { embedded?: boolean; showDevPanel?: boolean } = {}): string {
  const embedded = overrides.embedded ?? true;
  const showDevPanel = overrides.showDevPanel ?? false;
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(App, { embedded, showDevPanel, chromeEnv: createNoopChromeEnv() }),
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    }),
  );
}

describe("Opaca App (statik render)", () => {
  it("gömülü varsayılan modda bağımsız üst bar çizilmez, Türkçe başlık ve iframe yoktur", () => {
    const html = renderApp();
    expect(html).not.toContain('<header class="eg-header">');
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Radyolojik görüntüyü sistematik okumayı gerçek verilerle öğrenin.");
    expect(html).toContain("Simülatörü başlat");
    expect(html).toContain('class="eg-sim-opaca app-shell"');
  });

  it("gömülü modda footer çizilmez", () => {
    const html = renderApp();
    expect(html).not.toContain('<footer class="eg-footer">');
  });

  it("bağımsız modda tek üst bar ve footer çizilir", () => {
    const html = renderApp({ embedded: false });
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain('<header class="eg-header">');
    expect(html).toContain('<footer class="eg-footer">');
    expect(html).toContain("Radyolojik Görüntüleme Simülatörü");
  });

  it("DevPanel yalnız açıkça istendiğinde çizilir", () => {
    expect(renderApp()).not.toContain("dev-panel");
    const html = renderApp({ showDevPanel: true });
    expect(html).toContain('class="dev-panel"');
    expect(html).toContain("Olay günlüğü");
  });
});

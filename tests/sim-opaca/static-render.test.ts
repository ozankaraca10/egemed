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

/** Statik render regresyonu — embedded başlık hiyerarşisi tek h1 kuralını bozmasın. */

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
  it("gömülü varsayılan modda ekran başlığı h2 olur", () => {
    const html = renderApp();
    expect(html).toContain('<h2 class="mode-title">');
    expect(html).not.toContain('<h1 class="mode-title">');
  });

  it("gömülü App ağacında h1 çizilmez (kabuk çubuğu sayfanın tek h1ini taşır)", () => {
    const html = renderApp();
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(0);
  });
});

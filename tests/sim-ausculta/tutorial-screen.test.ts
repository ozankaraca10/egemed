import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  StoreProvider,
  TutorialScreen,
  createMemoryRuntimeAdapter,
  initialState,
  tutorialProgress,
} from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Öğretici ekranı — statik işaretleme. DOM kütüphanesi yok. */

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

function renderInStore(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      initialState,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
}

describe("TutorialScreen", () => {
  it("üç adımı, atla ve tekrar gösterme kutusunu çizer", () => {
    const html = renderInStore(createElement(TutorialScreen));
    expect(html).toContain("Nasıl Kullanılır?");
    expect(html).toContain("Stetoskobu sürükleyin");
    expect(html).toContain("Bir odağa bırakın");
    expect(html).toContain("Bell veya Diyaframı değiştirin");
    expect(html).toContain("Tekrar gösterme");
    expect(html).toContain("Atla");
    expect(html).toContain("tut-highlight");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("<footer");
    expect(html).not.toContain("<header");
    expect(html).toContain("min-width:44px");
    expect(tutorialProgress([])).toEqual({ steps: [false, false, false], currentStep: 0, allDone: false });
  });

  it("gömülü modda footer ve arka plan çizilmez", () => {
    const html = renderInStore(createElement(TutorialScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
    expect(html).not.toContain("<header");
    expect(html).toContain("Stetoskobu sürükleyin");
  });
});

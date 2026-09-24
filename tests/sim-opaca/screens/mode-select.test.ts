import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BEST_SCORE_KEY,
  ModeSelectScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
  initialState,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";

/** Mod seçimi — platform terminolojisi (İnceleme / Uygulama / Değerlendirme). */

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

function renderInStore(node: ReactNode, storage: StoragePort = memoryStorage(), tutorialSeen = false): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      initialState: { ...initialState, tutorialSeen },
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
}

describe("ModeSelectScreen", () => {
  it("yeşil mod kartını İnceleme Modu olarak gösterir (kabuk terimiyle hizalı)", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    expect(html).toContain("İnceleme Modu");
    expect(html).not.toContain("Öğrenme Modu");
    expect(html).toContain("İncelemeye başla");
    expect(html).toContain("İncelemeye git");
    expect(html).toContain("inceleme modunda okuma sırasını");
    expect(html).not.toContain("öğrenme modunda");
  });

  it("öğretici görüldüyse öneri kilidi kalkar", () => {
    const html = renderInStore(createElement(ModeSelectScreen), memoryStorage(), true);
    expect(html).toContain('data-recommend-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(html).not.toContain("mode-lock-hint");
  });

  it("en iyi puanı depodan okur", () => {
    const storage = memoryStorage({ [BEST_SCORE_KEY]: JSON.stringify({ practice: 80, assessment: 0 }) });
    const html = renderInStore(createElement(ModeSelectScreen), storage, true);
    expect(html).toContain("En iyi puan:");
    expect(html).toContain(">80<");
  });
});

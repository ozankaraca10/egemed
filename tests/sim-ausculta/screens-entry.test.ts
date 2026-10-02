import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SimLearnPort } from "../../packages/sim-host/src/SimHost";
import { EntryScreens, LearnGateProvider, ModeSelectScreen, StartScreen, StoreProvider, createMemoryRuntimeAdapter, initialState, modeLearnLocked, modePickTarget, playVolumeCheckTone } from "../../packages/sim-ausculta/src/index";
import type { StoragePort, VolumeToneContext, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Giriş ve mod seçimi — statik işaretleme. DOM kütüphanesi yok. */

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

function renderInStore(
  node: ReactNode,
  storage: StoragePort = memoryStorage(),
  options: { tutorialSeen?: boolean; learn?: SimLearnPort } = {},
): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(LearnGateProvider, {
        ...(options.learn === undefined ? {} : { learn: options.learn }),
        children: node,
      }),
      env: inertWindow,
      initialState: { ...initialState, tutorialSeen: options.tutorialSeen ?? false },
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
}

describe("giriş çözümü", () => {

  it("öğrenme kilidi tamamlanmadan hedefi öğrenmeye çevirir", () => {
    expect(modeLearnLocked(false, true)).toBe(true);
    expect(modeLearnLocked(true, true)).toBe(false);
    expect(modeLearnLocked(false, false)).toBe(false);
    expect(modePickTarget("assessment", false, true)).toBe("learn");
    expect(modePickTarget("practice", true, true)).toBe("practice");
    expect(modePickTarget("learn", false, true)).toBe("learn");
  });
});

describe("StartScreen", () => {

  it("gömülü modda footer ve SCORM ifadesi yoktur", () => {
    const html = renderInStore(createElement(StartScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("SCORM");
    expect(html).toContain("ölçme ve değerlendirme");
  });

  it("platform girişinde tanıtım atlanır; tek üst bar kalır", () => {
    const html = renderInStore(createElement(EntryScreens, { embedded: true }));
    expect(html).not.toContain("Simülatörü başlat");
    expect(html).toContain("Çalışma Modunu Seçin");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
  });
});

describe("ModeSelectScreen", () => {
  it("üç mod kartını çizer; öğrenme tamamlanmadan uygulama/değerlendirme kilitlidir (T209)", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    expect(html).toContain('class="mode-card learn eg-gami-mode m-learn"');
    expect(html).toContain("mode-card practice learn-locked");
    expect(html).toContain("mode-card assessment learn-locked");
    expect(html).toContain('data-learn-locked="true"');
    expect(html).toContain("Öğrenmeye başla");
    expect(html).toContain("Önce öğrenme modunu tamamlayın");
    expect(html).toContain("mode-lock-hint");
    expect(html).toContain("Önce öğrenme modunu tamamlayın: 0/24 ses dinlendi.");
    expect(html).toContain("Henüz denenmedi");
    // Kilit gönderimi kapatır: düğme pasiftir.
    // T289: kilitli düğmede metnin önünde kilit simgesi (svg) bulunur.
    expect(html).toMatch(/disabled=""[^>]*>(?:<svg[\s\S]*?<\/svg>)?Önce öğrenme modunu tamamlayın/);
  });

  it("gömülü modda SCORM ifadesi yoktur (ADR-006, T134)", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("SCORM");
    expect(html).toContain("Puan kaydedilir");
  });
});

describe("ses düzeyi kontrol tonu", () => {
  it("440 Hz zarfı zamanlar", () => {
    const calls: string[] = [];
    const ctx: VolumeToneContext = {
      currentTime: 2,
      destination: { id: "out" },
      createOscillator: () => ({
        frequency: { value: 0 },
        type: "",
        connect: () => calls.push("osc-connect"),
        start: (time) => calls.push(`start:${time}`),
        stop: (time) => calls.push(`stop:${time}`),
      }),
      createGain: () => ({
        gain: {
          value: 0,
          setValueAtTime: (value, time) => calls.push(`set:${value}@${time}`),
          linearRampToValueAtTime: (value, time) => calls.push(`ramp:${value}@${time}`),
        },
        connect: (node) => calls.push(node === ctx.destination ? "to-out" : "to-node"),
      }),
    };
    playVolumeCheckTone(ctx);
    expect(calls).toContain("start:2");
    expect(calls).toContain("stop:2.85");
    expect(calls).toContain("ramp:0.2@2.05");
    expect(calls).toContain("to-out");
  });
});

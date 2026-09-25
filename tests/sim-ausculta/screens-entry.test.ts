import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BEST_SCORE_KEY,
  EntryScreens,
  ModeSelectScreen,
  StartScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
  initialState,
  modePickTarget,
  modeRecommendLocked,
  playVolumeCheckTone,
  resolveEntryScreen,
  sessionSeed,
} from "../../packages/sim-ausculta/src/index";
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

describe("giriş çözümü", () => {
  it("gömülü modda tanıtımı atlar ve mod seçimine gider", () => {
    expect(resolveEntryScreen("start", true)).toBe("modes");
    expect(resolveEntryScreen("start", false)).toBe("start");
    expect(resolveEntryScreen("modes", true)).toBe("modes");
    expect(resolveEntryScreen("tutorial", true)).toBe("tutorial");
  });

  it("tohum enjekte now değerinden türer", () => {
    expect(sessionSeed(1_728_000_000_000)).toBe((1_728_000_000_000 % 2147483647) | 0);
  });

  it("öneri kilidi gönderimi kapatmaz; hedef öğrenmedir", () => {
    expect(modeRecommendLocked(false, true)).toBe(true);
    expect(modeRecommendLocked(true, true)).toBe(false);
    expect(modeRecommendLocked(false, false)).toBe(false);
    expect(modePickTarget("assessment", false, true)).toBe("learn");
    expect(modePickTarget("practice", true, true)).toBe("practice");
    expect(modePickTarget("learn", false, true)).toBe("learn");
  });
});

describe("StartScreen", () => {
  it("CTA, güven kutuları ve footer çizer", () => {
    const html = renderInStore(createElement(StartScreen));
    expect(html).toContain("Simülatörü başlat");
    expect(html).toContain("Nasıl kullanılır?");
    expect(html).toContain("Hakkında ve kaynaklar");
    expect(html).toContain("Neden güvenilir?");
    expect(html).toContain("klinik kayıt");
    expect(html).toContain("SCORM uyumlu ölçme ve değerlendirme");
    expect(html).toContain("Ses düzeyi kontrol");
    expect(html).toContain('src="brand/logo-horizontal-web.png"');
    expect(html).toContain("<footer");
    expect(html).not.toContain("<header");
    expect(html).toContain("min-width:44px");
  });

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
  it("üç mod kartını ve öneri kilidini çizer", () => {
    const html = renderInStore(createElement(ModeSelectScreen));
    expect(html).toContain('class="mode-card learn"');
    expect(html).toContain("mode-card practice recommend-locked");
    expect(html).toContain("mode-card assessment recommend-locked");
    expect(html).toContain('data-recommend-locked="true"');
    expect(html).toContain("Öğrenmeye başla");
    expect(html).toContain("Öğrenmeye git");
    expect(html).toContain("mode-lock-hint");
    expect(html).toContain("Henüz denenmedi");
    expect(html).not.toMatch(/disabled=""[^>]*>Öğrenmeye git/);
  });

  it("öğretici görüldüyse kartlar açık kalır", () => {
    const html = renderInStore(createElement(ModeSelectScreen), memoryStorage(), true);
    expect(html).toContain('data-recommend-locked="false"');
    expect(html).toContain("Vakaları çöz");
    expect(html).toContain("Değerlendirmeye gir");
    expect(html).not.toContain("mode-lock-hint");
  });

  it("en iyi puanı StoragePort'tan okur", () => {
    const storage = memoryStorage({ [BEST_SCORE_KEY]: JSON.stringify({ practice: 80, assessment: 0 }) });
    const html = renderInStore(createElement(ModeSelectScreen), storage, true);
    expect(html).toContain("En iyi puan:");
    expect(html).toContain(">80<");
  });

  it("gömülü modda footer ve arka plan yoktur", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
  });

  it("gömülü modda SCORM ifadesi yoktur (ADR-006, T134)", () => {
    const html = renderInStore(createElement(ModeSelectScreen, { embedded: true }));
    expect(html).not.toContain("SCORM");
    expect(html).toContain("puan kaydedilir");
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

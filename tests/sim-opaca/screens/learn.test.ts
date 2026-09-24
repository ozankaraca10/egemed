import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_GROUPS,
  LIBRARY_ITEMS,
  LearnScreen,
  STEP_TITLES,
  StoreProvider,
  ZONES,
  createMemoryRuntimeAdapter,
  createNoopLearnScreenEnv,
} from "../../../packages/sim-opaca/src/index";
import type { ImageRecord, StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";

/** Öğrenme ekranı — E2 §8 S14 kabulü (statik render): konu listesi, ABCDE okuma rehberi,
 *  film paneli, erişilebilir başlıklar; sentetik konu/görüntü fixture'ı. */

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

function renderInStore(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    }),
  );
}

/** Sentetik konu: varsayılan seçili kütüphane öğesi (gerçek JSON toplu okunmaz). */
const sampleTopic = LIBRARY_ITEMS[0];

/** Sentetik görüntü kaydı — film paneli ve uzman işaretleme satırı için. */
const syntheticImage: ImageRecord = {
  id: "learn_fixture_xr",
  sourceDataset: "nih-cxr14",
  sourceFile: "fixture.png",
  viewPosition: "PA",
  ageYears: 62,
  sex: "M",
  population: "yetiskin",
  width: 1024,
  height: 1024,
  originalWidth: 1024,
  originalHeight: 1024,
  findings: { pneumothorax: "expert_bbox" },
  negatives: {},
  annotations: [{ finding: "pneumothorax", source: "expert_bbox", x: 0.6, y: 0.15, w: 0.12, h: 0.18 }],
  quality: null,
  runtimeUrl: "assets/xray/runtime/learn_fixture_xr.webp",
  bytes: 1,
  validationStatus: "validated",
  clinicalReview: "onayli",
  issues: [],
  modality: "XR",
};

/** renderToStaticMarkup metni HTML kaçışlı üretir (ör. ' → &#x27;); beklenen metni aynı biçime çevirir. */
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("LearnScreen (statik render)", () => {
  it("kütüphane konu listesini ve erişilebilir başlıkları çizer", () => {
    const html = renderInStore(createElement(LearnScreen));
    expect(html).toContain('aria-label="Öğrenme kütüphanesi"');
    expect(html).toContain("<h2");
    expect(html).toContain("Kütüphane");
    expect(html).toContain("Konu seçin, filmi okuyun.");
    expect(sampleTopic).toBeDefined();
    expect(html).toContain(sampleTopic!.short);
    expect(html).toContain(esc(sampleTopic!.title));
    for (const g of LIBRARY_GROUPS) {
      expect(html).toContain(esc(g.title));
    }
  });

  it("ABCDE sistematik okuma rehberi bölümlerini çizer", () => {
    const html = renderInStore(createElement(LearnScreen));
    expect(html).toContain('aria-label="Sistematik okuma bölgeleri"');
    expect(html).toContain("zone-step");
    for (const step of ["A", "B", "C", "D", "E"] as const) {
      const zonesForStep = ZONES.filter((z) => z.step === step);
      if (!zonesForStep.length) continue;
      expect(html).toContain(`<b>${step}</b>`);
      expect(html).toContain(STEP_TITLES[step]);
    }
  });

  it("film paneli, örnek navigasyonu ve konu kartını çizer", () => {
    const html = renderInStore(createElement(LearnScreen));
    expect(html).toContain('aria-label="Örnek filmler"');
    expect(html).toContain("film-card");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Açıklama");
    expect(html).toContain("Film bilgisi");
    expect(html).toContain("Klinik");
    expect(html).toContain("<h3");
    expect(html).toMatch(/Örnek \d+ \/ \d+|Örnek film yok/);
    expect(html).toMatch(/film-stage|film-empty-card/);
  });

  it("gömülü modda footer ve arka plan dekorasyonu çizilmez", () => {
    const html = renderInStore(createElement(LearnScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
  });

  it("kütüphane kaydırma env seam'i no-op ile güvenli çalışır", () => {
    const env = createNoopLearnScreenEnv();
    expect(() => env.scrollActiveLibraryItem()).not.toThrow();
    const html = renderInStore(createElement(LearnScreen, { env }));
    expect(html).toContain("learn-grid");
  });
});

describe("sentetik konu/görüntü fixture'ı", () => {
  it("kütüphane öğesi ve görüntü kaydı test şemasına uyar", () => {
    expect(sampleTopic?.key).toBeTruthy();
    expect(sampleTopic?.title).toBeTruthy();
    expect(syntheticImage.modality).toBe("XR");
    expect(syntheticImage.annotations[0]?.finding).toBe("pneumothorax");
  });
});

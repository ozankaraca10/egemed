import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SourcesScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";
import sourcesData from "../../../packages/sim-opaca/src/data/sources.json";

/** Kaynaklar ekranı — E2 §8 S18 kabulü (statik render): atıf/lisans satırları, veri seti listesi,
 *  erişilebilir başlıklar; kesme işaretleri HTML kaçışlı karşılaştırılır. */

const data = sourcesData as {
  module: { product: string; subtitle: string; developedBy: string; validationStatement: string };
  credits: { role: string; people: { name: string; url?: string }[] }[];
  datasets: { id: string; title: string; license: string; attributionText: string; licenseVerified?: boolean }[];
  disclaimer: string;
};

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

/** renderToStaticMarkup metni HTML kaçışlı üretir (ör. ' → &#x27;); beklenen metni aynı biçime çevirir. */
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("SourcesScreen (statik render)", () => {
  it("erişilebilir başlıkları ve bölüm yapısını çizer", () => {
    const html = renderInStore(createElement(SourcesScreen));
    expect(html).toContain("<h1");
    expect(html).toContain("EGEMED Opaca");
    expect(html).toContain("Hakkında");
    expect(html).toContain('aria-labelledby="credits-h"');
    expect(html).toContain('id="credits-h"');
    expect(html).toContain("Geliştiriciler");
    expect(html).toContain('aria-labelledby="inst-h"');
    expect(html).toContain("Kurum");
    expect(html).toContain('aria-labelledby="ds-h"');
    expect(html).toContain("Görüntü Veri Setleri");
    expect(html).toContain('aria-labelledby="disclaimer-h"');
    expect(html).toContain("Validasyon, sınırlılıklar ve sorumluluk");
    expect(html).toContain("← Geri");
  });

  it("öğretim üyesi ve validasyon kartlarını çizer", () => {
    const html = renderInStore(createElement(SourcesScreen));
    const linked = data.credits.flatMap((g) => g.people.filter((p) => p.url));
    expect(linked.length).toBeGreaterThan(0);
    for (const person of linked) {
      expect(html).toContain(esc(person.name));
      expect(html).toContain(esc(person.url!));
    }
    const placeholders = data.credits.flatMap((g) => g.people.filter((p) => !p.url));
    for (const person of placeholders) {
      expect(html).toContain(esc(person.name));
      expect(html).toContain("credit-person placeholder");
    }
    expect(html).toContain(esc(data.module.validationStatement));
    expect(html).toContain(esc(data.disclaimer));
    expect(html).toContain("brand/ege-tip-logo.png");
    expect(html).toContain(esc(data.module.developedBy));
  });

  it("veri seti listesini ve atıf/lisans satırlarını çizer", () => {
    const html = renderInStore(createElement(SourcesScreen));
    expect(data.datasets.length).toBeGreaterThan(0);
    for (const ds of data.datasets) {
      expect(html).toContain(esc(ds.title));
      expect(html).toContain(esc(ds.attributionText));
      expect(html).toContain(esc(ds.license));
      expect(html).toContain("film pakette");
    }
    const pending = data.datasets.filter((d) => d.licenseVerified === false);
    for (const ds of pending) {
      expect(html).toContain("lisans incelemede");
      expect(html).toContain(esc(ds.title));
    }
  });

  it("alt başlıktaki kesme işaretini HTML kaçışlı gösterir", () => {
    const html = renderInStore(createElement(SourcesScreen));
    expect(html).toContain(`${esc(data.module.subtitle)}&#x27;nü geliştiren`);
  });

  it("gömülü modda footer ve arka plan dekorasyonu çizilmez", () => {
    const html = renderInStore(createElement(SourcesScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
  });
});

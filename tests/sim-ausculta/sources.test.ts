import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SourcesScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
  initialState,
} from "../../packages/sim-ausculta/src/index";
import type { StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Kaynaklar ekranı — atıf, lisans ve validasyon metinleri kaynak JSON ile aynıdır. DOM kütüphanesi yok. */

const data = JSON.parse(readFileSync("packages/sim-ausculta/src/data/sources.json", "utf8")) as {
  module: {
    product: string;
    subtitle: string;
    developedBy: string;
    copyright: string;
    evidence: { statement: string; citation: string; doi: string; url: string };
    validation: { full: string; short: string };
  };
  credits: { role: string; people: { name: string; url?: string }[] }[];
  datasets: { id: string; title: string; license: string; attributionText: string; datasetDoi: string; usage?: string }[];
  assets: { id: string; title: string; license: string; attributionText: string; usage: string }[];
  inventory: { id: string; status: string; recordings: number; population: string }[];
  disclaimer: string;
};

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(): StoragePort & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function renderInStore(node: ReactNode, storage = memoryStorage()): { html: string; storage: StoragePort & { entries: Map<string, string> } } {
  const html = renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      initialState,
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
  return { html, storage };
}

describe("SourcesScreen", () => {
  it("bölüm başlıklarını ve geri düğmesini çizer", () => {
    const { html } = renderInStore(createElement(SourcesScreen));
    expect(html).toContain("<h1");
    expect(html).toContain("EGEMED Ausculta");
    expect(html).toContain("Hakkında");
    expect(html).toContain('aria-labelledby="credits-h"');
    expect(html).toContain("Geliştiriciler");
    expect(html).toContain('aria-labelledby="inst-h"');
    expect(html).toContain("Kurum");
    expect(html).toContain('aria-labelledby="ds-h"');
    expect(html).toContain("Ses Veri Setleri");
    expect(html).toContain('aria-labelledby="assets-h"');
    expect(html).toContain("Görsel Varlıklar");
    expect(html).toContain('aria-labelledby="disclaimer-h"');
    expect(html).toContain("Validasyon, sınırlılıklar ve sorumluluk");
    expect(html).toContain("← Geri");
    expect(html).toContain("min-width:44px");
    expect(html).toContain('src="brand/ege-tip-logo.png"');
    expect(html).toContain("<footer");
    expect(html).toContain(`${esc(data.module.subtitle)}&#x27;nü geliştiren`);
  });

  it("atıf, lisans ve validasyon metinlerini JSON ile aynı basar", () => {
    const { html } = renderInStore(createElement(SourcesScreen));
    expect(html).toContain(esc(data.module.validation.full));
    expect(html).toContain(esc(data.disclaimer));
    expect(html).toContain(esc(data.module.evidence.statement));
    expect(html).toContain(esc(data.module.evidence.citation));
    expect(html).toContain(`doi:${data.module.evidence.doi}`);
    expect(html).toContain(esc(data.module.developedBy));
    expect(html).toContain(esc(data.module.copyright));
    for (const dataset of data.datasets) {
      expect(html).toContain(esc(dataset.title));
      expect(html).toContain(esc(dataset.attributionText));
      expect(html).toContain(esc(dataset.license));
      expect(html).toContain(esc(dataset.datasetDoi));
    }
    for (const asset of data.assets) {
      expect(html).toContain(esc(asset.title));
      expect(html).toContain(esc(asset.attributionText));
      expect(html).toContain(esc(asset.license));
      expect(html).toContain(esc(asset.usage));
    }
    expect(html).toContain("ODC-BY 1.0");
    expect(html).toContain("CC0 1.0");
    expect(html).toContain("pakete dahil");
    expect(html).toContain("örnek kayıtlar");
    const bundled = data.inventory.find((item) => item.status === "bundled");
    const sample = data.inventory.find((item) => item.status !== "bundled");
    expect(html).toContain(`${(bundled?.recordings ?? 0).toLocaleString("tr-TR")} kayıt`);
    expect(html).toContain(`${(sample?.recordings ?? 0).toLocaleString("tr-TR")} kayıt`);
    expect(html).toContain("src/data/sources.json");
  });

  it("bağlantılı krediyi ve yalnız unvanlı yer tutucuyu çizer; öğrenci adı yazmaz", () => {
    const storage = memoryStorage();
    const { html } = renderInStore(createElement(SourcesScreen), storage);
    const linked = data.credits.flatMap((group) => group.people.filter((person) => person.url));
    expect(linked.length).toBeGreaterThan(0);
    for (const person of linked) {
      expect(html).toContain(esc(person.name));
      expect(html).toContain(esc(person.url ?? ""));
      expect(html).toContain("Ünisis profili");
    }
    expect(html).toContain("credit-person placeholder");
    expect(html).toContain("credit-avatar");
    expect(html).not.toMatch(/learner_name|learner_id|Öğrenci Adı|displayName/i);
    for (const value of storage.entries.values()) {
      expect(value).not.toMatch(/learner_name|learner_id|Öğrenci Adı|displayName/i);
    }
  });

  it("gömülü modda footer ve arka plan çizilmez", () => {
    const { html } = renderInStore(createElement(SourcesScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
    expect(html).toContain(esc(data.module.validation.full));
  });
});

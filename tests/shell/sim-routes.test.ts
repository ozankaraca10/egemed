import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellNow } from "../../apps/shell/src/now";
import { routeHref } from "../../apps/shell/src/routes";
import { SimRoute } from "../../apps/shell/src/SimRoute";
import { loadSimModule } from "../../apps/shell/src/sims/loaders";
import { createPlaceholderModule } from "../../apps/shell/src/sims/placeholder";
import { SIMULATOR_IDS, type SimMountTarget } from "../../packages/sim-host/src/SimHost";
import { opacaModule } from "../../packages/sim-opaca/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Yer tutucu modülün DOM yüzeyini karşılayan bellek içi sahte eleman. */
class FakeElement {
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  className = "";
  removed = 0;
  textContent = "";
  appendChild = (node: unknown): unknown => {
    this.children.push(node as FakeElement);
    return node;
  };
  remove = (): void => {
    this.removed += 1;
  };
  setAttribute = (name: string, value: string): void => {
    this.attributes[name] = value;
  };
}

describe("yer tutucu sim modülü", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("kökü hedefe ekler; metin ve geri dön bağlantısı i18n'den gelir", () => {
    vi.stubGlobal("document", { createElement: (): FakeElement => new FakeElement() });
    const appended: FakeElement[] = [];
    const target: SimMountTarget = {
      appendChild: (node) => {
        appended.push(node as FakeElement);
        return node;
      },
    };
    const module = createPlaceholderModule("opaca");
    const dispose = module.mount(target, { simId: "opaca", now: shellNow });

    expect(module.id).toBe("opaca");
    expect(appended).toHaveLength(1);
    const root = appended[0];
    expect(root?.className).toBe("eg-shell-sim-placeholder");
    const [text, back] = root?.children ?? [];
    expect(text?.textContent).toBe(`${t("sims.opaca.name")} · ${t("sims.soon")}`);
    expect(back?.attributes["href"]).toBe(routeHref("simulators"));
    expect(back?.textContent).toBe(t("shell.nav.simulators"));

    dispose();
    expect(root?.removed).toBe(1);
    dispose();
    expect(root?.removed).toBe(1);
  });

  it("her sim kimliği için eşleşen modül üretir; yükleyici de aynı kimliği döndürür", async () => {
    for (const simId of SIMULATOR_IDS) {
      expect(createPlaceholderModule(simId).id, simId).toBe(simId);
      expect((await loadSimModule(simId)).id, simId).toBe(simId);
    }
  });

  it("opaca yükleyicisi @egemed/sim-opaca'nın gerçek modülünü döndürür (yer tutucu değil)", async () => {
    const loaded = await loadSimModule("opaca");
    expect(loaded).toBe(opacaModule);
    expect(loaded).not.toEqual(createPlaceholderModule("opaca"));
  });

  it("pulse/ausculta yükleyicileri hâlâ yer tutucu modül döndürür (S15a/S18a'ya dek)", async () => {
    for (const simId of ["pulse", "ausculta"] as const) {
      const loaded = await loadSimModule(simId);
      expect(loaded.id, simId).toBe(simId);
      expect(loaded).not.toBe(opacaModule);
    }
  });
});

describe("SimRoute yükleniyor durumu", () => {
  it("tek h1, aria-busy ve çıkış bağlantısıyla host kapsayıcısını çizer", () => {
    const html = renderToStaticMarkup(createElement(SimRoute, { simId: "ausculta" }));
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(`<h1 class="eg-shell-sim-page__title">${t("sims.ausculta.name")}</h1>`);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`href="${routeHref("simulators")}"`);
    expect(html).toContain('class="eg-shell-sim-page__host"');
    expect(html).not.toContain('role="alert"');
  });

  it("host kapsayıcısını React çocuğu olmadan çizer; iskelet onun kardeşidir (T14b)", () => {
    const html = renderToStaticMarkup(createElement(SimRoute, { simId: "ausculta" }));
    // Vanilla sim modülü host'a appendChild yapar ve içeriği temizleyebilir;
    // React'in kaldıracağı çocuk olmadığı için host boş kalmalıdır.
    expect(html).toMatch(/<div class="eg-shell-sim-page__host"><\/div>/);
    const hostIndex = html.indexOf("eg-shell-sim-page__host");
    const skeletonIndex = html.indexOf("eg-shell-sim-page__skeleton");
    expect(skeletonIndex).toBeGreaterThan(hostIndex);
    expect(html).toContain("eg-shell-sim-page__stage");
  });

  it("opaca için de yüklenirken çubuk tek h1'i korur (gerçek modül henüz mount edilmedi)", () => {
    // SSR effect çalıştırmaz; durum hep "loading" kalır. Opaca hazır olunca
    // çubuk `<h1>`i bırakır (bkz. e2e/sims.spec.ts) — burada yalnız yükleniyor
    // durumundaki tekil `<h1>` sözleşmesi doğrulanır.
    const html = renderToStaticMarkup(createElement(SimRoute, { simId: "opaca" }));
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(`<h1 class="eg-shell-sim-page__title">${t("sims.opaca.name")}</h1>`);
  });
});

describe("kabuk saati", () => {
  it("sonlu ve geriye gitmeyen değer üretir", () => {
    const first = shellNow();
    const second = shellNow();
    expect(Number.isFinite(first)).toBe(true);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

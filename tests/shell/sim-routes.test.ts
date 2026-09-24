import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellNow } from "../../apps/shell/src/now";
import { HomePage, SimulatorsPage } from "../../apps/shell/src/pages";
import { resolveRoute, routeHref, SIM_PATHS, simHref, simTitleKey } from "../../apps/shell/src/routes";
import { SIM_IDS, SimCard } from "../../apps/shell/src/SimCard";
import { SimRoute, simErrorTitle } from "../../apps/shell/src/SimRoute";
import { loadSimModule } from "../../apps/shell/src/sims/loaders";
import { createPlaceholderModule } from "../../apps/shell/src/sims/placeholder";
import { SIMULATOR_IDS, type SimMountTarget } from "../../packages/sim-host/src/SimHost";
import { opacaModule } from "../../packages/sim-opaca/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { afterEach, describe, expect, it, vi } from "vitest";

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe("sim rotaları", () => {
  it("üç sim rotasını kimlik ve başlık anahtarıyla çözer", () => {
    expect(SIMULATOR_IDS).toEqual(["pulse", "ausculta", "opaca"]);
    for (const simId of SIMULATOR_IDS) {
      expect(SIM_PATHS[simId], simId).toBe(`/sims/${simId}`);
      expect(simHref(simId), simId).toBe(`#/sims/${simId}`);
      expect(simTitleKey(simId), simId).toBe(`sims.${simId}.name`);
      expect(t(simTitleKey(simId)), simId).toBe(t(`sims.${simId}.name`));
      expect(resolveRoute(simHref(simId)), simId).toEqual({
        kind: "sim",
        simId,
        titleKey: `sims.${simId}.name`,
      });
    }
  });
  it("sondaki '/' ve sorgu yok sayılır; bilinmeyen sim bulunamadıya düşer", () => {
    for (const hash of ["#/sims/pulse/", "#/sims/pulse?x=1", "#/sims/pulse/?x=1"]) {
      expect(resolveRoute(hash), hash).toEqual({
        kind: "sim",
        simId: "pulse",
        titleKey: "sims.pulse.name",
      });
    }
    for (const hash of ["#/sims", "#/sims/", "#/sims/kalp", "#/sims/pulse/ekstra", "#/sims/PULSE"]) {
      expect(resolveRoute(hash).kind, hash).toBe("notFound");
    }
  });
  it("kartlar 'Simülatörü aç' bağlantısını sim rotasına verir; rozet yalnız yer tutucu simlerde kalır", () => {
    const stillPlaceholder = SIM_IDS.filter((simId) => simId !== "opaca");
    for (const html of [
      renderToStaticMarkup(createElement(HomePage)),
      renderToStaticMarkup(createElement(SimulatorsPage)),
    ]) {
      expect(count(html, 'class="eg-shell-sim__link"')).toBe(SIM_IDS.length);
      // Opaca gerçek modüle bağlandı (T14c): "Platforma taşınıyor" rozeti kalkar.
      expect(count(html, t("sims.soon"))).toBe(stillPlaceholder.length);
      for (const simId of SIM_IDS) expect(html, simId).toContain(`href="${simHref(simId)}"`);
    }
  });
});

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

describe("SimCard rozet ve erişilebilir başlık düzeni", () => {
  it("rozeti başlığın yanında en üstte tutar; logo dekoratif, başlık görsel gizli", () => {
    for (const [headingLevel, tag] of [[3, "h3"], [2, "h2"]] as const) {
      const html = renderToStaticMarkup(
        createElement(SimCard, { headingLevel, href: "#/sims/pulse", id: "pulse" }),
      );
      const badgeIndex = html.indexOf('class="eg-badge"');
      const headingIndex = html.indexOf(`<${tag} class="eg-visually-hidden">`);
      const logoIndex = html.indexOf('class="eg-shell-sim__logo"');
      const linkIndex = html.indexOf('class="eg-shell-sim__link"');
      expect(html, tag).toContain(
        `<${tag} class="eg-visually-hidden">${t("sims.pulse.name")}</${tag}>`,
      );
      expect(badgeIndex, tag).toBeGreaterThan(-1);
      expect(badgeIndex, tag).toBeLessThan(headingIndex);
      expect(headingIndex, tag).toBeLessThan(logoIndex);
      expect(logoIndex, tag).toBeLessThan(linkIndex);
      expect(html, tag).not.toContain("eg-card__footer");
    }
  });

  it("opaca kartında rozet çizilmez, başlık ve bağlantı korunur (gerçek modüle bağlandı)", () => {
    const html = renderToStaticMarkup(
      createElement(SimCard, { href: "#/sims/opaca", id: "opaca" }),
    );
    expect(html).not.toContain('class="eg-badge"');
    expect(html).not.toContain(t("sims.soon"));
    expect(html).toContain(`<h3 class="eg-visually-hidden">${t("sims.opaca.name")}</h3>`);
    expect(html).toContain('href="#/sims/opaca"');
  });

  it("simülatörler sayfasında kart başlıkları h2 olarak kalır", () => {
    const html = renderToStaticMarkup(createElement(SimulatorsPage));
    for (const simId of SIM_IDS) {
      expect(html, simId).toContain(
        `<h2 class="eg-visually-hidden">${t(`sims.${simId}.name`)}</h2>`,
      );
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

  it("opaca için de çubuk tek h1'i korur (S25: gömülü ekranlar h2)", () => {
    // SSR effect çalıştırmaz; durum hep "loading" kalır. Opaca gömülü modda
    // `ScreenHeading` ile h2 kullandığı için kabuk hazır durumda da `<h1>`i
    // korur (bkz. e2e/sims.spec.ts).
    const html = renderToStaticMarkup(createElement(SimRoute, { simId: "opaca" }));
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(`<h1 class="eg-shell-sim-page__title">${t("sims.opaca.name")}</h1>`);
  });
});

describe("simErrorTitle", () => {
  it("sim adı ve hata etiketini mevcut anahtarlardan birleştirir", () => {
    for (const simId of SIMULATOR_IDS) {
      expect(simErrorTitle(simId), simId).toBe(
        `${t(`sims.${simId}.name`)} · ${t("badge.tone.danger")}`,
      );
    }
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

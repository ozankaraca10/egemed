import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellNow } from "../../apps/shell/src/now";
import { HomePage, SimulatorsPage } from "../../apps/shell/src/pages";
import { resolveRoute, routeHref, SIM_PATHS, simHref, simTitleKey } from "../../apps/shell/src/routes";
import { SIM_IDS } from "../../apps/shell/src/SimCard";
import { SimRoute } from "../../apps/shell/src/SimRoute";
import { loadSimModule } from "../../apps/shell/src/sims/loaders";
import { createPlaceholderModule } from "../../apps/shell/src/sims/placeholder";
import { SIMULATOR_IDS, type SimMountTarget } from "../../packages/sim-host/src/SimHost";
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
  it("kartlar 'Simülatörü aç' bağlantısını sim rotasına verir, rozet korunur", () => {
    for (const html of [
      renderToStaticMarkup(createElement(HomePage)),
      renderToStaticMarkup(createElement(SimulatorsPage)),
    ]) {
      expect(count(html, 'class="eg-shell-sim__link"')).toBe(SIM_IDS.length);
      expect(count(html, t("sims.soon"))).toBe(SIM_IDS.length);
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
});

describe("kabuk saati", () => {
  it("sonlu ve geriye gitmeyen değer üretir", () => {
    const first = shellNow();
    const second = shellNow();
    expect(Number.isFinite(first)).toBe(true);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

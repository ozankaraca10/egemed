import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellNow } from "../../apps/shell/src/now";
import { routeHref } from "../../apps/shell/src/routes";
import { SimRoute } from "../../apps/shell/src/SimRoute";
import { loadSimModule } from "../../apps/shell/src/sims/loaders";
import { SIMULATOR_IDS } from "../../packages/sim-host/src/SimHost";
import { auscultaModule } from "../../packages/sim-ausculta/src/index";
import { opacaModule } from "../../packages/sim-opaca/src/index";
import { pulseModule } from "../../packages/sim-pulse/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

describe("sim modülü yükleyici", () => {
  it("her sim kimliği kendi gerçek modülünü döndürür (T14e: üçü de canlı, yer tutucu yok)", async () => {
    expect(await loadSimModule("ausculta")).toBe(auscultaModule);
    expect(await loadSimModule("opaca")).toBe(opacaModule);
    expect(await loadSimModule("pulse")).toBe(pulseModule);
    for (const simId of SIMULATOR_IDS) {
      expect((await loadSimModule(simId)).id, simId).toBe(simId);
    }
  });

  it("ausculta yükleyicisi @egemed/sim-ausculta'nın gerçek modülünü döndürür, diğerlerinden ayrıdır (T14e)", async () => {
    const loaded = await loadSimModule("ausculta");
    expect(loaded).not.toBe(opacaModule);
    expect(loaded).not.toBe(pulseModule);
    expect(loaded.id).toBe("ausculta");
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

  it("opaca ve ausculta için de çubuk tek h1'i korur (S25/T14e: gömülü ekranlar h2)", () => {
    // SSR effect çalıştırmaz; durum hep "loading" kalır. Opaca ve Ausculta
    // gömülü modda `ScreenHeading` ile h2 kullandığı için kabuk hazır durumda
    // da `<h1>`i korur (bkz. e2e/sims.spec.ts).
    for (const simId of ["opaca", "ausculta"] as const) {
      const html = renderToStaticMarkup(createElement(SimRoute, { simId }));
      expect((html.match(/<h1\b/g) ?? []).length, simId).toBe(1);
      expect(html).toContain(`<h1 class="eg-shell-sim-page__title">${t(`sims.${simId}.name`)}</h1>`);
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

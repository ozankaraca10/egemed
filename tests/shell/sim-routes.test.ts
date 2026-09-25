import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shellNow } from "../../apps/shell/src/now";
import { HomePage, SimulatorsPage } from "../../apps/shell/src/pages";
import { resolveRoute, routeHref, SIM_PATHS, simHref, simTitleKey } from "../../apps/shell/src/routes";
import { SIM_IDS, SimCard } from "../../apps/shell/src/SimCard";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { SimErrorNotice, SimRoute } from "../../apps/shell/src/SimRoute";
import { loadSimModule } from "../../apps/shell/src/sims/loaders";
import { SIMULATOR_IDS } from "../../packages/sim-host/src/SimHost";
import { auscultaModule } from "../../packages/sim-ausculta/src/index";
import { opacaModule } from "../../packages/sim-opaca/src/index";
import { pulseModule } from "../../packages/sim-pulse/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

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
  it("kartlar 'Simülatörü aç' bağlantısını sim rotasına verir; üçü de canlı olduğu için rozet yok (T14e)", () => {
    for (const html of [
      renderToStaticMarkup(createElement(HomePage)),
      renderToStaticMarkup(createElement(SimulatorsPage)),
    ]) {
      expect(count(html, 'class="eg-shell-sim__link"')).toBe(SIM_IDS.length);
      expect(count(html, t("sims.soon"))).toBe(0);
      for (const simId of SIM_IDS) expect(html, simId).toContain(`href="${simHref(simId)}"`);
    }
  });
});

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

describe("SimCard erişilebilir başlık düzeni", () => {
  it("logo dekoratif, başlık görsel gizli ve logodan önce; rozet çizilmez", () => {
    for (const [headingLevel, tag] of [[3, "h3"], [2, "h2"]] as const) {
      for (const simId of SIM_IDS) {
        const html = renderToStaticMarkup(
          createElement(SimCard, { headingLevel, href: simHref(simId), id: simId }),
        );
        const headingIndex = html.indexOf(`<${tag} class="eg-visually-hidden">`);
        const logoIndex = html.indexOf('class="eg-shell-sim__logo"');
        const linkIndex = html.indexOf('class="eg-shell-sim__link"');
        expect(html, `${simId} ${tag}`).toContain(
          `<${tag} class="eg-visually-hidden">${t(`sims.${simId}.name`)}</${tag}>`,
        );
        expect(headingIndex, `${simId} ${tag}`).toBeLessThan(logoIndex);
        expect(logoIndex, `${simId} ${tag}`).toBeLessThan(linkIndex);
        expect(html, `${simId} ${tag}`).not.toContain('class="eg-badge"');
        expect(html, `${simId} ${tag}`).toContain(`href="${simHref(simId)}"`);
      }
    }
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
  it("başlık ve konum birleşik bardadır: SimRoute h1 çizmez, aria-busy ve etiketli bölüm verir", () => {
    const html = renderToStaticMarkup(createElement(SimRoute, { simId: "ausculta" }));
    expect(html).not.toMatch(/<h1\b/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`aria-label="${t("sims.ausculta.name")}"`);
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

  it("sim rotasında birleşik bar tek h1, konum bağlantısı ve simin eylemlerini çizer; ana gezinme ve footer yok", () => {
    for (const simId of SIMULATOR_IDS) {
      const html = renderToStaticMarkup(
        createElement(ShellLayout, {
          children: null,
          route: resolveRoute(simHref(simId)),
          simChrome: {
            actions: [{ icon: "help", id: "help", label: "Yardım", onSelect: () => undefined }],
            steps: { current: 1, labels: ["Mod seçimi", "Çalışma", "Tamamla"] },
          },
        }),
      );
      expect((html.match(/<h1\b/g) ?? []).length, simId).toBe(1);
      expect(html, simId).toContain(`<h1 class="eg-shell-simbar__title">${t(`sims.${simId}.name`)}</h1>`);
      expect(html, simId).toContain(`href="${routeHref("simulators")}"`);
      expect(html, simId).toContain('aria-current="step"');
      expect(html, simId).toContain('aria-label="Yardım"');
      expect(html, simId).not.toContain('class="eg-shell-nav"');
      expect(html, simId).not.toContain("eg-shell-footer");
    }
  });
});

describe("SimRoute erişim reddi kartı (T129)", () => {
  it("kilit simgesi, h2 başlık, açıklama ve Simülatörlere dön bağlantısını ortalanmış kartta çizer", () => {
    const html = renderToStaticMarkup(createElement(SimRoute, { allowed: false, simId: "pulse" }));
    expect(html).toContain('class="eg-shell-sim-page eg-shell-sim-page--notice"');
    expect(html).toContain('class="eg-shell-sim-notice"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`<h2 class="eg-shell-sim-notice__title">${t("sims.access.none")}</h2>`);
    expect(html).toContain(`<p class="eg-shell-sim-notice__body">${t("sims.access.denied")}</p>`);
    expect(html).toContain('class="eg-shell-sim-notice__primary"');
    expect(html).toContain(`href="${routeHref("simulators")}"`);
    expect(html).toContain(t("sims.back"));
    expect(html).not.toContain("eg-shell-sim-page__host");
    expect(html).not.toMatch(/<h1\b/);
  });
});

describe("SimErrorNotice kartı (T129)", () => {
  it("uyarı simgesi, h2 başlık, gövde, birincil Tekrar dene ve ikincil Simülatörlere dön çizer", () => {
    const html = renderToStaticMarkup(createElement(SimErrorNotice, { onRetry: () => undefined }));
    expect(html).toContain("eg-shell-sim-notice eg-shell-sim-notice--error");
    expect(html).toContain('class="eg-shell-sim-notice__icon eg-shell-sim-notice__icon--warning"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(`<h2 class="eg-shell-sim-notice__title">${t("sims.error.title")}</h2>`);
    expect(html).toContain(`<p class="eg-shell-sim-notice__body">${t("sims.error.body")}</p>`);
    expect(html).toContain('class="eg-shell-sim-notice__primary"');
    expect(html).toContain(`>${t("sims.error.retry")}</button>`);
    expect(html).toContain('class="eg-shell-sim-notice__secondary"');
    expect(html).toContain(`href="${routeHref("simulators")}"`);
    expect(html).toContain(t("sims.back"));
    expect(html).not.toMatch(/<h1\b/);
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

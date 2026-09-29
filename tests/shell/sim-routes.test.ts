import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SimulatorsPage } from "../../apps/shell/src/pages";
import { resolveRoute, routeHref, SIM_PATHS, simHref, simTitleKey } from "../../apps/shell/src/routes";
import { SIM_IDS, SimCard } from "../../apps/shell/src/SimCard";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { SimErrorNotice, SimRoute } from "../../apps/shell/src/SimRoute";
import { SIMULATOR_IDS } from "../../packages/sim-host/src/SimHost";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

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

  it("sim rotasında birleşik bar: tek h1 içinde sim değiştirici, sabit eylem sırası, footer (26 Eyl 2026)", () => {
    for (const simId of SIMULATOR_IDS) {
      const selected: number[] = [];
      const html = renderToStaticMarkup(
        createElement(ShellLayout, {
          children: null,
          route: resolveRoute(simHref(simId)),
          simChrome: {
            actions: [
              { icon: "help", id: "help", label: "Yardım", onSelect: () => undefined },
              { icon: "fullscreen", id: "fs", label: "Simin tam ekranı", onSelect: () => undefined },
              { icon: "progress", id: "progress", label: "İlerlemem", onSelect: () => undefined },
            ],
            steps: { current: 1, labels: ["Mod seçimi", "Çalışma", "Tamamla"], onSelect: (index) => selected.push(index) },
            chips: [
              { id: "mode", label: "Değerlendirme", tone: "assessment" },
              { id: "timer", label: "04:59", tone: "neutral" },
            ],
          },
        }),
      );
      expect((html.match(/<h1\b/g) ?? []).length, simId).toBe(1);
      // Geri bağlantısı yok; başlık sim değiştirici düğmesidir.
      expect(html, simId).toMatch(new RegExp(`<h1 class="eg-shell-simbar__title"><button[^>]*class="eg-shell-simbar__switch"`));
      expect(html, simId).toContain(`<span class="eg-shell-simbar__simName">${t(`sims.${simId}.name`)}</span>`);
      expect(html, simId).not.toContain("eg-shell-simbar__back");
      // Logo ana sayfaya gider.
      expect(html, simId).toContain(`class="eg-shell-brand" href="${routeHref("home")}"`);
      // Tamamlanan adım düğmedir; güncel adım aria-current taşır.
      expect(html, simId).toContain('aria-current="step"');
      expect(html, simId).toContain('class="eg-shell-simbar__stepButton"');
      // Mod çipi düğme (mod seçimine döner), süre düz durum metni.
      expect(html, simId).toMatch(/<button class="eg-shell-simbar__chip eg-shell-simbar__chip--assessment"/);
      expect(html, simId).toContain('<span class="eg-shell-simbar__status">04:59</span>');
      // Sabit sıra: İlerlemem · Tam ekran (kabuğun) · Yardım · Hakkında (kabuğun); simin tam ekranı yok sayılır.
      const group = html.slice(html.indexOf('class="eg-shell-simbar__actions"'), html.indexOf('class="eg-shell-simbar__more"'));
      const labels = [...group.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]);
      expect(labels, simId).toEqual(["İlerlemem", t("shell.sim.action.fullscreen"), "Yardım", t("shell.sim.action.about")]);
      expect(html, simId).not.toContain("Simin tam ekranı");
      expect(html, simId).not.toContain('class="eg-shell-nav"');
      expect(html, simId).toContain("eg-shell-footer");
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

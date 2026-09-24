import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DevSession } from "../../apps/shell/src/devAuth";
import { HomePage, scrollToSection } from "../../apps/shell/src/pages";
import { routeHref } from "../../apps/shell/src/routes";
import { SIM_IDS } from "../../apps/shell/src/SimCard";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const STUDENT: DevSession = { actorId: "dev-student-0001", role: "student" };
const TRUST_KEYS = ["data", "faculty", "privacy"] as const;
const TRUST_SECTION_ID = "eg-neden-guvenilir";
const HOW_STEPS = ["learn", "practice", "assess"] as const;
const HOW_SECTION_ID = "eg-nasil-calisir";

function render(session?: DevSession | null): string {
  return session === undefined
    ? renderToStaticMarkup(createElement(HomePage))
    : renderToStaticMarkup(createElement(HomePage, { session }));
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

/** React statik işaretlemede kesme işaretini `&#x27;` olarak kaçırır. */
const markup = (text: string): string => text.replace(/'/g, "&#x27;");

describe("HomePage premium yerleşimi", () => {
  it("tek h1 hero, lead ve simülatör CTA'sı taşır", () => {
    const html = render();
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(`<h1 class="eg-shell-hero__title">${t("home.hero.title")}</h1>`);
    expect(html).toContain(t("home.hero.lead"));
    expect(html).toContain(`<a class="eg-shell-cta" href="${routeHref("simulators")}">`);
    expect(html).toContain(t("home.hero.cta"));
    expect(html).toContain(
      `<a class="eg-shell-hero__secondary" href="#${HOW_SECTION_ID}">${t("home.hero.secondary")}</a>`,
    );
  });
  it("hero'dan sonra üç adımlı 'Nasıl çalışır?' bölümünü sim kartlarından önce çizer", () => {
    const html = render();
    expect(html).toContain(`id="${HOW_SECTION_ID}"`);
    expect(html).toContain(t("home.how.title"));
    expect(count(html, "eg-shell-how__step--")).toBe(3);
    expect(count(html, 'class="eg-shell-how__num"')).toBe(3);
    for (const step of HOW_STEPS) {
      expect(html, step).toContain(`eg-shell-how__step--${step}`);
      expect(html, step).toContain(t(`home.how.${step}.title`));
      expect(html, step).toContain(t(`home.how.${step}.body`));
    }
    expect(html.indexOf(`id="${HOW_SECTION_ID}"`)).toBeLessThan(html.indexOf('id="eg-home-sims"'));
    expect(html).toContain(`id="${TRUST_SECTION_ID}"`);
  });
  it("üç sim kartını rozet ve simülatörler bağlantısıyla listeler", () => {
    const html = render();
    expect(count(html, 'class="eg-card"')).toBe(3);
    expect(count(html, 'class="eg-shell-sim__link"')).toBe(3);
    // Opaca gerçek modüle bağlandı (T14c): "Platforma taşınıyor" rozeti kalkar,
    // pulse/ausculta yer tutucuda kaldığı sürece ikisi için görünür kalır.
    expect(count(html, t("sims.soon"))).toBe(2);
    expect(count(html, 'class="eg-shell-sim__logo"')).toBe(3);
    for (const id of SIM_IDS) {
      expect(html, id).toContain(markup(t(`sims.${id}.name`)));
      expect(html, id).toContain(markup(t(`sims.${id}.tagline`)));
      expect(html, id).toContain(markup(t(`sims.${id}.body`)));
    }
  });
  it("ilerlemem bölümü başlığı ve iskeletiyle çizilir (T74: veri getirme SSR'da çalışmaz)", () => {
    const html = render();
    expect(html).toContain(t("home.progress.title"));
    expect(html).toContain("eg-shell-progress__skeleton");
    // Gerçek sekme/veri sözleşmesi tests/shell/dashboard.test.ts içinde doğrulanır.
    expect(html).not.toContain('role="progressbar"');
  });
  it("üç güven kanıtı kartını ve kaydırma hedefi kimliğini çizer", () => {
    const html = render();
    expect(html).toContain(`id="${TRUST_SECTION_ID}"`);
    expect(html).toContain(t("home.trust.title"));
    expect((html.match(/class="eg-shell-trust__item"/g) ?? []).length).toBe(3);
    for (const key of TRUST_KEYS) {
      expect(html, key).toContain(t(`home.trust.${key}.title`));
      expect(html, key).toContain(t(`home.trust.${key}.body`));
    }
  });
  it("oturum varken hoş geldiniz ve rol etiketi gösterir, yokken göstermez", () => {
    const none = render(null);
    expect(none).not.toContain(t("home.greeting"));
    const student = render(STUDENT);
    expect(student).toContain(t("home.greeting"));
    expect(student).toContain(t("entry.role.student"));
    expect(student).not.toContain(t("entry.role.admin"));
  });
});

describe("scrollToSection", () => {
  it("hash gezinmesini iptal eder; DOM yokken sessizce döner", () => {
    let prevented = 0;
    expect(() =>
      scrollToSection({ preventDefault: () => { prevented += 1; } }, HOW_SECTION_ID),
    ).not.toThrow();
    expect(prevented).toBe(1);
  });
});

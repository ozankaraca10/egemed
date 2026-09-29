import { createElement } from "react";
import { shellSessionFromDev } from "../../apps/shell/src/session";
import { renderToStaticMarkup } from "react-dom/server";
import type { DevSession } from "../../apps/shell/src/devAuth";
import { HomePage, scrollToSection } from "../../apps/shell/src/pages";
import { routeHref } from "../../apps/shell/src/routes";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const STUDENT: DevSession = { actorId: "dev-student-0001", role: "student" };
const HOW_SECTION_ID = "eg-nasil-calisir";

function render(session?: DevSession | null): string {
  return session === undefined
    ? renderToStaticMarkup(createElement(HomePage))
    : renderToStaticMarkup(createElement(HomePage, { session: session === null ? null : shellSessionFromDev(session) }));
}

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

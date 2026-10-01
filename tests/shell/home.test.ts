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
  it("tek h1 hero ve lead; oturumsuzken birincil eylem öğrenci girişi, ikincil simülatörler ve nasıl çalışır (T296)", () => {
    const html = render(null);
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(`<h1 class="eg-shell-homehero__title">${t("home.hero.title")}</h1>`);
    expect(html).toContain(t("home.hero.lead"));
    expect(html).toContain(t("home.hero.signin"));
    expect(html).toContain(`<a class="eg-shell-homehero__ghost" href="${routeHref("simulators")}">`);
    expect(html).toContain(`<a class="eg-shell-homehero__ghost" href="#${HOW_SECTION_ID}">${t("home.hero.secondary")}</a>`);
    expect(html).toContain(t("home.modes.title"));
  });
  it("oturum varken hoş geldiniz ve Bugün kartı gösterir, yokken göstermez", () => {
    const none = render(null);
    expect(none).not.toContain(t("home.greeting"));
    expect(none).not.toContain(t("home.today.title"));
    const student = render(STUDENT);
    expect(student).toContain(t("home.greeting"));
    expect(student).toContain(t("home.today.title"));
    expect(student).not.toContain(t("home.hero.signin"));
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

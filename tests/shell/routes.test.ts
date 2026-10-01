import { ROUTES, challengeHref, challengePlayHref, resolveRoute, routeHref, simScreenHref } from "../../apps/shell/src/routes";
import { tr } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

/** Hash'i çözer; sayfa değilse testi düşürür. */
function pageId(hash: string): string {
  const resolved = resolveRoute(hash);
  if (resolved.kind !== "page") throw new Error(`Sayfa bekleniyordu: ${hash}`);
  return resolved.route.id;
}

describe("resolveRoute", () => {
  it("sim içi Meydan Okuma rotaları: merkez, ayrıntı ve düello oynama (T281a, ADR-010)", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(resolveRoute("#/sims/opaca/meydan-okuma")).toMatchObject({ kind: "sim", simId: "opaca", screenKey: "meydan-okuma" });
    expect(resolveRoute(`#/sims/opaca/meydan-okuma/${id}`)).toMatchObject({
      kind: "sim",
      simId: "opaca",
      screenKey: "meydan-okuma",
      challengeDetailId: id,
    });
    expect(resolveRoute(`#/sims/ausculta/duello/${id}`)).toMatchObject({ kind: "sim", simId: "ausculta", challengeId: id });
    expect(resolveRoute(`#/sims/kalp/meydan-okuma`).kind).toBe("notFound");
    expect(resolveRoute(`#/sims/opaca/meydan-okuma/degil-uuid`).kind).toBe("notFound");
  });

  it("eski Meydan Okuma adresleri korunur: liste Simülatörler'e, ayrıntı kaynak çözümüne düşer (T281a)", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(resolveRoute("#/meydan-okuma")).toEqual({ kind: "redirect", href: "#/simulatorler", titleKey: "shell.simulators.title" });
    expect(resolveRoute(`#/meydan-okuma/${id}`)).toEqual({ kind: "challengeDetail", challengeId: id, titleKey: "challenges.detail.title" });
    expect(resolveRoute("#/meydan-okuma/degil-uuid").kind).toBe("notFound");
  });

  it("sim içi ekran yollarını çözer ve düello yolunun önceliğini korur", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(resolveRoute("#/sims/opaca/ogrenme")).toMatchObject({ kind: "sim", simId: "opaca", screenKey: "ogrenme" });
    expect(resolveRoute("#/sims/opaca/Kötü").kind).toBe("notFound");
    expect(resolveRoute(`#/sims/opaca/duello/${id}`)).toMatchObject({ kind: "sim", simId: "opaca", challengeId: id });
  });

  it("Meydan Okuma ana gezinmede yoktur; sim içi bağlantılar yeni biçimdedir", () => {
    expect(ROUTES.map((route) => route.id)).toEqual(["home", "simulators", "about"]);
    expect(ROUTES.some((route) => route.path === "/meydan-okuma")).toBe(false);
    const id = "11111111-1111-4111-8111-111111111111";
    expect(simScreenHref("opaca", "modlar")).toBe("#/sims/opaca/modlar");
    expect(challengeHref("opaca", id)).toBe(`#/sims/opaca/meydan-okuma/${id}`);
    expect(challengePlayHref("opaca", id)).toBe(`#/sims/opaca/duello/${id}`);
  });

  it("gidiş-dönüş, benzersizlik ve sözlük anahtarları korunur", () => {
    const keys = new Set(Object.keys(tr));
    expect(ROUTES.length).toBe(3);
    expect(new Set(ROUTES.map((route) => route.id)).size).toBe(3);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(3);
    for (const route of ROUTES) {
      expect(routeHref(route.id), route.id).toBe(`#${route.path}`);
      expect(pageId(routeHref(route.id)), route.id).toBe(route.id);
      expect(keys.has(route.labelKey), route.labelKey).toBe(true);
      expect(keys.has(route.titleKey), route.titleKey).toBe(true);
    }
  });
});

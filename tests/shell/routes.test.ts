import { ROUTES, resolveRoute, routeHref } from "../../apps/shell/src/routes";
import { tr } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

/** Hash'i çözer; sayfa değilse testi düşürür. */
function pageId(hash: string): string {
  const resolved = resolveRoute(hash);
  if (resolved.kind !== "page") throw new Error(`Sayfa bekleniyordu: ${hash}`);
  return resolved.route.id;
}

describe("resolveRoute", () => {
  it("boş, '#' ve '#/' ana sayfaya çözülür", () => {
    for (const hash of ["", "#", "#/"]) expect(pageId(hash), hash).toBe("home");
  });
  it("her ROUTES yolu kendi kimliğine çözülür; sondaki '/' ve sorgu yok sayılır", () => {
    for (const route of ROUTES) expect(pageId(`#${route.path}`), route.path).toBe(route.id);
    for (const hash of ["#/simulatorler/", "#/simulatorler//", "#/simulatorler?x=1", "#/simulatorler/?x=1"]) {
      expect(pageId(hash), hash).toBe("simulators");
    }
  });
  it("bilinmeyen yol notFound'a çözülür", () => {
    expect(resolveRoute("#/yok")).toEqual({ kind: "notFound", path: "/yok" });
    expect(resolveRoute("#/simulatorler/fazla").kind).toBe("notFound");
  });
  it("kaldırılan Görevler/Not Defteri yolları artık notFound'a çözülür (T159)", () => {
    expect(resolveRoute("#/gorevler").kind).toBe("notFound");
    expect(resolveRoute("#/not-defteri").kind).toBe("notFound");
  });
  it("Meydan Okuma rotaları: liste, ayrıntı ve düello modunda sim (ADR-010)", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(resolveRoute("#/meydan-okuma")).toMatchObject({ kind: "page", route: { id: "challenges" } });
    expect(resolveRoute(`#/meydan-okuma/${id}`)).toEqual({ kind: "challengeDetail", challengeId: id, titleKey: "challenges.detail.title" });
    expect(resolveRoute(`#/sims/ausculta/duello/${id}`)).toMatchObject({ kind: "sim", simId: "ausculta", challengeId: id });
    expect(resolveRoute("#/meydan-okuma/degil-uuid").kind).toBe("notFound");
    expect(resolveRoute(`#/sims/kalp/duello/${id}`).kind).toBe("notFound");
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

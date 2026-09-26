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
  it("gidiş-dönüş, benzersizlik ve sözlük anahtarları korunur", () => {
    const keys = new Set(Object.keys(tr));
    expect(ROUTES.length).toBe(2);
    expect(new Set(ROUTES.map((route) => route.id)).size).toBe(2);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(2);
    for (const route of ROUTES) {
      expect(routeHref(route.id), route.id).toBe(`#${route.path}`);
      expect(pageId(routeHref(route.id)), route.id).toBe(route.id);
      expect(keys.has(route.labelKey), route.labelKey).toBe(true);
      expect(keys.has(route.titleKey), route.titleKey).toBe(true);
    }
  });
});

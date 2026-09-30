import { createSimNavigation } from "../../apps/shell/src/simNavigation";
import type { SimNavigationEnvironment } from "../../apps/shell/src/simNavigation";
import { describe, expect, it } from "vitest";

function environment(start = "#/sims/opaca/ogrenme") {
  let hash = start;
  const listeners = new Map<string, Set<() => void>>();
  const writes: { method: string; hash: string }[] = [];
  const env: SimNavigationEnvironment = {
    get hash() { return hash; },
    push(next) { hash = next; writes.push({ method: "push", hash }); },
    replace(next) { hash = next; writes.push({ method: "replace", hash }); },
    addListener(event, listener) {
      const group = listeners.get(event) ?? new Set<() => void>();
      group.add(listener);
      listeners.set(event, group);
    },
    removeListener(event, listener) { listeners.get(event)?.delete(listener); },
  };
  return {
    env,
    writes,
    navigate(next: string, event: "hashchange" | "popstate" = "hashchange") {
      hash = next;
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
}

describe("sim navigation", () => {
  it("pushes changed screens, ignores repeats, and replaces when requested", () => {
    const browser = environment();
    const { navigation } = createSimNavigation("opaca", "ogrenme", browser.env);
    navigation.report("uygulama");
    navigation.report("uygulama");
    navigation.report("sonuc", { replace: true });
    navigation.report(null);
    expect(browser.writes).toEqual([
      { method: "push", hash: "#/sims/opaca/uygulama" },
      { method: "replace", hash: "#/sims/opaca/sonuc" },
      { method: "push", hash: "#/sims/opaca" },
    ]);
  });

  it("notifies subscribers for external same-sim history changes, but not report calls", () => {
    const browser = environment();
    const { navigation, dispose } = createSimNavigation("opaca", "ogrenme", browser.env);
    const received: (string | null)[] = [];
    navigation.subscribe((screen) => received.push(screen));
    navigation.report("uygulama");
    expect(received).toEqual([]);
    browser.navigate("#/sims/opaca/sonuc", "popstate");
    browser.navigate("#/sims/pulse/yardim");
    browser.navigate("#/sims/opaca", "hashchange");
    expect(received).toEqual(["sonuc", null]);
    dispose();
    browser.navigate("#/sims/opaca/ogrenme");
    expect(received).toEqual(["sonuc", null]);
  });
});

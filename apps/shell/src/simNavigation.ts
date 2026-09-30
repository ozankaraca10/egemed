import { isSimScreenKey, type SimNavigation, type SimScreenKey, type SimulatorId } from "@egemed/sim-host";

export interface SimNavigationEnvironment {
  readonly hash: string;
  push(hash: string): void;
  replace(hash: string): void;
  addListener(event: "hashchange" | "popstate", listener: () => void): void;
  removeListener(event: "hashchange" | "popstate", listener: () => void): void;
}

export interface SimNavigationController {
  readonly navigation: SimNavigation;
  dispose(): void;
}

/** Navigasyon kanalı testlerde dar bir ortam arayüzüyle çalıştırılabilir. */
export function createSimNavigation(
  simId: SimulatorId,
  initial: SimScreenKey | null,
  environment: SimNavigationEnvironment,
): SimNavigationController {
  let current = initial;
  const listeners = new Set<(screen: SimScreenKey | null) => void>();

  const readScreen = (): SimScreenKey | null | undefined => {
    const path = environment.hash.replace(/^#/, "").split("?")[0]?.replace(/\/+$/, "") ?? "";
    const match = /^\/sims\/([a-z]+)(?:\/([^/]+))?$/.exec(path);
    if (match?.[1] !== simId) return undefined;
    const screen = match[2];
    if (screen === undefined) return null;
    return isSimScreenKey(screen) ? screen : undefined;
  };

  const onExternalNavigation = (): void => {
    const next = readScreen();
    if (next === undefined || next === current) return;
    current = next;
    for (const listener of listeners) listener(next);
  };

  environment.addListener("hashchange", onExternalNavigation);
  environment.addListener("popstate", onExternalNavigation);

  return {
    navigation: {
      initial,
      report(screen, options) {
        if (screen !== null && !isSimScreenKey(screen)) return;
        if (screen === current) return;
        current = screen;
        const hash = `#/sims/${simId}${screen === null ? "" : `/${screen}`}`;
        if (options?.replace === true) environment.replace(hash);
        else environment.push(hash);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    dispose() {
      environment.removeListener("hashchange", onExternalNavigation);
      environment.removeListener("popstate", onExternalNavigation);
      listeners.clear();
    },
  };
}

export function createBrowserSimNavigation(
  simId: SimulatorId,
  initial: SimScreenKey | null,
): SimNavigationController {
  return createSimNavigation(simId, initial, {
    get hash() {
      return window.location.hash;
    },
    push: (hash) => window.history.pushState(null, "", hash),
    replace: (hash) => window.history.replaceState(null, "", hash),
    addListener: (event, listener) => window.addEventListener(event, listener),
    removeListener: (event, listener) => window.removeEventListener(event, listener),
  });
}

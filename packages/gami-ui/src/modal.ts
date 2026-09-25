export interface GamiFocusable {
  focus(): void;
  hasAttribute(name: string): boolean;
}

export interface GamiKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

export interface GamiModalEnv {
  readonly activeElement: GamiFocusable | null;
  addEventListener(type: "keydown", handler: (event: GamiKeyEvent) => void): void;
  removeEventListener(type: "keydown", handler: (event: GamiKeyEvent) => void): void;
  queryFocusables(root: unknown, selector: string): GamiFocusable[];
}

export function createNoopGamiModalEnv(): GamiModalEnv {
  return {
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    queryFocusables: () => [],
  };
}

export const NOOP_GAMI_MODAL_ENV: GamiModalEnv = createNoopGamiModalEnv();

export type GamiTabTrapTarget = "first" | "last" | null;

export function gamiTabTrapTarget(shiftKey: boolean, active: unknown, first: unknown, last: unknown): GamiTabTrapTarget {
  if (shiftKey) return active === first ? "last" : null;
  return active === last ? "first" : null;
}

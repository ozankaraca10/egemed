import { createContext, useContext, type JSX, type ReactNode } from "react";
import type { SimChrome } from "@egemed/sim-host";

/** Platform kabuğu: gömülü mod ve, verilmişse, birleşik bar kanalı. */
interface EmbeddedValue {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
}

const EmbeddedContext = createContext<EmbeddedValue>({ embedded: false });

export function EmbeddedProvider({
  embedded,
  setChrome,
  children,
}: {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly children: ReactNode;
}): JSX.Element {
  const value: EmbeddedValue = setChrome === undefined ? { embedded } : { embedded, setChrome };
  return <EmbeddedContext.Provider value={value}>{children}</EmbeddedContext.Provider>;
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext).embedded;
}

/** Birleşik bar kanalı. Yoksa sim kendi araç çubuğunu çizer. */
export function useSetChrome(): ((chrome: SimChrome | null) => void) | undefined {
  return useContext(EmbeddedContext).setChrome;
}

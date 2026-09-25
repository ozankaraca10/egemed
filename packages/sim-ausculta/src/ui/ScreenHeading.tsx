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

/** Birleşik bar kanalı. Yoksa ekran içi adım göstergesi kalır. */
export function useSetChrome(): ((chrome: SimChrome | null) => void) | undefined {
  return useContext(EmbeddedContext).setChrome;
}

export interface ScreenHeadingProps {
  readonly className?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

/** Ekran ana başlığı: gömülü modda h2, bağımsız modda h1 (aynı sınıf/id). */
export function ScreenHeading({ className, id, children }: ScreenHeadingProps): JSX.Element {
  const embedded = useEmbedded();
  if (embedded) {
    return (
      <h2 className={className} id={id}>
        {children}
      </h2>
    );
  }
  return (
    <h1 className={className} id={id}>
      {children}
    </h1>
  );
}

import { createContext, useContext, type JSX, type ReactNode } from "react";
import type { SimAudience, SimChrome } from "@egemed/sim-host";

/** Platform kabuğu: gömülü mod, verilmişse birleşik bar kanalı, kitle ve giriş isteği. */
interface EmbeddedValue {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly audience: SimAudience;
  readonly requestSignIn?: () => void;
}

const EmbeddedContext = createContext<EmbeddedValue>({ embedded: false, audience: "student" });

export function EmbeddedProvider({
  embedded,
  setChrome,
  audience = "student",
  requestSignIn,
  children,
}: {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly audience?: SimAudience;
  readonly requestSignIn?: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const value: EmbeddedValue = {
    embedded,
    audience,
    ...(setChrome === undefined ? {} : { setChrome }),
    ...(requestSignIn === undefined ? {} : { requestSignIn }),
  };
  return <EmbeddedContext.Provider value={value}>{children}</EmbeddedContext.Provider>;
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext).embedded;
}

/** Birleşik bar kanalı. Yoksa ekran içi adım göstergesi kalır. */
export function useSetChrome(): ((chrome: SimChrome | null) => void) | undefined {
  return useContext(EmbeddedContext).setChrome;
}

/** Kitle (26 Eyl 2026 sözleşmesi); bağlam yoksa `student`. */
export function useAudience(): SimAudience {
  return useContext(EmbeddedContext).audience;
}

/** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi; kabukça verilmezse yoktur. */
export function useRequestSignIn(): (() => void) | undefined {
  return useContext(EmbeddedContext).requestSignIn;
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

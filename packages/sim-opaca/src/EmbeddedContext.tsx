import { createContext, useContext, type JSX, type ReactNode } from "react";
import type { SimChrome, SimSessionSource } from "@egemed/sim-host";

/** Platform kabuğu: gömülü mod, verilmişse birleşik bar kanalı ve A2.3 sunucu oturumu kanalı. */
interface EmbeddedValue {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  /** A2.3 (ADR-009): sunucu vaka oturumu kanalı; uygulama/değerlendirme bununla çalışır. */
  readonly sessions?: SimSessionSource;
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
  readonly openChallenges?: () => void;
}

const EmbeddedContext = createContext<EmbeddedValue>({ embedded: false });

export function EmbeddedProvider({
  embedded,
  setChrome,
  sessions,
  challengeId,
  onChallengeFinished,
  openChallenges,
  children,
}: {
  readonly embedded: boolean;
  readonly setChrome?: (chrome: SimChrome | null) => void;
  readonly sessions?: SimSessionSource;
  readonly challengeId?: string;
  readonly onChallengeFinished?: (challengeId: string) => void;
  readonly openChallenges?: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const value: EmbeddedValue = {
    embedded,
    ...(setChrome === undefined ? {} : { setChrome }),
    ...(sessions === undefined ? {} : { sessions }),
    ...(challengeId === undefined ? {} : { challengeId }),
    ...(onChallengeFinished === undefined ? {} : { onChallengeFinished }),
    ...(openChallenges === undefined ? {} : { openChallenges }),
  };
  return <EmbeddedContext.Provider value={value}>{children}</EmbeddedContext.Provider>;
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext).embedded;
}

/** Birleşik bar kanalı. Yoksa sim kendi araç çubuğunu çizer. */
export function useSetChrome(): ((chrome: SimChrome | null) => void) | undefined {
  return useContext(EmbeddedContext).setChrome;
}

/** A2.3: sunucu vaka oturumu kanalı; kabuk vermezse yoktur. */
export function useSessions(): SimSessionSource | undefined {
  return useContext(EmbeddedContext).sessions;
}

/** ADR-010: düello bağlamı (kabuk `#/sims/opaca/duello/<id>` ile açınca). */
export function useChallenge(): { readonly challengeId?: string; readonly onChallengeFinished?: (challengeId: string) => void } {
  const value = useContext(EmbeddedContext);
  return {
    ...(value.challengeId === undefined ? {} : { challengeId: value.challengeId }),
    ...(value.onChallengeFinished === undefined ? {} : { onChallengeFinished: value.onChallengeFinished }),
  };
}

/** T289: 4. mod kartı "Meydan Okuma" → kabuk merkezi; ziyaretçide/düelloda yoktur. */
export function useOpenChallenges(): (() => void) | undefined {
  return useContext(EmbeddedContext).openChallenges;
}

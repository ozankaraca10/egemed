import { createContext, type JSX, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { GamiRepository } from "@egemed/gamification-core";
import type { SimGamificationSource, SimLearnRecord } from "@egemed/sim-host";
import type { OpacaAttemptRecord } from "./attempt";
import { formatGamiSyncError } from "./errors";
import { configureGamiRepository } from "./repo";

export interface GamiSyncError {
  readonly message: string;
  readonly at: number;
}

export interface GamiContextValue {
  readonly repository: GamiRepository<OpacaAttemptRecord> | null;
  readonly syncError: GamiSyncError | null;
  readonly reportSyncError: (error: unknown, kind?: "read" | "write") => void;
  readonly clearSyncError: () => void;
  readonly reportLearn?: (record: SimLearnRecord) => void;
  readonly gamification?: SimGamificationSource;
}

const GamiContext = createContext<GamiContextValue | null>(null);

export function GamiProvider({
  repository = null,
  now,
  reportLearn,
  gamification,
  children,
}: {
  readonly repository?: GamiRepository<OpacaAttemptRecord> | null;
  readonly now: () => number;
  readonly reportLearn?: (record: SimLearnRecord) => void;
  readonly gamification?: SimGamificationSource;
  readonly children: ReactNode;
}): JSX.Element {
  const [syncError, setSyncError] = useState<GamiSyncError | null>(null);

  const reportSyncError = useCallback((error: unknown, kind: "read" | "write" = "read") => {
    setSyncError({ message: formatGamiSyncError(error, kind), at: now() });
  }, [now]);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  const value = useMemo((): GamiContextValue => {
    const base = {
      repository: repository ?? null,
      syncError,
      reportSyncError,
      clearSyncError,
    };
    return {
      ...base,
      ...(reportLearn === undefined ? {} : { reportLearn }),
      ...(gamification === undefined ? {} : { gamification }),
    };
  }, [clearSyncError, gamification, reportLearn, reportSyncError, repository, syncError]);

  return <GamiContext.Provider value={value}>{children}</GamiContext.Provider>;
}

/** SimModule mount/dispose ile eşleşen depo bağlama — provider dışında da çağrılabilir. */
export function bindGamiRepository(repository: GamiRepository<OpacaAttemptRecord> | null): void {
  configureGamiRepository(repository);
}

export function useGamiContext(): GamiContextValue {
  const ctx = useContext(GamiContext);
  if (!ctx) {
    return {
      repository: null,
      syncError: null,
      reportSyncError: () => undefined,
      clearSyncError: () => undefined,
    };
  }
  return ctx;
}

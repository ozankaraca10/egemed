/** Oyunlaştırma ekran seam'leri — yerel veya enjekte API deposu. */

import { useMemo } from "react";
import { ALL_CASES } from "../data/pool";
import { useGamiContext } from "./GamiContext";
import { getGamiRepo, isLocalRepo } from "./repo";
import type { LearnGamiPort } from "../screens/LearnScreen";
import type { SimulationGamiPort } from "../screens/SimulationScreen";

export function useLearnGamiPort(): LearnGamiPort {
  const { reportSyncError } = useGamiContext();
  const repo = useMemo(() => getGamiRepo(), []);
  return useMemo(
    () => ({
      recordLearn(payload, at) {
        void repo.recordLearn(payload, at).catch((error: unknown) => {
          reportSyncError(error, isLocalRepo(repo) ? "read" : "write");
        });
      },
    }),
    [repo, reportSyncError],
  );
}

export function useSimulationGamiPort(): SimulationGamiPort {
  return useMemo(
    () => ({
      recordAssessmentComplete() {
        // Kayıt GamiGains/ResultsScreen tarafından idempotent yapılır.
      },
    }),
    [],
  );
}

export function caseById(id: string) {
  return ALL_CASES.find((c) => c.id === id);
}

export { getGamiRepo, isLocalRepo };

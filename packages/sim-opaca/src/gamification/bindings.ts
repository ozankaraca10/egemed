/** Oyunlaştırma ekran seam'leri — yerel veya enjekte API deposu. */

import { useMemo } from "react";
import { useGamiContext } from "./GamiContext";
import { getGamiRepo, isLocalRepo } from "./repo";
import type { LearnGamiPort } from "../screens/LearnScreen";

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

export { getGamiRepo, isLocalRepo };

/** Oyunlaştırma ekran seam'leri — yerel veya enjekte API deposu. */

import { useMemo } from "react";
import { useGamiContext } from "./GamiContext";
import { getGamiRepo, isLocalRepo } from "./repo";
import type { LearnGamiPort } from "../screens/LearnScreen";

/** A4 (ADR-009): puansız öğrenme kaydı — sim ad alanlı anahtar, skor yok. */
function learnTopic(payload: { topic?: string; ctStack?: string }): string | null {
  if (payload.topic !== undefined && payload.topic.length > 0) return `opaca:topic:${payload.topic}`;
  if (payload.ctStack !== undefined && payload.ctStack.length > 0) return `opaca:stack:${payload.ctStack}`;
  return null;
}

export function useLearnGamiPort(): LearnGamiPort {
  const { reportLearn, reportSyncError } = useGamiContext();
  const repo = useMemo(() => getGamiRepo(), []);
  return useMemo(
    () => ({
      recordLearn(payload, at) {
        void repo.recordLearn(payload, at).catch((error: unknown) => {
          reportSyncError(error, isLocalRepo(repo) ? "read" : "write");
        });
        // Puanlı deneme kanalı kapalı; sunucuya yalnızca puansız öğrenme kaydı gider.
        if (reportLearn === undefined) return;
        const topic = learnTopic(payload);
        if (topic === null) return;
        try {
          reportLearn({ topic });
        } catch {
          // Rapor hatası öğrenme akışını bozmaz.
        }
      },
    }),
    [repo, reportLearn, reportSyncError],
  );
}

export { getGamiRepo, isLocalRepo };

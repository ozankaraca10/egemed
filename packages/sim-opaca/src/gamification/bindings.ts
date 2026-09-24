/** Oyunlaştırma ekran seam'leri — varsayılan LocalRepo bağlantısı. */

import { ALL_CASES } from "../data/pool";
import { getGamiRepo } from "./repo";
import type { LearnGamiPort } from "../screens/LearnScreen";
import type { SimulationGamiPort } from "../screens/SimulationScreen";

export function createLearnGamiPort(): LearnGamiPort {
  const repo = getGamiRepo();
  return {
    recordLearn(payload, at) {
      void repo.recordLearn(payload, at);
    },
  };
}

export function createSimulationGamiPort(): SimulationGamiPort {
  return {
    recordAssessmentComplete() {
      // Kayıt GamiGains/ResultsScreen tarafından idempotent yapılır.
    },
  };
}

export function caseById(id: string) {
  return ALL_CASES.find((c) => c.id === id);
}

export { getGamiRepo };

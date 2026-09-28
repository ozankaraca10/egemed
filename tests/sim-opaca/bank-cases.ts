import { ALL_CASES as BANK_CASES } from "../../packages/assessment-bank/src/opaca/data";
import type { CaseDef, Mode } from "../../packages/sim-opaca/src/core/types";

/**
 * YALNIZ TEST: anahtarlı vaka havuzu (A2.3). İstemci paketi artık vaka taşımaz;
 * saf çekirdek (puanlama, doğrulama, örneklem) testleri havuzu bankanın veri
 * yolundan alır — banka JSON'ları okur, sim paketine kod bağımlılığı kurmaz.
 */
export const ALL_CASES: CaseDef[] = BANK_CASES as unknown as CaseDef[];

export function poolFor(mode: Mode): CaseDef[] {
  if (mode === "assessment") return ALL_CASES.filter((c) => c.modes.includes("assessment") && c.mappingValidation === "validated");
  if (mode === "practice") return ALL_CASES.filter((c) => c.modes.includes("practice"));
  return ALL_CASES;
}

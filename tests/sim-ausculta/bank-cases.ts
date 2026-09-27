import casesCore from "../../packages/assessment-bank/data/ausculta/cases.json" with { type: "json" };
import casesAuto from "../../packages/assessment-bank/data/ausculta/cases-auto.json" with { type: "json" };
import type { CaseDef, Mode } from "../../packages/sim-ausculta/src/core/types";

/**
 * YALNIZ TEST: anahtarlı vaka havuzu (T196). İstemci paketi artık vaka taşımaz;
 * saf çekirdek (puanlama, doğrulama, örneklem, reducer) testleri havuzu buradan alır.
 */
export const CORE_CASES = (casesCore as unknown as { cases: CaseDef[] }).cases;
export const AUTO_CASES = (casesAuto as unknown as { cases: CaseDef[] }).cases;
export const ALL_CASES: CaseDef[] = [...CORE_CASES, ...AUTO_CASES];

export function poolFor(mode: Mode): CaseDef[] {
  if (mode === "assessment") return ALL_CASES.filter((c) => c.modes.includes("assessment") && c.mappingValidation === "validated");
  if (mode === "practice") return ALL_CASES.filter((c) => c.modes.includes("practice"));
  return ALL_CASES;
}

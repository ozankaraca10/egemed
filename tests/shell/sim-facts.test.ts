import { describe, expect, it } from "vitest";
import { SIM_FACTS } from "../../apps/shell/src/sims/SimulatorsPage";
import { CASE_INVENTORY as OPACA } from "../../packages/sim-opaca/src/data/inventory";
import { LIBRARY_ITEMS } from "../../packages/sim-opaca/src/data/terminology";
import { CASE_INVENTORY as AUSCULTA } from "../../packages/sim-ausculta/src/data/inventory";
import { LIBRARY_ITEM_COUNT } from "../../packages/sim-ausculta/src/data/library";
import { curriculum } from "../../packages/sim-pulse/src/data/curriculum";

// T296: Simülatörler sayfasındaki içerik sayıları elle yazılır (sim paketleri
// tembel yüklenir); sim envanteri değişince bu test sayfayı güncellemeyi hatırlatır.
describe("Simülatörler sayfası içerik sayıları", () => {
  it("sim envanterleriyle birebir aynıdır", () => {
    expect(SIM_FACTS.pulse.map((fact) => fact.value)).toEqual([Object.keys(curriculum.patterns).length, curriculum.caseCount, curriculum.quizCount]);
    expect(SIM_FACTS.ausculta.map((fact) => fact.value)).toEqual([LIBRARY_ITEM_COUNT, AUSCULTA.practicePoolSize, AUSCULTA.assessmentPoolSize]);
    expect(SIM_FACTS.opaca.map((fact) => fact.value)).toEqual([LIBRARY_ITEMS.length, OPACA.practicePoolSize, OPACA.assessmentPoolSize]);
  });
});

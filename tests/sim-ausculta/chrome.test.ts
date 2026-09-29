import { describe, expect, it } from "vitest";
import { resolveStepSelect } from "../../packages/sim-ausculta/src/index";

/** Birleşik bar `steps.onSelect` kararı (T182): adım 0 mod seçimine döner; etkin oturumda
 *  (simulation ekranı) onay istenir; ileri/geçerli adım (index 1, 2) yok sayılır. */

describe("resolveStepSelect", () => {
  it("adım 0'ı etkin olmayan ekranlarda doğrudan gezinme olarak çözer", () => {
    expect(resolveStepSelect(0, "modes")).toBe("navigate");
    expect(resolveStepSelect(0, "learn")).toBe("navigate");
    expect(resolveStepSelect(0, "results")).toBe("navigate");
    expect(resolveStepSelect(0, "progress")).toBe("navigate");
  });
});

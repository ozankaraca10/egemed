import { describe, expect, it } from "vitest";
import { needsExitConfirm, resolveStepSelect } from "../../packages/sim-ausculta/src/index";

/** Birleşik bar `steps.onSelect` kararı (T182): adım 0 mod seçimine döner; etkin oturumda
 *  (simulation ekranı) onay istenir; ileri/geçerli adım (index 1, 2) yok sayılır. */

describe("resolveStepSelect", () => {
  it("adım 0'ı etkin olmayan ekranlarda doğrudan gezinme olarak çözer", () => {
    expect(resolveStepSelect(0, "modes")).toBe("navigate");
    expect(resolveStepSelect(0, "learn")).toBe("navigate");
    expect(resolveStepSelect(0, "results")).toBe("navigate");
    expect(resolveStepSelect(0, "progress")).toBe("navigate");
  });

  it("adım 0'ı etkin oturumda (simulation) onay isteği olarak çözer", () => {
    expect(resolveStepSelect(0, "simulation")).toBe("confirm");
  });

  it("mevcut adımı (current) veya ileri adımı (Çalışma=1, Tamamla=2) yok sayar", () => {
    expect(resolveStepSelect(1, "modes")).toBe("ignore");
    expect(resolveStepSelect(1, "simulation")).toBe("ignore");
    expect(resolveStepSelect(2, "results")).toBe("ignore");
  });
});

describe("needsExitConfirm", () => {
  it("yalnız simulation ekranında etkin oturum sayar", () => {
    expect(needsExitConfirm("simulation")).toBe(true);
    expect(needsExitConfirm("learn")).toBe(false);
    expect(needsExitConfirm("modes")).toBe(false);
    expect(needsExitConfirm("results")).toBe(false);
    expect(needsExitConfirm("tutorial")).toBe(false);
    expect(needsExitConfirm("start")).toBe(false);
    expect(needsExitConfirm("sources")).toBe(false);
    expect(needsExitConfirm("progress")).toBe(false);
  });
});

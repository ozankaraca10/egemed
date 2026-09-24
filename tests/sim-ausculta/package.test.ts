import { describe, expect, it } from "vitest";
import { SIMULATOR_IDS, isSimulatorId } from "../../packages/sim-host/src/index";
import type { SimulatorId } from "../../packages/sim-host/src/index";
import { DEFAULT_WEIGHTS, SIM_ID } from "../../packages/sim-ausculta/src/index";

describe("sim-ausculta paket sözleşmesi", () => {
  it("modül kimliği host kapalı birlik tipiyle uyumludur", () => {
    const id: SimulatorId = SIM_ID;
    expect(id).toBe("ausculta");
    expect(SIMULATOR_IDS).toContain(SIM_ID);
    expect(isSimulatorId(SIM_ID)).toBe(true);
  });

  it("çekirdek ağırlıkları dışa aktarır", () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      technique: 20,
      localization: 20,
      recognition: 25,
      interpretation: 20,
      diagnosis: 10,
      systematic: 5,
    });
  });
});

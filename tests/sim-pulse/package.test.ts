import { describe, expect, it } from "vitest";
import { SIMULATOR_IDS, isSimulatorId } from "../../packages/sim-host/src/index";
import type { SimulatorId } from "../../packages/sim-host/src/index";
import { SIM_ID } from "../../packages/sim-pulse/src/index";

describe("sim-pulse paket sözleşmesi", () => {
  it("modül kimliği host kapalı birlik tipiyle uyumludur", () => {
    const id: SimulatorId = SIM_ID;
    expect(id).toBe("pulse");
    expect(SIMULATOR_IDS).toContain(SIM_ID);
    expect(isSimulatorId(SIM_ID)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { JSON_FIXTURE } from "../../packages/sim-ausculta/src/index";

describe("JSON içe aktarma", () => {
  it("sentetik fixture resolveJsonModule ile derlenir", () => {
    expect(JSON_FIXTURE).toEqual({ id: "fx-1", label: "sentetik" });
  });
});

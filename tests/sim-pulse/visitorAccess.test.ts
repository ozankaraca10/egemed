import { describe, expect, it } from "vitest";
import { MODES } from "../../packages/sim-pulse/src/engine/shapes";
import {
  isVisitorUnlockedItem,
  VISITOR_UNLOCKED_LEARN_ITEMS,
} from "../../packages/sim-pulse/src/access/visitorAccess";

describe("Pulse ziyaretçi kilidi (visitorAccess)", () => {
  it("yalnız Normal sinüs ritmi, AF ve ST elevasyonlu MI'yi açık işaretler", () => {
    expect(VISITOR_UNLOCKED_LEARN_ITEMS).toEqual(["normal", "af", "stemi"]);
    expect(VISITOR_UNLOCKED_LEARN_ITEMS.every((id) => isVisitorUnlockedItem(id))).toBe(true);
  });

  it("açık kimlikler dışındaki tüm EKG sonuçlarını kilitli sayar", () => {
    const locked = MODES.filter((mode) => !VISITOR_UNLOCKED_LEARN_ITEMS.includes(mode));
    expect(locked.length).toBe(MODES.length - 3);
    for (const mode of locked) expect(isVisitorUnlockedItem(mode)).toBe(false);
  });

  it("bilinmeyen kimlikleri kilitli sayar", () => {
    expect(isVisitorUnlockedItem("bilinmeyen")).toBe(false);
    expect(isVisitorUnlockedItem("")).toBe(false);
  });
});

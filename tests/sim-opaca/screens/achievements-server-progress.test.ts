import { describe, expect, it } from "vitest";
import { applyServerBadgeProgress } from "../../../packages/sim-opaca/src/screens/AchievementsScreen";

describe("Opaca sunucu rozet ilerlemesi", () => {
  const badges = [
    { id: "explorer", state: "locked" as const, value: 0, max: 10, earnedLabel: null },
    { id: "first-step", state: "locked" as const, value: 0, max: 1, earnedLabel: null },
    { id: "no-progress", state: "progress" as const, value: 2, max: 4, earnedLabel: null },
  ];

  it("sunucu ilerlemesini uygular ve kazanılan rozeti tam gösterir", () => {
    expect(applyServerBadgeProgress(badges, {
      badges: [{ key: "first-step", awardedAt: "2026-09-24T12:00:00+03:00" }],
      badgeProgress: {
        explorer: { value: 7, max: 10 },
        "first-step": { value: 0, max: 1 },
      },
    })).toEqual([
      { ...badges[0], state: "progress", value: 7 },
      { ...badges[1], state: "earned", value: 1 },
      { ...badges[2], state: "locked", value: 0 },
    ]);
  });

  it("alan yoksa sunucu oturumu için önceki kilitli görünümü korur", () => {
    expect(applyServerBadgeProgress(badges, { badges: [] })).toEqual([
      { ...badges[0], state: "locked", value: 0 },
      { ...badges[1], state: "locked", value: 0 },
      { ...badges[2], state: "locked", value: 0 },
    ]);
  });
});

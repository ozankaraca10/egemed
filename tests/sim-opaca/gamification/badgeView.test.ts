import { describe, expect, it } from "vitest";
import { badgeViews, sortBadgeViews } from "../../../packages/gamification-core/src/badgeView";
import { trDate } from "../../../packages/gamification-core/src/time";
import { OPACA_BADGES, STUDY_KEY } from "../../../packages/sim-opaca/src/gamification/catalog";
import { computeStats } from "../../../packages/sim-opaca/src/gamification/stats";
import { LIBRARY_ITEMS } from "../../../packages/sim-opaca/src/data/terminology";
import { attempt } from "./helpers";

const now = new Date("2026-09-23T10:00:00Z");
const ctx = { now };

describe("rozet görünüm modeli", () => {
  it("her rozetin kısa koşulu var; çalışma anahtarları kütüphanede mevcut", () => {
    const views = badgeViews(OPACA_BADGES, computeStats([], { topics: [], items: {} }, [], now), [], ctx);
    expect(views).toHaveLength(OPACA_BADGES.length);
    expect(views.every((v) => v.rule.length > 0)).toBe(true);
    const keys = new Set(LIBRARY_ITEMS.map((i) => i.key));
    expect(Object.values(STUDY_KEY).every((k) => keys.has(k))).toBe(true);
    expect(views.every((v) => v.state === "locked")).toBe(true);
  });
  it("kazanılmış / devam eden / kilitli; Podyum ilerlemeli görünmez", () => {
    const stats = computeStats([attempt({ localizationHits: 7 })], { topics: [], items: {} }, [], now);
    const v = Object.fromEntries(
      badgeViews(OPACA_BADGES, stats, [{ id: "first-step", at: "2026-09-20T10:00:00Z" }], ctx).map((x) => [
        x.def.id,
        x,
      ]),
    );
    expect(v["first-step"]?.state).toBe("earned");
    expect(v["sharp-eye-1"]).toMatchObject({ state: "progress", value: 7, max: 10 });
    expect(v["perfect"]?.state).toBe("locked");
    expect(v["podium"]?.state).toBe("locked");
  });
  it("sıralama: en yeni kazanılan önce, sonra ilerleme oranı yüksek olan", () => {
    const stats = computeStats([attempt({ localizationHits: 20 })], { topics: [], items: {} }, [], now);
    const sorted = sortBadgeViews(
      badgeViews(
        OPACA_BADGES,
        stats,
        [
          { id: "first-step", at: "2026-09-01T00:00:00Z" },
          { id: "sharp-eye-1", at: "2026-09-20T00:00:00Z" },
        ],
        ctx,
      ),
    );
    expect(sorted.slice(0, 2).map((x) => x.def.id)).toEqual(["sharp-eye-1", "first-step"]);
    expect(sorted[2]?.state).toBe("progress");
  });
  it("TR tarih", () => {
    expect(trDate("2026-09-18T21:30:00Z")).toBe("19 Eyl 2026");
  });
});

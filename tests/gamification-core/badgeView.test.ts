import { describe, expect, it } from "vitest";
import {
  BADGE_CATEGORY_LABEL,
  BADGE_TIER_LABEL,
  badgeViews,
  sortBadgeViews,
} from "../../packages/gamification-core/src/badgeView";
import type { BadgeContext, BadgeDef } from "../../packages/gamification-core/src/badges";

interface TestState {
  hits: number;
  done: boolean;
}

type TestCtx = BadgeContext;

const badge = (id: string, p: Partial<BadgeDef<TestState, TestCtx>> = {}): BadgeDef<TestState, TestCtx> => ({
  id,
  category: "skill",
  name: id,
  description: id,
  ...p,
});

const a = badge("a", { rule: "10 isabet", progress: (s) => ({ value: s.hits, max: 10 }) });
const b = badge("b", { category: "milestone", rule: "İlk oturum", predicate: (s) => s.done });
const c = badge("c", { category: "learn", studyKey: "technique.basics", progress: (s) => ({ value: s.hits, max: 20 }) });
const d = badge("d", { category: "milestone", predicate: (s) => s.done });
const e = badge("e", { category: "milestone" });

const CATALOG: BadgeDef<TestState, TestCtx>[] = [a, b, c, d, e];
const ctx: TestCtx = { now: new Date("2026-09-23T10:00:00.000Z") };

describe("rozet görünüm modeli", () => {
  it("kategori/tier etiketleri Türkçe", () => {
    expect(Object.keys(BADGE_CATEGORY_LABEL)).toEqual(["topic", "skill", "streak", "learn", "milestone"]);
    expect(BADGE_TIER_LABEL).toEqual({ bronze: "Bronz", silver: "Gümüş", gold: "Altın" });
  });

  it("hiçbiri kazanılmamışsa tümü kilitli; kısa koşul/çalışma anahtarı katalogdan gelir", () => {
    const views = badgeViews(CATALOG, { hits: 0, done: false }, [], ctx);
    expect(views).toHaveLength(CATALOG.length);
    expect(views.every((v) => v.state === "locked")).toBe(true);
    expect(views[0]?.rule).toBe("10 isabet");
    expect(views[0]?.studyKey).toBeNull();
    expect(views[2]?.studyKey).toBe("technique.basics");
    expect(views[4]?.rule).toBe(""); // kısa koşul yoksa boş
    expect(views[4]?.max).toBe(1); // asla kazanılamayan tanım 0/1
  });

  it("kazanılmış / devam eden / kilitli; değer max'a kırpılır", () => {
    const views = badgeViews(CATALOG, { hits: 12, done: true }, [{ id: "b", at: "2026-09-20T00:00:00.000Z" }], ctx);
    const byId = Object.fromEntries(views.map((v) => [v.def.id, v]));
    expect(byId.b).toMatchObject({ state: "earned", value: 1, max: 1, earnedAt: "2026-09-20T00:00:00.000Z" });
    expect(byId.a).toMatchObject({ state: "progress", value: 10, max: 10 });
    expect(byId.c).toMatchObject({ state: "progress", value: 12, max: 20 });
    expect(byId.e).toMatchObject({ state: "locked", value: 0, max: 1 });
  });

  it("sıralama: en yeni kazanılan önce, sonra ilerleme oranı yüksek olan, sonra kilitliler", () => {
    const earned = [
      { id: "d", at: "2026-09-22T00:00:00.000Z" },
      { id: "b", at: "2026-09-20T00:00:00.000Z" },
    ];
    const sorted = sortBadgeViews(badgeViews(CATALOG, { hits: 8, done: true }, earned, ctx));
    expect(sorted.map((v) => v.def.id)).toEqual(["d", "b", "a", "c", "e"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  BADGE_CATEGORY_LABEL,
  BADGE_TIER_LABEL,
  badgeViews,
  sortBadgeViews,
  sortBadgesByDifficulty,
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
    expect(Object.keys(BADGE_CATEGORY_LABEL)).toEqual(["topic", "skill", "streak", "learn", "milestone", "challenge"]);
    expect(BADGE_CATEGORY_LABEL.challenge).toBe("Meydan Okuma");
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

describe("sortBadgesByDifficulty — kolaydan zora rozet sıralaması", () => {
  const fixed = (max: number): ((s: TestState) => { value: number; max: number }) => () => ({ value: 0, max });

  const bronze1 = badge("bronze1", { tier: "bronze", progress: fixed(100) });
  const silver1 = badge("silver1", { tier: "silver", progress: fixed(5) });
  const gold1 = badge("gold1", { tier: "gold", progress: fixed(1) });
  const untieredEasy = badge("untiered-easy", { progress: fixed(2) });
  const untieredHard = badge("untiered-hard", { progress: fixed(50) });
  const untieredTieA = badge("untiered-tie-a", { progress: fixed(10) });
  const untieredTieB = badge("untiered-tie-b", { progress: fixed(10) });

  const DIFFICULTY_CATALOG: BadgeDef<TestState, TestCtx>[] = [
    bronze1, silver1, gold1, untieredEasy, untieredHard, untieredTieA, untieredTieB,
  ];

  it("önce kademe (bronz<gümüş<altın; kademesizler bronz sayılır), sonra eşik artan", () => {
    const sorted = sortBadgesByDifficulty(badgeViews(DIFFICULTY_CATALOG, { hits: 0, done: false }, [], ctx));
    expect(sorted.map((v) => v.def.id)).toEqual([
      "untiered-easy", // kademe 0 (kademesiz), eşik 2
      "untiered-tie-a", // kademe 0, eşik 10 — katalog sırası
      "untiered-tie-b",
      "untiered-hard", // kademe 0, eşik 50
      "bronze1", // kademe 0, eşik 100
      "silver1", // kademe 1
      "gold1", // kademe 2
    ]);
  });

  it("eşitlikte katalog sırası korunur (kararlı sıralama)", () => {
    const sorted = sortBadgesByDifficulty(badgeViews(DIFFICULTY_CATALOG, { hits: 0, done: false }, [], ctx));
    const tieIds = sorted.filter((v) => v.def.id.startsWith("untiered-tie")).map((v) => v.def.id);
    expect(tieIds).toEqual(["untiered-tie-a", "untiered-tie-b"]);
  });

  it("durumdan (kazanılmış/ilerleyen/kilitli) bağımsızdır", () => {
    const noneEarned = sortBadgesByDifficulty(badgeViews(DIFFICULTY_CATALOG, { hits: 0, done: false }, [], ctx));
    const someEarned = sortBadgesByDifficulty(
      badgeViews(DIFFICULTY_CATALOG, { hits: 0, done: false }, [{ id: "untiered-hard", at: ctx.now.toISOString() }], ctx),
    );
    expect(someEarned.map((v) => v.def.id)).toEqual(noneEarned.map((v) => v.def.id));
  });

  it("saf fonksiyondur: girdi dizisini değiştirmez", () => {
    const views = badgeViews(DIFFICULTY_CATALOG, { hits: 0, done: false }, [], ctx);
    const original = views.map((v) => v.def.id);
    sortBadgesByDifficulty(views);
    expect(views.map((v) => v.def.id)).toEqual(original);
  });
});

describe("capstone görünümü", () => {
  const normal1 = badge("normal-1", { progress: (s) => ({ value: s.hits, max: 3 }) });
  const normal2 = badge("normal-2", { progress: (s) => ({ value: s.hits, max: 10 }) });
  const never = badge("never", { category: "milestone" });
  const capstone = badge("capstone", { category: "milestone", tier: "gold", rule: "2 rozetin tümü", capstone: true });
  const CATALOG: BadgeDef<TestState, TestCtx>[] = [normal1, normal2, never, capstone];
  const at = (id: string) => ({ id, at: "2026-09-20T00:00:00.000Z" });

  it("ilerleme capstone-dışı kazanılabilir rozetlerden sayılır; kazanılamayan rozet sayılmaz", () => {
    const partial = badgeViews(CATALOG, { hits: 10, done: false }, [at("normal-1")], ctx).at(-1);
    expect(partial).toMatchObject({ state: "progress", value: 1, max: 2 });
    const earned = badgeViews(CATALOG, { hits: 10, done: false }, [at("normal-1"), at("normal-2"), at("capstone")], ctx).at(-1);
    expect(earned).toMatchObject({ state: "earned", value: 2, max: 2, earnedAt: "2026-09-20T00:00:00.000Z" });
  });

  it("kolaydan zora sıralamada capstone her zaman en sonda", () => {
    const sorted = sortBadgesByDifficulty(badgeViews(CATALOG, { hits: 10, done: false }, [], ctx));
    expect(sorted.map((v) => v.def.id).at(-1)).toBe("capstone");
  });
});

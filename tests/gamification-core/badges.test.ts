import { describe, expect, it } from "vitest";
import {
  badgeProgress,
  evaluateBadges,
  isBadgeEarned,
  type BadgeContext,
  type BadgeDef,
} from "../../packages/gamification-core/src/badges";

/** Sentetik sim durumu — çekirdek testleri Opaca kataloğuna/terminolojisine bağlı değildir. */
interface TestState {
  hits: number;
  score: number;
  collections: Record<string, string[]>;
}

interface TestCtx extends BadgeContext {
  bonus: number;
}

const ctx = (nowIso: string, bonus = 0): TestCtx => ({ now: new Date(nowIso), bonus });

const first: BadgeDef<TestState, TestCtx> = {
  id: "first",
  category: "milestone",
  name: "İlk Oturum",
  description: "İlk oturumu tamamla.",
  rule: "İlk oturum",
  predicate: (s) => s.score > 0,
};

const hits10: BadgeDef<TestState, TestCtx> = {
  id: "hits-10",
  category: "skill",
  tier: "bronze",
  name: "İsabet",
  description: "10 isabet.",
  rule: "10 isabet",
  studyKey: "technique.basics",
  progress: (s) => ({ value: s.hits, max: 10 }),
};

const hits25: BadgeDef<TestState, TestCtx> = {
  id: "hits-25",
  category: "skill",
  tier: "silver",
  name: "İsabet",
  description: "25 isabet.",
  progress: (s) => ({ value: s.hits, max: 25 }),
};

const bonus: BadgeDef<TestState, TestCtx> = {
  id: "bonus",
  category: "learn",
  name: "Bonus",
  description: "ctx'ten gelen bonusla eşik.",
  predicate: (s, c) => s.hits + c.bonus >= 100,
};

const collector: BadgeDef<TestState, TestCtx> = {
  id: "collector",
  category: "learn",
  name: "Koleksiyoncu",
  description: "Bir koleksiyonu tamamla.",
  progress: (s) => ({ value: s.collections.reading?.length ?? 0, max: 1 }),
};

const veto: BadgeDef<TestState, TestCtx> = {
  id: "veto",
  category: "milestone",
  name: "Veto",
  description: "predicate önceliklidir.",
  predicate: () => false,
  progress: () => ({ value: 10, max: 10 }),
};

const demo: BadgeDef<TestState, TestCtx> = {
  id: "demo",
  category: "milestone",
  name: "Demo",
  description: "v1'de kazanılamaz.",
};

const topicBadge: BadgeDef<TestState, TestCtx> = {
  id: "topic-1",
  category: "topic",
  name: "Konu",
  description: "Konu rozeti.",
  progress: (s) => ({ value: s.hits, max: 5 }),
};

const streakBadge: BadgeDef<TestState, TestCtx> = {
  id: "streak-1",
  category: "streak",
  name: "Seri",
  description: "3 günlük seri.",
  predicate: (s) => s.hits >= 3,
};

const CATALOG: BadgeDef<TestState, TestCtx>[] = [first, hits10, hits25, bonus, collector, veto, demo, topicBadge, streakBadge];

const state = (p: Partial<TestState> = {}): TestState => ({ hits: 0, score: 0, collections: {}, ...p });
const nowIso = "2026-09-23T10:00:00.000Z";
const ids = (xs: { id: string }[]): string[] => xs.map((x) => x.id);

describe("rozet motoru (jenerik katalog)", () => {
  it("katalog: benzersiz kimlik, kategoriler tanımlı", () => {
    expect(new Set(ids(CATALOG)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((b) => b.category))).toEqual(new Set(["topic", "skill", "streak", "learn", "milestone"]));
  });

  it("eşik tam sınırda: 9 → kazanılmaz, 10 → kazanılır", () => {
    expect(ids(evaluateBadges(CATALOG, state({ hits: 9 }), [], ctx(nowIso)))).not.toContain("hits-10");
    expect(ids(evaluateBadges(CATALOG, state({ hits: 10 }), [], ctx(nowIso)))).toContain("hits-10");
  });

  it("predicate önceliklidir; predicate yoksa progress tamamlanması kazanır", () => {
    const got = ids(evaluateBadges(CATALOG, state({ hits: 10 }), [], ctx(nowIso)));
    expect(got).toContain("hits-10");
    expect(got).not.toContain("veto"); // progress 10/10 olsa bile predicate false
    expect(isBadgeEarned(veto, state(), ctx(nowIso))).toBe(false);
  });

  it("asla kazanılamayan tanım (predicate ve progress yok) kilitli kalır", () => {
    const got = evaluateBadges(CATALOG, state({ hits: 100, score: 100 }), [], ctx(nowIso));
    expect(ids(got)).not.toContain("demo");
    expect(badgeProgress(demo, state({ hits: 100 }), ctx(nowIso))).toEqual({ value: 0, max: 1 });
  });

  it("kazanım zamanı ctx.now'dur; yalnız YENİ kazanılanlar döner", () => {
    const prev = [{ id: "first", at: "2026-09-01T00:00:00.000Z" }];
    const again = evaluateBadges(CATALOG, state({ score: 90, hits: 10 }), prev, ctx(nowIso));
    expect(ids(again)).not.toContain("first");
    expect(again.find((e) => e.id === "hits-10")?.at).toBe(nowIso);
  });

  it("ctx sim alanlarını predicate'e taşır", () => {
    expect(ids(evaluateBadges(CATALOG, state({ hits: 90 }), [], ctx(nowIso, 9)))).not.toContain("bonus");
    expect(ids(evaluateBadges(CATALOG, state({ hits: 90 }), [], ctx(nowIso, 10)))).toContain("bonus");
  });

  it("jenerik koleksiyonlar: items anahtar uzayı sim'in elinde", () => {
    const withReading = evaluateBadges(CATALOG, state({ collections: { reading: ["r1"] } }), [], ctx(nowIso));
    expect(ids(withReading)).toContain("collector");
    const otherKey = evaluateBadges(CATALOG, state({ collections: { modules: ["m1"] } }), [], ctx(nowIso));
    expect(ids(otherKey)).not.toContain("collector");
  });

  it("progress görünümü: tanımdan gelir, yoksa kazanımdan 0/1 türetilir", () => {
    expect(badgeProgress(hits10, state({ hits: 7 }), ctx(nowIso))).toEqual({ value: 7, max: 10 });
    expect(badgeProgress(first, state({ score: 5 }), ctx(nowIso))).toEqual({ value: 1, max: 1 });
    expect(badgeProgress(first, state(), ctx(nowIso))).toEqual({ value: 0, max: 1 });
  });
});
